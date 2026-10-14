---
title: FreeRTOS源码阅读（四）
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
date: 2026-09-24 14:50:06
keywords:
summary: FreeRTOS的任务创建
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（四）
#### 任务创建
**①引言**
>**概述**：`FreeRTOS`通过**任务控制块**`TCB`描述每个任务，并通过不同的**任务状态列表**组织处于**就绪**、**阻塞**和**挂起**等状态的任务
{%list%}
一个TCB的核心成员如下所示，主要包括任务栈、优先级、任务名称以及xStateListItem和xEventListItem两个列表节点
{%endlist%}
{%right%}
xStateListItem用于将任务挂载到任务状态列表中如就绪列表，xEventListItem则用于将任务挂接到内核对象的事件等待列表中
{%endright%}
>换句话说，`xStateListItem`记录了任务的**调度状态**，而`xEventListItem`记录了任务的**等待事件**
{%warning%}
pxTopOfStack必须位于TCB的首成员位置，使底层汇编在任务上下文切换时能够通过TCB首地址快速访问、保存或恢复任务栈顶
{%endwarning%}
```c
/*
 * 任务控制块
 * 每个任务各有一个实例，集中保存栈上下文、调度列表节点、优先级及可选内核功能状态
 */
typedef struct tskTaskControlBlock       
{
    volatile StackType_t * pxTopOfStack;         //当前已保存上下文的栈顶位置，端口汇编依赖其为TCB首成员
    ListItem_t xStateListItem;                   //挂入就绪、阻塞、挂起或终止列表的任务状态节点
    ListItem_t xEventListItem;                   //挂入队列、信号量等内核对象事件等待列表的节点
    UBaseType_t uxPriority;                      //当前调度优先级，数值越大优先级越高
    StackType_t * pxStack;                       //任务栈缓冲区的起始地址，也是释放动态栈时使用的基址
    char pcTaskName[ configMAX_TASK_NAME_LEN ];  //用于调试的任务名称
    /* 其余略 */
} tskTCB;
typedef tskTCB TCB_t;
```
```c
/* 调度器任务状态与唤醒时序管理列表 */
PRIVILEGED_DATA STATIC List_t pxReadyTasksLists[ configMAX_PRIORITIES ]; //每个优先级一条就绪列表，下标对应任务优先级
PRIVILEGED_DATA STATIC List_t xDelayedTaskList1;                         //当前 tick 周期内到期的延时任务列表
PRIVILEGED_DATA STATIC List_t xDelayedTaskList2;                         //跨 tick 溢出边界到期的延时任务列表，与前一列表轮换角色
PRIVILEGED_DATA STATIC List_t * volatile pxDelayedTaskList;              //指向当前 tick 周期使用的延时列表
PRIVILEGED_DATA STATIC List_t * volatile pxOverflowDelayedTaskList;      //指向跨 tick 溢出边界使用的延时列表
PRIVILEGED_DATA STATIC List_t xPendingReadyList;                         //调度器挂起期间由中断唤醒的任务暂存列表
PRIVILEGED_DATA STATIC List_t xTasksWaitingTermination;                  //已逻辑删除但尚待空闲任务回收内存的任务列表
PRIVILEGED_DATA STATIC List_t xSuspendedTaskList;                        //显式挂起或无限期等待时使用的任务列表
```
**②创建接口**
>**概述**：`FreeRTOS`提供`xTaskCreate`和`xTaskCreateStatic`两种常用任务创建方式，分别用于**动态创建任务**和**静态创建任务**
{%list%}
任务创建主要完成TCB与任务栈的准备、任务属性与初始上下文的初始化工作，并最终将新任务加入对应优先级的就绪列表
{%endlist%}
{%right%}
xTaskCreate由内核动态分配TCB和任务栈的内存，xTaskCreateStatic则由调用者提前提供对应的静态存储空间并作为参数传入
{%endright%}
{%warning%}
FreeRTOS会根据栈的增长方向调整TCB与任务栈的分配顺序，使TCB尽量位于栈增长方向的反侧，降低栈溢出直接破坏TCB的风险
{%endwarning%}
```c
/*
 * 函数功能：
 * 动态创建普通任务，并将成功创建的任务纳入调度器
 *
 * 参数：
 * pxTaskCode    任务入口函数
 * pcName        任务调试名称，可为空
 * uxStackDepth  栈深度，单位为 StackType_t 元素
 * pvParameters  传给任务入口的参数
 * uxPriority    初始任务优先级
 * pxCreatedTask 可选输出参数，接收任务句柄
 *
 * 返回值：
 * pdPASS  任务创建并发布成功
 * errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY  TCB或栈分配失败
 */
BaseType_t xTaskCreate( TaskFunction_t pxTaskCode,
                        const char * const pcName,
                        const configSTACK_DEPTH_TYPE uxStackDepth,
                        void * const pvParameters,
                        UBaseType_t uxPriority,
                        TaskHandle_t * const pxCreatedTask )
{
    // 接收动态创建的 TCB，NULL 表示 TCB 或任务栈分配失败
    TCB_t * pxNewTCB;

    // 保存最终返回给调用者的创建状态
    BaseType_t xReturn;

    // 动态分配 TCB 和任务栈，并初始化任务上下文
    pxNewTCB = prvCreateTask( pxTaskCode, pcName, uxStackDepth, pvParameters, uxPriority, pxCreatedTask );

    // 只有取得有效 TCB 时才能继续发布任务
    if( pxNewTCB != NULL )
    {
        // configNUMBER_OF_CORES 指定核心数，值大于 1 时使用多核任务调度
        // configUSE_CORE_AFFINITY 为 1 时，TCB 才包含限制任务可运行核心的亲和性位图
        // 两个条件同时成立时，才为普通创建接口编译默认亲和性赋值
        #if ( ( configNUMBER_OF_CORES > 1 ) && ( configUSE_CORE_AFFINITY == 1 ) )
        {
            // configTASK_DEFAULT_CORE_AFFINITY 指定未显式传入亲和性时允许运行的核心
            // 未配置该宏时默认取 tskNO_AFFINITY，表示可在所有可用核心上运行
            pxNewTCB->uxCoreAffinityMask = configTASK_DEFAULT_CORE_AFFINITY;
        }
        #endif

        // 将新任务加入调度器的就绪列表
        prvAddNewTaskToReadyList( pxNewTCB );

        // 任务已完整发布，向调用者报告创建成功
        xReturn = pdPASS;
    }
    else
    {
        // TCB 或任务栈分配失败时返回内存不足错误
        xReturn = errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY;
    }

    // 向调用者返回任务创建结果
    return xReturn;
}
/*
 * 函数功能：
 * 按端口栈增长方向动态分配 TCB 和任务栈，完成初始化但暂不加入就绪列表
 *
 * 参数：
 * pxTaskCode    任务入口函数
 * pcName        任务调试名称，可为空
 * uxStackDepth  栈深度，单位为 StackType_t 元素
 * pvParameters  传给任务入口的参数
 * uxPriority    初始任务优先级
 * pxCreatedTask 可选输出参数，接收任务句柄
 *
 * 返回值：
 * 非 NULL  已初始化的动态 TCB
 * NULL     TCB或栈内存分配失败
 */
STATIC TCB_t * prvCreateTask( TaskFunction_t pxTaskCode,
                                const char * const pcName,
                                const configSTACK_DEPTH_TYPE uxStackDepth,
                                void * const pvParameters,
                                UBaseType_t uxPriority,
                                TaskHandle_t * const pxCreatedTask )
{
    // 保存本次创建的 TCB 指针，供后续初始化和返回使用
    TCB_t * pxNewTCB;

    // portSTACK_GROWTH 大于 0 时栈向高地址增长，先分配 TCB 再分配栈
    #if ( portSTACK_GROWTH > 0 )
    {
        // 先分配固定大小的 TCB，以便成功后直接记录栈指针
        pxNewTCB = ( TCB_t * ) pvPortMalloc( sizeof( TCB_t ) );

        // TCB 分配成功后才清零字段并继续申请独立任务栈
        if( pxNewTCB != NULL )
        {
            // 清除可能残留的字段值，再为控制块分配独立任务栈
            ( void ) memset( ( void * ) pxNewTCB, 0x00, sizeof( TCB_t ) );

            // 按栈元素数换算字节数并分配任务栈
            pxNewTCB->pxStack = ( StackType_t * ) pvPortMallocStack( ( ( ( size_t ) uxStackDepth ) * sizeof( StackType_t ) ) );

            // 栈分配失败时回滚已经分配的 TCB
            if( pxNewTCB->pxStack == NULL )
            {
                // 释放已取得的 TCB，避免栈分配失败时泄漏
                vPortFree( pxNewTCB );

                // 恢复统一的 NULL 失败结果，防止返回已释放的指针
                pxNewTCB = NULL;
            }
        }
    }
    // portSTACK_GROWTH 小于等于 0 时栈向低地址增长，先分配栈再分配 TCB
    #else
    {
        // 栈向低地址增长时暂存先分配的栈基址
        StackType_t * pxStack;

        // 按栈元素数换算字节数并分配任务栈
        pxStack = ( StackType_t * ) pvPortMallocStack( ( ( ( size_t ) uxStackDepth ) * sizeof( StackType_t ) ) );

        // 栈成功后再分配 TCB，并在任一步失败时释放已取得的资源
        if( pxStack != NULL )
        {
            // 栈已就绪后再分配固定大小的 TCB
            pxNewTCB = ( TCB_t * ) pvPortMalloc( sizeof( TCB_t ) );

            // TCB 分配成功后才清零字段并绑定先前取得的任务栈
            if( pxNewTCB != NULL )
            {
                // 清除新 TCB 中的未定义内容，为逐字段初始化建立确定起点
                ( void ) memset( ( void * ) pxNewTCB, 0x00, sizeof( TCB_t ) );

                // 将先前取得的栈基址关联到新 TCB
                pxNewTCB->pxStack = pxStack;
            }
            else
            {
                // TCB 分配失败时归还先前成功分配的任务栈
                vPortFreeStack( pxStack );
            }
        }
        else
        {
            // 栈分配失败时保持 NULL 作为统一失败结果
            pxNewTCB = NULL;
        }
    }
    #endif

    // 两块内存均就绪后记录动态所有权并初始化任务上下文
    if( pxNewTCB != NULL )
    {
        // 静态和动态分配均可用时，额外记录 TCB 与栈都需由内核释放
        #if ( tskSTATIC_AND_DYNAMIC_ALLOCATION_POSSIBLE != 0 )
        {
            // 记录栈和 TCB 均由内核动态分配，删除时必须成对释放
            pxNewTCB->ucStaticallyAllocated = tskDYNAMICALLY_ALLOCATED_STACK_AND_TCB;
        }
        #endif

        // 填充任务公共字段、列表节点和初始端口栈帧
        prvInitialiseNewTask( pxTaskCode, pcName, uxStackDepth, pvParameters, uxPriority, pxCreatedTask, pxNewTCB, NULL );
    }

    // 返回已初始化的 TCB，任一内存分配失败时返回 NULL
    return pxNewTCB;
}
```
```c
/*
 * 函数功能：
 * 使用调用方提供的栈和 TCB 缓冲区创建任务，并将成功创建的任务纳入调度器
 *
 * 参数：
 * pxTaskCode     任务入口函数
 * pcName         任务调试名称，可为空
 * uxStackDepth   栈深度，单位为 StackType_t 元素
 * pvParameters   传给任务入口的参数
 * uxPriority     初始任务优先级
 * puxStackBuffer 调用方提供的栈缓冲区
 * pxTaskBuffer   调用方提供的静态 TCB 缓冲区
 *
 * 返回值：
 * 非 NULL  新任务句柄
 * NULL     任务未创建
 */
TaskHandle_t xTaskCreateStatic( TaskFunction_t pxTaskCode,
                                const char * const pcName,
                                const configSTACK_DEPTH_TYPE uxStackDepth,
                                void * const pvParameters,
                                UBaseType_t uxPriority,
                                StackType_t * const puxStackBuffer,
                                StaticTask_t * const pxTaskBuffer )
{
    // 保存新建任务的公开句柄
    TaskHandle_t xReturn = NULL;

    // 保存静态创建的任务控制块指针
    TCB_t * pxNewTCB;

    // 构造静态任务元数据和初始栈帧
    pxNewTCB = prvCreateStaticTask( pxTaskCode, pcName, uxStackDepth, pvParameters, uxPriority, puxStackBuffer, pxTaskBuffer, &xReturn );

    // 创建成功后先设置默认亲和性，再发布到调度器
    if( pxNewTCB != NULL )
    {
        // configNUMBER_OF_CORES 大于 1 且 configUSE_CORE_AFFINITY 为 1 时，TCB 才保存任务亲和性位图
        // 该分支为未指定运行核心的静态任务设置默认位图
        #if ( ( configNUMBER_OF_CORES > 1 ) && ( configUSE_CORE_AFFINITY == 1 ) )
        {
            // configTASK_DEFAULT_CORE_AFFINITY 指定默认允许的核心，未配置时可运行于所有可用核心
            pxNewTCB->uxCoreAffinityMask = configTASK_DEFAULT_CORE_AFFINITY;
        }
        #endif

        // 将新任务加入调度器的就绪列表
        prvAddNewTaskToReadyList( pxNewTCB );
    }
    else
    {
    }

    // 返回新任务句柄，创建失败时保持为 NULL
    return xReturn;
}
/*
 * 函数功能：
 * 使用调用方提供的 TCB 与栈缓冲区构造任务，但暂不把任务加入就绪列表
 *
 * 参数：
 * pxTaskCode     任务入口函数
 * pcName         任务调试名称，可为空
 * uxStackDepth   栈缓冲区包含的 StackType_t 元素数
 * pvParameters   传给任务入口的参数
 * uxPriority     初始任务优先级
 * puxStackBuffer 调用方提供的栈缓冲区
 * pxTaskBuffer   调用方提供的静态 TCB 缓冲区
  * pxCreatedTask 可选输出参数，接收创建后的任务句柄
 *
 * 返回值：
 * 非 NULL  已初始化的 TCB
 * NULL     输入缓冲区无效，任务未创建
 */
STATIC TCB_t * prvCreateStaticTask( TaskFunction_t pxTaskCode,
                                    const char * const pcName,
                                    const configSTACK_DEPTH_TYPE uxStackDepth,
                                    void * const pvParameters,
                                    UBaseType_t uxPriority,
                                    StackType_t * const puxStackBuffer,
                                    StaticTask_t * const pxTaskBuffer,
                                    TaskHandle_t * const pxCreatedTask )
{
    // 保存静态缓冲区转换得到的新任务控制块
    TCB_t * pxNewTCB;

    // 静态创建要求栈缓冲区和 TCB 缓冲区均由调用者提供
    configASSERT( puxStackBuffer != NULL );
    configASSERT( pxTaskBuffer != NULL );

    // configASSERT_DEFINED 为 1 时，编译静态占位类型与内部 TCB 的尺寸校验
    #if ( configASSERT_DEFINED == 1 )
    {
        // 用公开占位类型的大小校验其足以容纳内核真实 TCB
        volatile size_t xSize = sizeof( StaticTask_t );

        // 要求公开静态缓冲区与内部 TCB 完全等大
        configASSERT( xSize == sizeof( TCB_t ) );

        // 显式消费仅用于断言的局部量，兼容关闭运行时断言的构建
        ( void ) xSize;
    }
    #endif

    // 仅在两个缓冲区都有效时占用它们并初始化任务
    if( ( pxTaskBuffer != NULL ) && ( puxStackBuffer != NULL ) )
    {
        // 将调用方的静态 TCB 缓冲区视为内部控制块
        pxNewTCB = ( TCB_t * ) pxTaskBuffer;

        // 清除 TCB 缓冲区中的旧内容，为逐字段初始化建立确定起点
        ( void ) memset( ( void * ) pxNewTCB, 0x00, sizeof( TCB_t ) );

        // 将调用方提供的栈缓冲区关联到新 TCB
        pxNewTCB->pxStack = ( StackType_t * ) puxStackBuffer;

        // 静态和动态分配均可用时，额外记录该任务的存储所有权
        #if ( tskSTATIC_AND_DYNAMIC_ALLOCATION_POSSIBLE != 0 )
        {
            // 记录栈和 TCB 均归调用方所有，删除任务时不得释放这两块内存
            pxNewTCB->ucStaticallyAllocated = tskSTATICALLY_ALLOCATED_STACK_AND_TCB;
        }
        #endif

        // 填充任务公共字段和初始端口栈帧
        prvInitialiseNewTask( pxTaskCode, pcName, uxStackDepth, pvParameters, uxPriority, pxCreatedTask, pxNewTCB, NULL );
    }
    else
    {
        // 任一静态缓冲区无效都以 NULL 明确表示创建失败
        pxNewTCB = NULL;
    }

    // 返回已初始化的 TCB，静态缓冲区无效时返回 NULL
    return pxNewTCB;
}
```
**③任务初始化**
>**概述**：`prvCreateTask`和`prvCreateStaticTask`在完成`TCB`与**任务栈**的准备后，都会调用`prvInitialiseNewTask`**对新任务进行初始化**
{%list%}
prvInitialiseNewTask的主要工作为完成任务栈、任务名称、优先级和列表节点的初始化，此处省略了开启MPU和多核的逻辑
{%endlist%}
>`xEventListItem`的`xItemValue`被置为`configMAX_PRIORITIES - uxPriority`，使**高优先级任务**在相关**事件列表**中排序靠前
{%right%}
pxPortInitialiseStack用于在任务栈中构造初始上下文栈帧，使任务第一次被调度时能够像恢复上下文一样直接开始运行
{%endright%}
>以`ARM Cortex-M4F`为例，`pxPortInitialiseStack`会在任务栈中预置`xPSR`、`PC`、`LR`、`R0`和`EXC_RETURN`，并为`R4~R11`预留空间
{%warning%}
FreeRTOS的任务名称长度需要小于configMAX_TASK_NAME_LEN，任务优先级数值需要小于configMAX_PRIORITIES
{%endwarning%}
{%wrong%}
任务初始栈顶必须按照portBYTE_ALIGNMENT_MASK完成对齐，否则可能导致后续上下文恢复不满足处理器ABI要求
{%endwrong%}
```c
/*
 * 函数功能：
 * 填充新 TCB 的调度字段、名称、列表节点、MPU/TLS 状态和端口初始栈帧
 *
 * 参数：
 * pxTaskCode     任务入口函数
 * pcName         任务调试名称，可为空
 * uxStackDepth   栈深度，单位为 StackType_t 元素
 * pvParameters   传给任务入口的参数
 * uxPriority     初始优先级，MPU 配置下可携带特权位
 * pxCreatedTask  可选输出参数，接收任务句柄
 * pxNewTCB       已取得存储空间且已关联栈的 TCB
 * xRegions       MPU 内存区域定义，非 MPU 端口不使用
 *
 * 返回值：
 * 无返回值
 */
STATIC void prvInitialiseNewTask( TaskFunction_t pxTaskCode,
                                  const char * const pcName,
                                  const configSTACK_DEPTH_TYPE uxStackDepth,
                                  void * const pvParameters,
                                  UBaseType_t uxPriority,
                                  TaskHandle_t * const pxCreatedTask,
                                  TCB_t * pxNewTCB,
                                  const MemoryRegion_t * const xRegions )
{
    // 计算端口初始化栈帧所需的初始栈顶地址
    StackType_t * pxTopOfStack;
    // 复制任务名称时使用的字符下标
    UBaseType_t x;

    /* 如果启用了 MPU，需要从 uxPriority 中提取任务的特权运行标志，并清除该标志位，使剩余的 uxPriority 只表示真正的调度优先级 */

    // 需要栈水位或溢出诊断时，用已知字节模式填充整个栈缓冲区
    #if ( tskSET_NEW_STACKS_TO_KNOWN_VALUE == 1 )
    {
        ( void ) memset( pxNewTCB->pxStack, ( int ) tskSTACK_FILL_BYTE, ( size_t ) uxStackDepth * sizeof( StackType_t ) );
    }
    #endif

    // portSTACK_GROWTH 小于 0 时从缓冲区高端建立初始栈顶，否则从低端建立
    #if ( portSTACK_GROWTH < 0 )
    {
        // 向低地址增长的栈从缓冲区末端起步，并向下对齐栈顶
        pxTopOfStack = &( pxNewTCB->pxStack[ uxStackDepth - ( configSTACK_DEPTH_TYPE ) 1 ] );
        pxTopOfStack = ( StackType_t * ) ( ( ( portPOINTER_SIZE_TYPE ) pxTopOfStack ) & ( ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK ) ) );

        // 对齐结果必须满足端口 ABI 要求，否则初始上下文无法安全恢复
        configASSERT( ( ( ( portPOINTER_SIZE_TYPE ) pxTopOfStack & ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK ) == 0U ) );

        // configRECORD_STACK_HIGH_ADDRESS 为 1 时额外保存向下增长栈的高地址边界
        #if ( configRECORD_STACK_HIGH_ADDRESS == 1 )
        {
            // 向下增长时记录初始高地址边界，供栈检查和调试使用
            pxNewTCB->pxEndOfStack = pxTopOfStack;
        }
        #endif
    }
    #else
    {
        // 向高地址增长的栈从缓冲区起点起步，并向上对齐栈顶
        pxTopOfStack = pxNewTCB->pxStack;
        pxTopOfStack = ( StackType_t * ) ( ( ( ( portPOINTER_SIZE_TYPE ) pxTopOfStack ) + portBYTE_ALIGNMENT_MASK ) & ( ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK ) ) );

        // 向上对齐后的起始栈顶也必须满足端口 ABI 对齐约束
        configASSERT( ( ( ( portPOINTER_SIZE_TYPE ) pxTopOfStack & ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK ) == 0U ) );

        // 向上增长时记录分配区末端作为栈边界
        pxNewTCB->pxEndOfStack = pxNewTCB->pxStack + ( uxStackDepth - ( configSTACK_DEPTH_TYPE ) 1 );
    }
    #endif

    // 名称非空时最多复制缓冲区容量，并在遇到源字符串结尾时提前停止
    if( pcName != NULL )
    {
        for( x = ( UBaseType_t ) 0; x < ( UBaseType_t ) configMAX_TASK_NAME_LEN; x++ )
        {
            // 逐字符写入 TCB 内部名称缓冲区
            pxNewTCB->pcTaskName[ x ] = pcName[ x ];

            if( pcName[ x ] == ( char ) 0x00 )
            {
                break;
            }
            else
            {
            }
        }

        // 即使输入名称过长，也强制保留最后一个空字符
        pxNewTCB->pcTaskName[ configMAX_TASK_NAME_LEN - 1U ] = '\0';
    }
    else
    {
    }

    // 调用方优先级必须落在就绪列表数组的有效下标范围内
    configASSERT( uxPriority < configMAX_PRIORITIES );

    // 防御性限制优先级，避免作为就绪列表下标时越界
    if( uxPriority >= ( UBaseType_t ) configMAX_PRIORITIES )
    {
        uxPriority = ( UBaseType_t ) configMAX_PRIORITIES - ( UBaseType_t ) 1U;
    }
    else
    {
    }

    // 设置当前优先级；启用互斥量时基础优先级从相同值开始
    pxNewTCB->uxPriority = uxPriority;

    // configUSE_MUTEXES 为 1 时另存基础优先级，供继承优先级后的恢复使用
    #if ( configUSE_MUTEXES == 1 )
    {
        pxNewTCB->uxBasePriority = uxPriority;
    }
    #endif

    // 初始化任务状态节点和事件节点，使其可安全插入内核列表
    vListInitialiseItem( &( pxNewTCB->xStateListItem ) );
    vListInitialiseItem( &( pxNewTCB->xEventListItem ) );

    // 状态节点通过 owner 反向关联 TCB
    listSET_LIST_ITEM_OWNER( &( pxNewTCB->xStateListItem ), pxNewTCB );

    // 事件节点以反向优先级值排序，并同样关联所属 TCB
    listSET_LIST_ITEM_VALUE( &( pxNewTCB->xEventListItem ), ( TickType_t ) configMAX_PRIORITIES - ( TickType_t ) uxPriority );
    listSET_LIST_ITEM_OWNER( &( pxNewTCB->xEventListItem ), pxNewTCB );

    /* 如果启用了 MPU 则需要将任务的内存区域和栈信息转换为 MPU 配置并保存到 TCB 中 */

    // configUSE_C_RUNTIME_TLS_SUPPORT 为 1 时为任务初始化独立的 C 运行库 TLS 块
    #if ( configUSE_C_RUNTIME_TLS_SUPPORT == 1 )
    {
        // 为该任务建立 C 运行库线程局部存储块
        configINIT_TLS_BLOCK( pxNewTCB->xTLSBlock, pxTopOfStack );
    }
    #endif

    /* 根据 MPU、栈溢出检查和栈增长方向选择合适的 pxPortInitialiseStack() 调用方式，构造任务初始栈帧并得到最终的 pxTopOfStack */

    /* 如果启用了多核，还需要初始化任务的运行核心状态，并识别、标记内核空闲任务 */

    // 调用者请求句柄时，将内部 TCB 指针作为不透明任务句柄输出
    if( pxCreatedTask != NULL )
    {
        *pxCreatedTask = ( TaskHandle_t ) pxNewTCB;
    }
    else
    {
    }
}
```
```c
/*
 * 函数功能：构造新任务首次运行所需的 Cortex-M4F 初始栈帧。
 * 参数：
 * pxTopOfStack 任务栈顶指针
 * pxCode       任务入口函数
 * pvParameters 传给任务入口的参数
 * 返回值：
 * 栈指针        构造完成后的任务栈顶
 */
StackType_t * pxPortInitialiseStack( StackType_t * pxTopOfStack,
                                     TaskFunction_t pxCode,
                                     void * pvParameters )
{
    // 预留异常入栈布局所需的对齐位置
    pxTopOfStack--;

    // 写入异常返回时硬件恢复的 xPSR、PC 和 LR
    *pxTopOfStack = portINITIAL_XPSR;
    pxTopOfStack--;
    *pxTopOfStack = ( ( StackType_t ) pxCode ) & portSTART_ADDRESS_MASK;
    pxTopOfStack--;
    *pxTopOfStack = ( StackType_t ) portTASK_RETURN_ADDRESS;

    // 跳过无需初始值的 R12、R3、R2、R1，再把任务参数放入 R0
    pxTopOfStack -= 5;
    *pxTopOfStack = ( StackType_t ) pvParameters;

    // 保存异常返回码，使任务从 PSP 返回线程模式
    pxTopOfStack--;
    *pxTopOfStack = portINITIAL_EXC_RETURN;

    // 为软件保存的 R4 至 R11 留出位置，返回供 TCB 保存的栈顶
    pxTopOfStack -= 8;

    // 返回任务首次恢复时使用的软件上下文栈顶
    return pxTopOfStack;
}
```
**④进入就绪态**
>**概述**：`xTaskCreate`和`xTaskCreateStatic`在完成**新任务的初始化后**，会调用`prvAddNewTaskToReadyList`将其加入到**就绪列表**
{%list%}
prvAddNewTaskToReadyList负责登记新任务，将其加入对应优先级的就绪列表，并在需要时初始化任务列表或触发调度
{%endlist%}
{%right%}
调度器启动前，pxCurrentTCB始终指向已创建任务中优先级最高的任务，为调度器启动后的首次调度做准备
{%endright%}
{%warning%}
任务计数、pxCurrentTCB和就绪列表属于调度器共享状态，必须在临界区内统一更新，否则可能造成调度状态不一致
{%endwarning%}
{%wrong%}
taskENTER_CRITICAL只会屏蔽优先级不高于configMAX_SYSCALL_INTERRUPT_PRIORITY阈值的可屏蔽中断，常见配置为5
{%endwrong%}
```c
/*
 * 函数功能：
 * 在单核临界区内登记新任务、初始化首个任务的调度链表并把任务加入对应就绪链表
 *
 * 参数：
 * pxNewTCB  已完成字段和栈初始化的新任务控制块
 *
 * 返回值：
 * 无返回值
 */
STATIC void prvAddNewTaskToReadyList( TCB_t * pxNewTCB )
{
    // 临界区保护任务计数、当前任务指针和所有调度链表
    taskENTER_CRITICAL();
    {
        // 先把新任务计入内核任务总数
        uxCurrentNumberOfTasks = ( UBaseType_t ) ( uxCurrentNumberOfTasks + 1U );

        // 尚未建立当前任务时，新任务成为调度器启动前的初始候选
        if( pxCurrentTCB == NULL )
        {
            // 尚无当前任务时直接选择新任务
            pxCurrentTCB = pxNewTCB;

            // 当前创建的是否为系统中的第一个任务
            if( uxCurrentNumberOfTasks == ( UBaseType_t ) 1 )
            {
                // 第一个任务负责初始化全部就绪、延时、挂起及终止链表
                prvInitialiseTaskLists();
            }
            else
            {
            }
        }
        else
        {

            // 调度器启动前保留已创建任务中的最高优先级者作为初始当前任务
            if( xSchedulerRunning == pdFALSE )
            {
                // 新任务的优先级是否不低于当前候选任务
                if( pxCurrentTCB->uxPriority <= pxNewTCB->uxPriority )
                {
                    pxCurrentTCB = pxNewTCB;
                }
                else
                {
                }
            }
            else
            {
            }
        }

        // 更新任务拓扑变化序号，并在启用跟踪时写入新 TCB
        uxTaskNumber++;

        // 按新任务的优先级更新就绪状态并插入对应就绪链表
        prvAddTaskToReadyList( pxNewTCB );

        // 调用端口 TCB 收尾钩子，为后续上下文切换准备端口私有状态
        portSETUP_TCB( pxNewTCB );
    }

    // 所有共享调度状态完成更新后退出临界区
    taskEXIT_CRITICAL();

    // 调度器运行期间，新任务可能要求当前任务立即被抢占
    if( xSchedulerRunning != pdFALSE )
    {
        // 单核：新任务优先级更高，就让当前核心重新调度
        // 多核：新任务就绪后，在可运行核心中选择合适的低优先级核心让出
        taskYIELD_ANY_CORE_IF_USING_PREEMPTION( pxNewTCB );
    }
    else
    {
    }
}
```
```c
/* 发布任务进入就绪态、更新最高优先级并插入对应就绪链表尾部 */
#define prvAddTaskToReadyList( pxTCB )                                                                     \
    do {                                                                                                   \
        traceMOVED_TASK_TO_READY_STATE( pxTCB );                                                           \
        taskRECORD_READY_PRIORITY( ( pxTCB )->uxPriority );                                                \
        listINSERT_END( &( pxReadyTasksLists[ ( pxTCB )->uxPriority ] ), &( ( pxTCB )->xStateListItem ) ); \
        tracePOST_MOVED_TASK_TO_READY_STATE( pxTCB );                                                      \
    } while( 0 )
```
```c
/* 仅当新就绪任务优先级更高时请求单核当前任务让出 */
#define taskYIELD_ANY_CORE_IF_USING_PREEMPTION( pxTCB ) \
do {                                                        \
    if( pxCurrentTCB->uxPriority < ( pxTCB )->uxPriority )  \
    {                                                       \
        portYIELD_WITHIN_API();                             \
    }                                                       \
    else                                                    \
    {                                                       \
        mtCOVERAGE_TEST_MARKER();                           \
    }                                                       \
} while( 0 )
```

