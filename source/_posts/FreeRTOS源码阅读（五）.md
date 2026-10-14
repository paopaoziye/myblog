---
title: FreeRTOS源码阅读（五）
toc: true
indent: true
top: false
comments: true
archive: true
cover: false
mathjax: false
pin: false
top_meta: false
bottom_meta: false
sidebar:
  - toc
tags:
  - FreeRTOS
categories: RTOS
updated: ''
img: /medias/featureimages/38.webp
date: 2026-09-25 17:05:05
keywords:
summary: FreeRTOS调度器实现
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（五）
#### 调度器实现
**①引言**
>**概述**：`FreeRTOS`调度器通过维护**当前任务**、**任务列表**、**系统时钟**以及**调度状态**等全局信息，决定哪个任务获得`CPU`运行
{%list%}
FreeRTOS提供vTaskSuspendAll和xTaskResumeAll用于挂起和恢复任务调度，本质上是内核软件层面的约定，如下所示
{%endlist%}
>`vTaskSuspendAll`仅递增`uxSchedulerSuspended`，相关`API`若检测到`uxSchedulerSuspended`不为`0`则会处理**另一套逻辑**

>`xTaskResumeAll`递减`uxSchedulerSuspended`并在其为`0`时正式**恢复调度**并统一处理**调度暂停期间**累计的调度事件

>具体为将`xPendingReadyList`中的任务**迁回就绪列表**、补处理`xPendedTicks`，并根据`xYieldPendings`决定是否**重新调度**
{%right%}
vTaskSuspendAll用于提供一种不长时间屏蔽中断的调度级互斥机制，在保证内核任务状态一致性的同时维持中断响应能力
{%endright%}
{%warning%}
调度器挂起期间中断仍可正常响应，因此ISR产生的任务唤醒和系统Tick不会丢失，而是暂存后在恢复调度时统一处理
{%endwarning%}
{%wrong%}
vTaskSuspendAll并不能代替临界区，若共享数据还可能被ISR并发访问，仍需要使用taskENTER_CRITICAL等中断保护机制
{%endwrong%}
```c
portDONT_DISCARD PRIVILEGED_DATA TCB_t * volatile pxCurrentTCB = NULL;                               // 单核调度器当前正在运行或启动前选定的任务
PRIVILEGED_DATA STATIC volatile UBaseType_t uxCurrentNumberOfTasks = ( UBaseType_t ) 0U;             // 内核当前登记的任务总数
PRIVILEGED_DATA STATIC volatile TickType_t xTickCount = ( TickType_t ) configINITIAL_TICK_COUNT;     // 系统 tick 计数，按无符号类型自然回绕
PRIVILEGED_DATA STATIC volatile UBaseType_t uxTopReadyPriority = tskIDLE_PRIORITY;                   // 当前非空就绪链表中的最高优先级提示
PRIVILEGED_DATA STATIC volatile BaseType_t xSchedulerRunning = pdFALSE;                              // 标记调度器是否已经启动
PRIVILEGED_DATA STATIC volatile TickType_t xPendedTicks = ( TickType_t ) 0U;                         // 调度器挂起期间累积、待恢复处理的 tick 数
PRIVILEGED_DATA STATIC volatile BaseType_t xYieldPendings[ configNUMBER_OF_CORES ] = { pdFALSE };    // 每个核心尚待处理的任务切换请求
PRIVILEGED_DATA STATIC volatile BaseType_t xNumOfOverflows = ( BaseType_t ) 0;                       // tick 计数回绕次数，用于扩展时间关系判断
PRIVILEGED_DATA STATIC UBaseType_t uxTaskNumber = ( UBaseType_t ) 0U;                                // 任务创建和删除事件序号，供调试器及跟踪设施感知变化
PRIVILEGED_DATA STATIC volatile TickType_t xNextTaskUnblockTime = ( TickType_t ) 0U;                 // 当前延时链表中最早的解除阻塞时刻
PRIVILEGED_DATA STATIC TaskHandle_t xIdleTaskHandles[ configNUMBER_OF_CORES ];                       // 每个核心对应的空闲任务句柄
STATIC const volatile UBaseType_t uxTopUsedPriority = configMAX_PRIORITIES - 1U;                     // 向 OpenOCD 暴露需要扫描的最高优先级链表下标
PRIVILEGED_DATA STATIC volatile UBaseType_t uxSchedulerSuspended = ( UBaseType_t ) 0U;               // 调度器挂起嵌套计数，更新需同时受任务锁和 ISR 锁保护
```
```c
/*
 * 函数功能：
 * 递增可嵌套的调度器暂停计数；SMP 下按规定锁序同步任务、ISR 与跨核调度状态
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void vTaskSuspendAll( void )
{
    // 单核可直接增加挂起计数，多核需按任务锁和 ISR 锁顺序同步各核心
    #if ( configNUMBER_OF_CORES == 1 )
    {
        // 单核使用非零嵌套计数表示调度暂停，每次调用增加一层
        uxSchedulerSuspended = ( UBaseType_t ) ( uxSchedulerSuspended + 1U );
    }
    #else
    {
        /* 如果是多核先屏蔽相关中断并按固定顺序获取任务锁和 ISR 锁，处理必要的运行状态变更后递增 uxSchedulerSuspended，最后恢复原中断状态，此处略 */
    }
    #endif
}
```
```c
/*
 * 函数功能：
 * 撤销一层调度器暂停，并在最外层恢复时迁移待就绪任务、补记挂起 Tick 与执行必要调度
 *
 * 参数：
 * 无
 *
 * 返回值：
 * pdTRUE   恢复过程中已触发或确认需要抢占式让出
 * pdFALSE  未发生上述让出
 */
BaseType_t xTaskResumeAll( void )
{
    // 指向本轮从待就绪链表取出的任务，非空也用于判断是否需重算唤醒时刻
    TCB_t * pxTCB = NULL;
    // 记录恢复调度器时是否已处理抢占式让出
    BaseType_t xAlreadyYielded = pdFALSE;

    // 多核构建只在调度器已运行时执行暂停计数和跨核心锁的恢复
    #if ( configNUMBER_OF_CORES > 1 )
        // SMP 仅在调度器运行期间执行锁配对和暂停计数结算
        if( xSchedulerRunning != pdFALSE )
    #endif
    {
        // 临界区保护暂停计数、待就绪链表和挂起 Tick 的统一结算
        taskENTER_CRITICAL();
        {
            // 保存执行恢复流程的当前核心编号
            const BaseType_t xCoreID = ( BaseType_t ) portGET_CORE_ID();

            // 恢复调用必须与至少一层暂停调用配对
            configASSERT( uxSchedulerSuspended != 0U );

            // 撤销本次对应的一层调度暂停
            uxSchedulerSuspended = ( UBaseType_t ) ( uxSchedulerSuspended - 1U );

            // 释放暂停期间保持的任务锁，允许其他核心继续处理调度状态，单核不用处理
            portRELEASE_TASK_LOCK( xCoreID );

            // 仅最外层恢复才可以迁移链表和补处理 Tick
            if( uxSchedulerSuspended == ( UBaseType_t ) 0U )
            {
                // 系统中存在任务时才执行恢复工作
                if( uxCurrentNumberOfTasks > ( UBaseType_t ) 0U )
                {
                    // 逐个把 xPendingReadyList 暂存的待就绪任务迁移回状态就绪链表
                    while( listLIST_IS_EMPTY( &xPendingReadyList ) == pdFALSE )
                    {
                        // 从待就绪链表队首取得目标 TCB
                        pxTCB = listGET_OWNER_OF_HEAD_ENTRY( ( &xPendingReadyList ) );

                        // 解除事件节点在待就绪链表中的归属
                        listREMOVE_ITEM( &( pxTCB->xEventListItem ) );
                        // 内存屏障保证事件链表移除先于状态链表与就绪链表更新
                        portMEMORY_BARRIER();
                        // 从原状态链表摘除任务，避免一个状态节点同时属于两个链表
                        listREMOVE_ITEM( &( pxTCB->xStateListItem ) );

                        // 将解除等待后的任务按优先级插入就绪链表
                        prvAddTaskToReadyList( pxTCB );

                        // 单核在待就绪任务优先级超过当前任务时记录让出请求，多核已在唤醒时选择核心
                        #if ( configNUMBER_OF_CORES == 1 )
                        {
                            // 单核下新就绪任务优先级更高时挂起让出请求
                            if( pxTCB->uxPriority > pxCurrentTCB->uxPriority )
                            {
                                xYieldPendings[ xCoreID ] = pdTRUE;
                            }
                            else
                            {
                            }
                        }
                        #else
                        {
                            // SMP 在任务进入待就绪链表时已选择让出核心，此处无需重复请求
                        }
                        #endif
                    }

                    // 至少迁移过一个任务时，原缓存的最近唤醒时刻可能已经失效
                    if( pxTCB != NULL )
                    {
                        // 待就绪任务已迁移，重新计算延时链表最近唤醒时刻
                        prvResetNextTaskUnblockTime();
                    }

                    {
                        // 对 volatile 挂起 Tick 取本地快照，逐个执行正常 Tick 语义
                        TickType_t xPendedCounts = xPendedTicks;

                        // 暂停期间积累了 Tick 时逐次推进调度时间和唤醒超时任务
                        if( xPendedCounts > ( TickType_t ) 0U )
                        {
                            do
                            {
                                // 每个挂起 Tick 都复用 xTaskIncrementTick 的完整处理路径
                                if( xTaskIncrementTick() != pdFALSE )
                                {
                                    // Tick 处理要求调度时挂起本核心让出，由恢复尾部统一兑现
                                    xYieldPendings[ xCoreID ] = pdTRUE;
                                }
                                else
                                {

                                }

                                // 消耗一个本地挂起 Tick，直到快照归零
                                --xPendedCounts;
                            } while( xPendedCounts > ( TickType_t ) 0U );

                            // 全部补处理完成后清零共享挂起 Tick 计数
                            xPendedTicks = 0;
                        }
                        else
                        {
                        }
                    }

                    // 当前核心存在待让出请求时，按编译配置记录并执行抢占
                    if( xYieldPendings[ xCoreID ] != pdFALSE )
                    {
                        // 抢占功能开启时才把待让出标志兑现为调度请求
                        #if ( configUSE_PREEMPTION != 0 )
                        {
                            xAlreadyYielded = pdTRUE;
                        }
                        #endif

                        // 单核在退出恢复流程前直接触发本核让出，多核通过已保存的核心请求处理
                        #if ( configNUMBER_OF_CORES == 1 )
                        {
                            taskYIELD_TASK_CORE_IF_USING_PREEMPTION( pxCurrentTCB );
                        }
                        #endif
                    }
                    else
                    {
                    }
                }
            }
            else
            {
            }
        }
        // 退出临界区，结束本层恢复操作
        taskEXIT_CRITICAL();
    }

    // 返回调用者是否还需自行触发让出
    return xAlreadyYielded;
}
```
**②启动调度**
>**概述**：`FreeRTOS`提供`vTaskStartScheduler`启动调度器，主要负责**创建空闲任务**、**初始化调度状态**并**启动第一个任务**
{%list%}
空闲任务是调度器启动时自动创建的最低优先级系统任务，当没有其他就绪任务可运行时占用CPU，并负责部分后台维护工作
{%endlist%}
{%right%}
空闲任务主要负责回收已删除任务的资源、执行空闲钩子，并在启用Tickless Idle时评估空闲时长并协调系统进入低功耗状态
{%endright%}
{%warning%}
在启动第一个任务前需要暂时关闭中断，防止Tick中断提前触发调度，保证调度器从初始化状态安全切换到任务运行状态
{%endwarning%}
```c
/*
 * 函数功能：
 * 创建内核必需任务并初始化调度状态、运行时统计与端口层 Tick，随后把执行权交给端口调度器
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void vTaskStartScheduler( void )
{
    // 保存空闲任务和可选定时器任务的创建结果
    BaseType_t xReturn;

    /* 启用多核以及亲和性时，需要检查 UBaseType_t 位宽是否足以表示所有 CPU 核心，此处略 */

    // 先创建每核必需的空闲任务，失败时不再继续启动
    xReturn = prvCreateIdleTasks();

    /* 如果启用了软件定时器，还需要创建软件定时器守护任务，此处略 */

    // 所有内核必需任务就绪后才初始化并进入端口调度器
    if( xReturn == pdPASS )
    {
        /* 如果配置了 FREERTOS_TASKS_C_ADDITIONS_INIT 宏，执行用户提供的初始化钩子函数，此处略 */

        // 禁止 Tick 在端口调度器完成首任务上下文恢复前到达
        portDISABLE_INTERRUPTS();

        /* 如果启用了 C 运行库 TLS ，切换到对应环境，使得任务拥有独立的线程局部存储 */

        // 初始没有已知的更早阻塞唤醒时刻
        xNextTaskUnblockTime = portMAX_DELAY;

        // 标记调度器已进入运行态，并恢复配置的初始 tick 值
        xSchedulerRunning = pdTRUE;
        xTickCount = ( TickType_t ) configINITIAL_TICK_COUNT;

        // 配置运行时间统计所需的端口计时基准
        portCONFIGURE_TIMER_FOR_RUN_TIME_STATS();

        // 由端口层建立 Tick 中断并恢复首任务上下文，正常端口通常不返回
        ( void ) xPortStartScheduler();
    }
    else
    {
        // 创建必需任务失败时以断言暴露内存不足启动失败
        configASSERT( xReturn != errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY );
    }

    // 保留空闲任务句柄符号引用，兼容关闭查询接口的构建
    ( void ) xIdleTaskHandles;

    // 保留最高使用优先级符号，供 OpenOCD 线程调试读取
    ( void ) uxTopUsedPriority;
}
```
```c
/*
 * 函数功能：
 * 为每个处理器核心创建内核空闲任务，配置静态或动态存储，并在 SMP 启动前建立每核当前任务与亲和关系
 *
 * 参数：
 * 无
 *
 * 返回值：
 * pdPASS  所有核心的空闲任务均创建成功
 * pdFAIL  至少一个空闲任务创建失败
 */
STATIC BaseType_t prvCreateIdleTasks( void )
{
    // 保存逐核创建空闲任务的总体结果
    BaseType_t xReturn = pdPASS;
    // 标识当前正在创建空闲任务的核心
    BaseType_t xCoreID;
    // 保存基础空闲任务名以及 SMP 核心编号后缀
    char cIdleName[ configMAX_TASK_NAME_LEN ] = { 0 };
    // 根据核心编号选择主动或被动空闲任务入口
    TaskFunction_t pxIdleTaskFunction = NULL;
    // 记录基础任务名的有效字符末端
    UBaseType_t xIdleTaskNameIndex;

    // 在预留核心后缀和终止符的范围内复制配置的空闲任务名
    for( xIdleTaskNameIndex = 0U; xIdleTaskNameIndex < ( configMAX_TASK_NAME_LEN - taskRESERVED_TASK_NAME_LENGTH ); xIdleTaskNameIndex++ )
    {

        // 逐字符复制配置名称，目标数组边界由循环上限约束
        cIdleName[ xIdleTaskNameIndex ] = configIDLE_TASK_NAME[ xIdleTaskNameIndex ];

        // 遇到源字符串终止符后停止复制
        if( cIdleName[ xIdleTaskNameIndex ] == ( char ) 0x00 )
        {
            break;
        }
        else
        {
        }
    }

    // 即使配置名称达到复制上限，也显式补上字符串终止符
    cIdleName[ xIdleTaskNameIndex ] = '\0';

    // 每个核心都需要一个最低优先级空闲任务作为无其他任务可运行时的后备
    for( xCoreID = ( BaseType_t ) 0; xCoreID < ( BaseType_t ) configNUMBER_OF_CORES; xCoreID++ )
    {
        // 单核只有主动空闲入口，多核按核心编号区分主动与被动空闲入口
        #if ( configNUMBER_OF_CORES == 1 )
        {
            // 单核仅创建承担资源回收和低功耗协调的主动空闲任务
            pxIdleTaskFunction = &prvIdleTask;
        }
        #else 
        {
            // SMP 核心 0 使用主动空闲入口，其余核心使用被动空闲入口
            if( xCoreID == 0 )
            {
                pxIdleTaskFunction = &prvIdleTask;
            }
            else
            {
                pxIdleTaskFunction = &prvPassiveIdleTask;
            }
        }
        #endif

        /* 如果启用了多核，还需要给每个核心的空闲任务名称追加核心编号以区分各个核心的任务，此处略 */

        // configSUPPORT_STATIC_ALLOCATION 为 1 时通过内存回调取得静态 TCB 和栈
        // 该回调可由应用提供，也可在配置允许时由内核提供默认实现
        #if ( configSUPPORT_STATIC_ALLOCATION == 1 )
        {
            // 接收内存回调返回的空闲任务 TCB 存储区
            StaticTask_t * pxIdleTaskTCBBuffer = NULL;
            // 接收内存回调返回的空闲任务栈存储区
            StackType_t * pxIdleTaskStackBuffer = NULL;
            // 接收内存回调返回的空闲任务栈深度
            configSTACK_DEPTH_TYPE uxIdleTaskStackSize;

            // 单核使用主动空闲任务内存回调，多核按核心类型选择对应回调
            #if ( configNUMBER_OF_CORES == 1 )
            {
                // 单核取得主动空闲任务的静态 TCB、栈和栈深度
                vApplicationGetIdleTaskMemory( &pxIdleTaskTCBBuffer, &pxIdleTaskStackBuffer, &uxIdleTaskStackSize );
            }
            #else
            {
                // 当前是否正在创建核心 0 的空闲任务
                if( xCoreID == 0 )
                {
                    // SMP 核心 0 仍使用主动空闲任务静态内存回调
                    vApplicationGetIdleTaskMemory( &pxIdleTaskTCBBuffer, &pxIdleTaskStackBuffer, &uxIdleTaskStackSize );
                }
                else
                {
                    // 其余核心按从零开始的被动核心索引取得各自静态内存
                    vApplicationGetPassiveIdleTaskMemory( &pxIdleTaskTCBBuffer, &pxIdleTaskStackBuffer, &uxIdleTaskStackSize, ( BaseType_t ) ( xCoreID - 1 ) );
                }
            }
            #endif
            // 用静态内存创建当前核心的空闲任务并保存句柄
            xIdleTaskHandles[ xCoreID ] = xTaskCreateStatic( pxIdleTaskFunction,
                                                             cIdleName,
                                                             uxIdleTaskStackSize,
                                                             ( void * ) NULL,
                                                             portPRIVILEGE_BIT,
                                                             pxIdleTaskStackBuffer,
                                                             pxIdleTaskTCBBuffer );

            // 静态创建通过返回的任务句柄判断成功或失败
            if( xIdleTaskHandles[ xCoreID ] != NULL )
            {
                xReturn = pdPASS;
            }
            else
            {
                xReturn = pdFAIL;
            }
        }
        #else
        {
            // 动态创建当前核心的空闲任务，并保存创建结果和句柄
            xReturn = xTaskCreate( pxIdleTaskFunction,
                                   cIdleName,
                                   configMINIMAL_STACK_SIZE,
                                   ( void * ) NULL,
                                   portPRIVILEGE_BIT,
                                   &xIdleTaskHandles[ xCoreID ] );
        }
        #endif

        // 任一核心创建失败后停止，调用者不会启动不完整的调度器
        if( xReturn != pdPASS )
        {
            break;
        }
        else
        {
            /* 如果启用了多核，初始化各核心对应的空闲任务，并设置每个核心的当前任务指针及可选核心亲和性，此处略 */
        }
    }
    // 向调度器启动流程返回全部空闲任务的创建结果
    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 执行内核主动空闲任务：回收自删除任务资源、按配置让出、调用空闲钩子并协调 Tickless 低功耗入口
 *
 * 参数：
 * pvParameters  输入任务入口参数，本实现不使用
 *
 * 返回值：
 * 无返回值，此任务按配置无限循环
 */
STATIC portTASK_FUNCTION( prvIdleTask,
                          pvParameters )
{

    // 主动空闲任务不使用创建时参数
    ( void ) pvParameters;

    // 为可能由空闲任务回收的安全上下文准备最小安全栈资源
    portALLOCATE_SECURE_CONTEXT( configMINIMAL_SECURE_STACK_SIZE );

    // 多核配置下，主动空闲任务还需参与跨核任务清理
    #if ( configNUMBER_OF_CORES > 1 )
    {
        // SMP 各核心以空闲任务启动，首次让出使应用任务进入运行选择
        taskYIELD();
    }
    #endif

    // 持续执行资源回收、让出、钩子和低功耗协调
    for( ; configCONTROL_INFINITE_LOOP(); )
    {

        // 回收自删除任务留在待终止链表中的 TCB、栈及附属资源
        prvCheckTasksWaitingTermination();

        // 关闭抢占时，主动空闲任务必须主动让出处理器
        #if ( configUSE_PREEMPTION == 0 )
        {
            // 协作式调度下每轮主动让出，允许其他就绪任务运行
            taskYIELD();
        }
        #endif

        // 抢占开启且配置空闲任务让出时，允许同优先级任务先执行
        #if ( ( configUSE_PREEMPTION == 1 ) && ( configIDLE_SHOULD_YIELD == 1 ) )
        {

            // 同优先级存在额外非空闲任务时提前让出本时间片
            if( listCURRENT_LIST_LENGTH( &( pxReadyTasksLists[ tskIDLE_PRIORITY ] ) ) > ( UBaseType_t ) configNUMBER_OF_CORES )
            {
                taskYIELD();
            }
            else
            {
            }
        }
        #endif

        // 启用空闲钩子时，在空闲循环中调用应用提供的钩子函数
        #if ( configUSE_IDLE_HOOK == 1 )
        {

            // 执行应用空闲钩子，调用者必须遵守空闲任务不可阻塞的约束
            vApplicationIdleHook();
        }
        #endif

        // 任意非零 Tickless 配置都编译低功耗判断，不限于配置值 1
        #if ( configUSE_TICKLESS_IDLE != 0 )
        {
            // 保存两阶段估算得到的可连续空闲 Tick 数
            TickType_t xExpectedIdleTime;

            // 先无锁粗略估算，避免每次空闲循环都暂停和恢复调度器
            xExpectedIdleTime = prvGetExpectedIdleTime();

            // 粗估达到配置阈值后才进入受保护的精确确认阶段
            if( xExpectedIdleTime >= ( TickType_t ) configEXPECTED_IDLE_TIME_BEFORE_SLEEP )
            {
                // 暂停调度器以冻结任务状态链表，再重新计算可睡眠时长
                vTaskSuspendAll();
                {
                    // 暂停后最近唤醒 Tick 不应早于当前 Tick，再据此取得稳定空闲窗口
                    configASSERT( xNextTaskUnblockTime >= xTickCount );
                    xExpectedIdleTime = prvGetExpectedIdleTime();

                    // 允许应用在最终决定前缩短或取消预期空闲时长
                    configPRE_SUPPRESS_TICKS_AND_SLEEP_PROCESSING( xExpectedIdleTime );

                    // 二次结果仍达到阈值时由端口层抑制 Tick 并进入低功耗
                    if( xExpectedIdleTime >= ( TickType_t ) configEXPECTED_IDLE_TIME_BEFORE_SLEEP )
                    {
                        portSUPPRESS_TICKS_AND_SLEEP( xExpectedIdleTime );
                    }
                    else
                    {
                    }
                }
                // 恢复调度器并结算睡眠准备期间积累的 Tick 或就绪任务
                ( void ) xTaskResumeAll();
            }
            else
            {
                mtCOVERAGE_TEST_MARKER();
            }
        }
        #endif

        // 多核且启用被动空闲钩子时，调用对应钩子函数
        #if ( ( configNUMBER_OF_CORES > 1 ) && ( configUSE_PASSIVE_IDLE_HOOK == 1 ) )
        {
            // SMP 主动空闲任务也可执行不可阻塞的被动空闲钩子
            vApplicationPassiveIdleHook();
        }
        #endif
    }
}
```
**③`xPortStartScheduler`**
>**概述**：主要负责端口层的**调度环境初始化**，包括**关键中断配置**、启动`SysTick`并调用`prvPortStartFirstTask`进入**第一个任务**
{%list%}
FreeRTOS调度系统的关键中断包括PendSV、SysTick和SVC，分别用于任务上下文切换、产生系统Tick以及启动第一个任务
{%endlist%}
{%right%}
PendSV和SysTick都被设置为最低优先级，避免任务切换和周期性Tick维护抢占实时应用中断，降低其对系统实时性的影响
{%endright%}
{%warning%}
SVC被设置为最高优先级，保证启动阶段能够优先执行任务上下文恢复流程，使系统可靠地进入第一个任务运行状态
{%endwarning%}
```c
/*
 * 函数功能：
 * 校验端口与中断配置，初始化 Tick 和浮点环境，启动首个任务
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 0  理论上不可达的回退返回值
 */
BaseType_t xPortStartScheduler( void )
{
    // 排除需要专用移植层的 Cortex-M7 r0p0/r0p1 版本
    configASSERT( portCPUID != portCORTEX_M7_r0p1_ID );
    configASSERT( portCPUID != portCORTEX_M7_r0p0_ID );

    // configCHECK_HANDLER_INSTALLATION 为 1 时，检查Cortex-M 异常向量表中的 SVC 和 PendSV 是否正确指向 FreeRTOS 处理函数
    // 使用自定义异常入口转发时，可将该配置设为 0 以跳过直接安装检查
    #if ( configCHECK_HANDLER_INSTALLATION == 1 )
    {
        // 当前异常向量表基址
        const portISR_t * const pxVectorTable = portSCB_VTOR_REG;

        // 检查 SVC 和 PendSV 向量，Tick 中断可由其他定时器产生，因此不检查 SysTick 向量
        configASSERT( pxVectorTable[ portVECTOR_INDEX_SVC ] == vPortSVCHandler );
        configASSERT( pxVectorTable[ portVECTOR_INDEX_PENDSV ] == xPortPendSVHandler );
    }
    #endif

    /* 如果定义了 configASSERT_DEFINED 宏，启动调度器前需要校验 Cortex-M 的 NVIC 优先级配置
     确认中断优先级位数、configMAX_SYSCALL_INTERRUPT_PRIORITY 和 PRIGROUP 设置满足 FreeRTOS 的运行要求，此处略 */

    // PendSV 与 SysTick 设为最低优先级，SVC 设为最高优先级
    portNVIC_SHPR3_REG |= portNVIC_PENDSV_PRI;
    portNVIC_SHPR3_REG |= portNVIC_SYSTICK_PRI;
    portNVIC_SHPR2_REG = 0;

    // 配置并启动 Tick 定时器
    vPortSetupTimerInterrupt();

    // 初始化临界区嵌套状态
    uxCriticalNesting = 0;

    // 启用 VFP 并允许浮点上下文自动、延迟压栈
    vPortEnableVFP();
    *( portFPCCR ) |= portASPEN_AND_LSPEN_BITS;

    // 触发 SVC，转入第一个任务
    prvPortStartFirstTask();

    // 以下是不可达的符号保留与错误回退路径
    vTaskSwitchContext();
    prvTaskExitError();

    // 仅满足函数签名所需的回退返回
    return 0;
}
```
```c
/*
 * 函数功能：
 * 配置 SysTick 的时钟源、重装值与中断，以产生内核 Tick
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
__attribute__( ( weak ) ) void vPortSetupTimerInterrupt( void )
{
    /* 如果定义了 configUSE_TICKLESS_IDLE 宏，需要预计算无节拍模式的周期、上限与停表补偿，此处略 */

    // 停止 SysTick 并清除当前计数
    portNVIC_SYSTICK_CTRL_REG = 0UL;
    portNVIC_SYSTICK_CURRENT_VALUE_REG = 0UL;

    // 按配置的 Tick 频率设置重装值，再启用计数器与中断
    portNVIC_SYSTICK_LOAD_REG = ( configSYSTICK_CLOCK_HZ / configTICK_RATE_HZ ) - 1UL;
    portNVIC_SYSTICK_CTRL_REG = ( portNVIC_SYSTICK_CLK_BIT_CONFIG | portNVIC_SYSTICK_INT_BIT | portNVIC_SYSTICK_ENABLE_BIT );
}
```
**④`prvPortStartFirstTask`**
>**概述**：主要负责**启动首个任务**，包括**重置处理器运行环境**、**使能中断**和触发`SVC`中断**恢复第一个任务上下文**
{%list%}
对于ARM Cortex-M4F处理器，需要重置MSP并将CONTROL清零，使系统处于特权级并使用主栈 MSP，建立统一的初始状态
{%endlist%}
{%right%}
vPortSVCHandler会从pxPortInitialiseStack初始化的任务栈中恢复任务的初始上下文并通过异常返回启动第一个任务
{%endright%}
>`pxPortInitialiseStack`初始化后的**任务栈**如下图所示，其中`R4~R11`和`EXC_RETURN`由`vPortSVCHandler`恢复随后触发**异常返回**
{%warning%}
处理器和调度环境准备完成后，prvPortStartFirstTask才重新开放中断和故障异常，为触发SVC启动首个任务做准备
{%endwarning%}
{%wrong%}
prvPortStartFirstTask和vPortSVCHandler都直接操作处理器栈和异常上下文，需要被声明为naked
{%endwrong%}
>`naked`用于禁止编译器在**普通函数进入和退出时自动插入汇编代码**，使**栈与寄存器操作**完全由手写汇编控制
```c
// prvPortStartFirstTask 函数声明
static void prvPortStartFirstTask( void ) __attribute__( ( naked ) );
/*
 * 函数功能：
 * 重置异常主栈与处理器控制状态，触发 SVC 启动首个任务
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
static void prvPortStartFirstTask( void )
{
    // naked 函数直接操作主栈和 CONTROL，避免编译器插入额外栈操作
    __asm volatile (
        // 从 VTOR 指向的向量表首项读取初始 MSP
        " ldr r0, =0xE000ED08   \n"
        " ldr r0, [r0]          \n"
        " ldr r0, [r0]          \n"
        " msr msp, r0           \n"
        // CONTROL 清零，恢复特权级、MSP 选择和浮点上下文状态
        " mov r0, #0            \n"
        " msr control, r0       \n"
        // 开放普通中断和故障异常，再同步前面的控制寄存器修改
        " cpsie i               \n"
        " cpsie f               \n"
        " dsb                   \n"
        " isb                   \n"
        // SVC 异常转入 vPortSVCHandler 恢复首个任务
        " svc 0                 \n"
        " nop                   \n"
        // 在此放置读取 VTOR 地址所需的汇编字面量池
        " .ltorg                \n"
        );
}
```
```c
// vPortSVCHandler 函数声明
void vPortSVCHandler( void ) __attribute__( ( naked ) );
/*
 * 函数功能：
 * 在 SVC 异常中恢复首个任务的寄存器及 PSP，并通过异常返回启动任务
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void vPortSVCHandler( void )
{
    // naked 异常入口不生成编译器序言和尾声，直接从当前 TCB 取初始栈帧
    __asm volatile (
        // 从当前 TCB 的首成员取得任务栈顶
        "   ldr r3, =pxCurrentTCB           \n"
        "   ldr r1, [r3]                    \n"
        "   ldr r0, [r1]                    \n"
        // 恢复软件保存的核心寄存器与 EXC_RETURN
        "   ldmia r0!, {r4-r11, r14}        \n"
        // 更新 PSP，解除 BASEPRI 屏蔽并按 EXC_RETURN 返回任务
        "   msr psp, r0                     \n"
        "   isb                             \n"
        "   mov r0, #0                      \n"
        "   msr basepri, r0                 \n"
        "   bx r14                          \n"
        "                                   \n"
        // 在此放置汇编字面量池，供上面的地址加载指令使用
        "   .ltorg                          \n"
        );
}
```
```map
┌────────────────────────────────┐
│        Alignment Space         │
├────────────────────────────────┤
│    xPSR = portINITIAL_XPSR     │   ┐
├────────────────────────────────┤   │
│          PC = pxCode           │   │
├────────────────────────────────┤   │
│  LR = portTASK_RETURN_ADDRESS  │   │
├────────────────────────────────┤   │
│              R12               │   │
├────────────────────────────────┤   │  Cortex-M异常返回时
│               R3               │   │  由硬件自动恢复
├────────────────────────────────┤   │
│               R2               │   │
├────────────────────────────────┤   │
│               R1               │   │
├────────────────────────────────┤   │
│       R0 = pvParameters        │   ┘
├────────────────────────────────┤
│           EXC_RETURN           │      vPortSVCHandler手动恢复到R14，从而触发异常返回
├────────────────────────────────┤      
│              R11               │   ┐
├────────────────────────────────┤   │
│              R10               │   │
├────────────────────────────────┤   │
│               R9               │   │
├────────────────────────────────┤   │
│               R8               │   │  vPortSVCHandler
├────────────────────────────────┤   │  手动恢复
│               R7               │   │
├────────────────────────────────┤   │
│               R6               │   │
├────────────────────────────────┤   │
│               R5               │   │
├────────────────────────────────┤   │
│               R4               │   ┘
├────────────────────────────────┤ ← pxCurrentTCB->pxTopOfStack
│                                │
│       Unused Stack Space       │
│                                │
└────────────────────────────────┘ ← pxStack
```
**⑤SysTick中断**
>**概述**：`Systick`会周期性产生中断，主要负责**维护系统节拍**、**唤醒延时任务**并根据**调度策略**和`xYieldPendings`决定是否**触发调度**
{%list%}
SysTick中断通过xTaskIncrementTick处理系统节拍，并根据其返回结果判断是否需要触发调度，本质上就是挂起一个PendSV中断
{%endlist%}
{%right%}
当更高优先级任务被唤醒且允许抢占、同优先级多个就绪任务需要时间片轮转或xYieldPendings被置位时会触发调度
{%endright%}
{%warning%}
由于xTickCount是volatile变量，重复读取会增加内存访问开销，因此先保存到局部变量xConstTickCount供后续判断使用
{%endwarning%}
{%wrong%}
portDISABLE_INTERRUPTS用于保护SysTick中的内核共享状态，防止可调用FreeRTOS API的中断并发修改调度数据
{%endwrong%}
```c
/*
 * 函数功能：
 * 推进内核 Tick，并在需要调度时挂起 PendSV
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void xPortSysTickHandler( void )
{
    // SysTick 处于最低优先级，进入后提高 BASEPRI 保护 Tick 处理
    portDISABLE_INTERRUPTS();
    {
        // 推进 Tick 后是否需要请求任务切换
        if( xTaskIncrementTick() != pdFALSE )
        {
            // 挂起 PendSV，由它完成实际的任务上下文切换
            portNVIC_INT_CTRL_REG = portNVIC_PENDSVSET_BIT;
        }
        else
        {
        }
    }
    // 解除本次 SysTick 处理中设置的 BASEPRI 屏蔽
    portENABLE_INTERRUPTS();
}
```
```c
/*
 * 函数功能：
 * 处理一次内核 Tick：推进计数、唤醒超时任务、执行时间片与 Tick Hook，并形成单核或 SMP 调度请求
 *
 * 参数：
 * 无
 *
 * 返回值：
 * pdTRUE   当前核心应执行上下文切换
 * pdFALSE  当前核心无需立即切换
 */
BaseType_t xTaskIncrementTick( void )
{
    // 指向当前检查或唤醒的延时链表头任务
    TCB_t * pxTCB;
    // 保存延时链表头任务的绝对唤醒 Tick
    TickType_t xItemValue;
    // 累积当前核心是否应在 Tick 退出路径执行切换
    BaseType_t xSwitchRequired = pdFALSE;

    // 调度器未暂停时立即执行完整 Tick 语义
    if( uxSchedulerSuspended == ( UBaseType_t ) 0U )
    {

        // 计算一次递增后的稳定 Tick 快照，后续链表判断都使用该值
        const TickType_t xConstTickCount = xTickCount + ( TickType_t ) 1;

        // 发布新 Tick；回绕到零时交换当前和溢出延时链表并更新溢出计数
        xTickCount = xConstTickCount;

        // Tick 无符号回绕到零时，溢出延时链表成为新的当前延时链表
        if( xConstTickCount == ( TickType_t ) 0U )
        {
            taskSWITCH_DELAYED_LISTS();
        }
        else
        {
        }

        // 只有达到缓存的最近唤醒时刻 xNextTaskUnblockTime 才扫描按绝对 Tick 排序的延时链表
        if( xConstTickCount >= xNextTaskUnblockTime )
        {
            // 连续处理延时列表所有已到期任务，遇到首个未到期任务停止
            for( ; ; )
            {
                // 链表为空时用最大延时表示当前没有已知超时点
                if( listLIST_IS_EMPTY( pxDelayedTaskList ) != pdFALSE )
                {
                    // 没有阻塞任务时，用最大 Tick 推迟下一次超时扫描
                    xNextTaskUnblockTime = portMAX_DELAY;
                    break;
                }
                else
                {
                    // 读取链表头任务及其状态项 xStateListItem 中编码的绝对唤醒 Tick
                    pxTCB = listGET_OWNER_OF_HEAD_ENTRY( pxDelayedTaskList );
                    xItemValue = listGET_LIST_ITEM_VALUE( &( pxTCB->xStateListItem ) );

                    // 队首尚未到期时，它就是新的最近唤醒时刻
                    if( xConstTickCount < xItemValue )
                    {
                        xNextTaskUnblockTime = xItemValue;
                        break;
                    }
                    else
                    {
                    }

                    // 到期任务先从延时链表移除
                    listREMOVE_ITEM( &( pxTCB->xStateListItem ) );

                    // 若同时等待内核对象，也从对象事件链表解除等待
                    if( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) != NULL )
                    {
                        listREMOVE_ITEM( &( pxTCB->xEventListItem ) );
                    }
                    else
                    {
                    }

                    // 将到期任务按优先级加入就绪链表
                    prvAddTaskToReadyList( pxTCB );

                    // 抢占式调度下，超时任务重新就绪后需检查是否应切换任务
                    #if ( configUSE_PREEMPTION == 1 )
                    {
                        // 单核直接比较优先级，多核调用核心选择器为唤醒任务寻找运行机会
                        #if ( configNUMBER_OF_CORES == 1 )
                        {

                            // 单核抢占仅由更高优先级唤醒任务立即要求切换
                            if( pxTCB->uxPriority > pxCurrentTCB->uxPriority )
                            {
                                xSwitchRequired = pdTRUE;
                            }
                            else
                            {
                            }
                        }
                        #else
                        {
                            // SMP 选择能够运行该任务且应被抢占的核心
                            prvYieldForTask( pxTCB );
                        }
                        #endif
                    }
                    #endif
                }
            }
        }

        // 抢占与时间片均启用时，同优先级多个就绪任务应轮转
        #if ( ( configUSE_PREEMPTION == 1 ) && ( configUSE_TIME_SLICING == 1 ) )
        {
            // 时间片轮转在单核检查当前优先级链表，在多核逐核心检查
            #if ( configNUMBER_OF_CORES == 1 )
            {
                // 单核当前优先级链表除当前任务外还有成员时请求切换
                if( listCURRENT_LIST_LENGTH( &( pxReadyTasksLists[ pxCurrentTCB->uxPriority ] ) ) > 1U )
                {
                    xSwitchRequired = pdTRUE;
                }
                else
                {
                }
            }
            #else
            {
                /* SMP下每个核心分别检查当前优先级是否存在多个就绪任务，若存在则设置对应的xYieldPendings，请求后续执行时间片轮转，此处略 */
            }
            #endif
        }
        #endif

        // 启用 Tick Hook 时在正常 tick 处理末尾调用应用提供的钩子
        #if ( configUSE_TICK_HOOK == 1 )
        {
            // 正常硬件 Tick 才调用 Hook，补处理挂起 Tick 时避免重复调用
            if( xPendedTicks == ( TickType_t ) 0 )
            {
                vApplicationTickHook();
            }
            else
            {
            }
        }
        #endif

        // 抢占式调度下将本轮 tick 产生的让出请求交给对应核心
        #if ( configUSE_PREEMPTION == 1 )
        {
            // 单核返回本核切换需求，多核按每个核心的挂起让出标志处理
            #if ( configNUMBER_OF_CORES == 1 )
            {

                // 若零号核心存在尚未处理的让出请求，则合并为本次 Tick 的任务切换请求
                if( xYieldPendings[ 0 ] != pdFALSE )
                {
                    xSwitchRequired = pdTRUE;
                }
                else
                {
                }
            }
            #else
            {
                /* SMP下会遍历各核心的待让出请求，本核通过返回值请求切换，其他核心则调用prvYieldCore触发对应核心重新调度，此处略 */
            }
            #endif
        }
        #endif
    }
    else
    {
        // 调度器暂停时不改动 Tick 和任务链表，只累计待补处理 Tick
        xPendedTicks += 1U;

        // 配置的 Tick Hook 仍按实际定时中断频率调用
        #if ( configUSE_TICK_HOOK == 1 )
        {
            vApplicationTickHook();
        }
        #endif
    }

    // 返回当前核心是否需要在 Tick 中断退出时切换任务
    return xSwitchRequired;
}
```
**⑥PendSV中断**
>**概述**：负责执行真正的**任务上下文切换**，包括**保存当前任务现场**、调用`vTaskSwitchContext`选择下一任务并**恢复目标任务上下文**
{%list%}
软件上下文主要包括硬件不会自动保存的R4~R11、EXC_RETURN，以及使用FPU时的S16~S31，由PendSV手动保存和恢复
{%endlist%}
{%right%}
SysTick、任务主动 yield、高优先级任务解除阻塞、ISR 唤醒任务等都可能产生调度请求，所以使用PendSV中断专门负责调度
{%endright%}
{%warning%}
xPortPendSVHandler声明为naked，禁止编译器自动修改栈和寄存器，使任务上下文能够完全按照FreeRTOS预定的格式保存和恢复
{%endwarning%}
```c
//PendSV中断处理函数声明
void xPortPendSVHandler( void ) __attribute__( ( naked ) );
/*
 * 函数功能：
 * 在 PendSV 中保存当前任务上下文、选择下个任务并恢复其上下文
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void xPortPendSVHandler( void )
{
    // naked 异常入口直接使用 PSP 和 MSP，不让编译器自动改动栈帧
    __asm volatile
    (
        // 读取当前任务的 PSP 和 TCB
        "   mrs r0, psp                         \n"
        "   isb                                 \n"
        "                                       \n"
        "   ldr r3, =pxCurrentTCB               \n"
        "   ldr r2, [r3]                        \n"
        "                                       \n"
        // EXC_RETURN 第 4 位指示浮点上下文，需要时保存 S16 至 S31
        "   tst r14, #0x10                      \n"
        "   it eq                               \n"
        "   vstmdbeq r0!, {s16-s31}             \n"
        "                                       \n"
        // 保存 R4 至 R11 和 EXC_RETURN 到当前任务的 PSP 中，再将更新后的栈顶写回 TCB 首成员
        "   stmdb r0!, {r4-r11, r14}            \n"
        "   str r0, [r2]                        \n"
        "                                       \n"
        // 在 MSP 上暂存工作寄存器 R0-R3
        "   stmdb sp!, {r0, r3}                 \n"
        // 设置 BASEPRI 屏蔽可调用内核 API 的中断，保护任务选择过程，随后调用vTaskSwitchContext
        "   mov r0, %0                          \n"
        "   msr basepri, r0                     \n"
        "   dsb                                 \n"
        "   isb                                 \n"
        "   bl vTaskSwitchContext               \n"
        // 选择完成后清除 BASEPRI，并从 MSP 恢复工作寄存器
        "   mov r0, #0                          \n"
        "   msr basepri, r0                     \n"
        "   ldmia sp!, {r0, r3}                 \n"
        "                                       \n"
        // 从更新后的 pxCurrentTCB 中取新任务的栈顶
        "   ldr r1, [r3]                        \n"
        "   ldr r0, [r1]                        \n"
        "                                       \n"
        // 恢复新任务的软件保存寄存器与异常返回码
        "   ldmia r0!, {r4-r11, r14}            \n"
        "                                       \n"
        // 根据新任务 EXC_RETURN 恢复其高位浮点寄存器
        "   tst r14, #0x10                      \n"
        "   it eq                               \n"
        "   vldmiaeq r0!, {s16-s31}             \n"
        "                                       \n"
        "   msr psp, r0                         \n"
        "   isb                                 \n"
        "                                       \n"
        // 定义 WORKAROUND_PMU_CM001 时，编译针对 XMC4000 PMU_CM001 勘误的可选返回路径
        #ifdef WORKAROUND_PMU_CM001
            // WORKAROUND_PMU_CM001 为 1 时，通过压栈和弹出 PC 返回
            #if WORKAROUND_PMU_CM001 == 1
                "           push { r14 }                \n"
                "           pop { pc }                  \n"
            #endif
        #endif
        // 使用恢复出的 EXC_RETURN 触发异常返回，硬件自动恢复剩余任务上下文并返回线程模式
        "                                       \n"
        "   bx r14                              \n"
        "                                       \n"
        // 汇编字面量池供 pxCurrentTCB 地址加载使用
        "   .ltorg                              \n"
        ::"i" ( configMAX_SYSCALL_INTERRUPT_PRIORITY )
    );
}
```
```c
/*
 * 函数功能：
 * 在单核配置下保存被换出任务状态、选择最高优先级任务，并恢复新任务的运行时上下文附属状态
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
void vTaskSwitchContext( void )
{

    // 调度器暂停时不能改动当前任务，仅留下待让出标志
    if( uxSchedulerSuspended != ( UBaseType_t ) 0U )
    {
        // 保留切换请求，待最外层 `xTaskResumeAll()` 恢复调度时处理
        xYieldPendings[ 0 ] = pdTRUE;
    }
    else
    {
        // 消费待让出标志并记录旧任务换出
        xYieldPendings[ 0 ] = pdFALSE;

        /* 启用运行时间统计时，会在任务切出前计算本次运行时长并累计到当前任务的运行时间计数中，此处略 */

        // 在换出旧任务前执行配置的栈溢出检查
        taskCHECK_FOR_STACK_OVERFLOW();

        /* 启用 POSIX errno 时，任务切出前会将当前errno保存到对应TCB中，此处略 */

        // 从最高优先级非空就绪链表选择下一任务
        taskSELECT_HIGHEST_PRIORITY_TASK();

        // 允许端口在任务选择后更新 MPU 或栈监视点等上下文
        portTASK_SWITCH_HOOK( pxCurrentTCB );

        /* 启用 POSIX errno 时，任务切入后恢复新任务保存的 errno，此处略 */

        /* 启用C运行库TLS时，任务切入后会切换到该任务对应的TLS块，保证各任务使用独立的线程局部存储，此处略 */
    }
}
```
```c
#define taskSELECT_HIGHEST_PRIORITY_TASK()                                       \
do {                                                                             \
    UBaseType_t uxTopPriority = uxTopReadyPriority;                              \
                                                                                 \
    /* 从最高优先级向下寻找第一个非空就绪列表 */                                \
    while( listLIST_IS_EMPTY( &( pxReadyTasksLists[ uxTopPriority ] ) ) != pdFALSE ) \
    {                                                                            \
        configASSERT( uxTopPriority );                                           \
        --uxTopPriority;                                                         \
    }                                                                            \
                                                                                 \
    /* 从该优先级就绪列表中轮转选择下一个任务 */                                \
    listGET_OWNER_OF_NEXT_ENTRY(                                                 \
        pxCurrentTCB,                                                            \
        &( pxReadyTasksLists[ uxTopPriority ] ) );                               \
                                                                                 \
    uxTopReadyPriority = uxTopPriority;                                          \
} while( 0 )
```