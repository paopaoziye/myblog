---
title: FreeRTOS源码阅读（六）
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
date: 2026-09-28 12:43:24
keywords:
summary: FreeRTOS任务状态切换
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（六）
#### 任务状态切换
**①引言**
>**概述**：`FreeRTOS`的任务状态主要有`Ready`、`Running`、`Blocked`、`Suspended`和`Deleted`，详细如下图所示
{%list%}
任务状态切换的本质是TCB中的xStateListItem在不同任务状态列表之间迁移，其中Running状态额外由pxCurrentTCB标识
{%endlist%}
{%right%}
任务等待事件时，不仅xStateListItem被加入延时列表，xEventListItem还要被挂入事件列表，以区分事件唤醒和延时唤醒
{%endright%}
{%warning%}
调度器挂起期间任务被事件唤醒时，不会立即进入就绪列表，而是先通过xPendingReadyList暂存，待调度器恢复后再转入就绪态
{%endwarning%}

**②任务延时**
>**概述**：`FreeRTOS`提供`vTaskDelay`和`xTaskDelayUntil`使当前任务进入**阻塞态**，**等待指定时间后**重新进入就绪态
{%list%}
vTaskDelay以当前Tick为起点进行相对延时，而xTaskDelayUntil基于上次唤醒时刻按固定周期计算下一次唤醒从而进行绝对延时
{%endlist%}
>`vTaskDelay`和`xTaskDelayUntil`都会计算**任务的延时需求**并将其通过`prvAddCurrentTaskToDelayedList`加入**延时列表或挂起列表**
{%right%}
任务进入延时列表前，其xStateListItem成员值被设置为任务的唤醒时刻，使调度器能够按唤醒时间顺序管理阻塞任务
{%endright%}
{%warning%}
当INCLUDE_vTaskSuspend为1时，若任务需要无限阻塞，则会进入xSuspendedTaskList而不是延时列表，因此不会被Tick超时唤醒
{%endwarning%}
{%wrong%}
xTickCount通常为32位无符号整数，一定时间后会溢出，故FreeRTOS使用两个延时列表分别管理溢出前后到期的任务
{%endwrong%}
>当`Tick`频率为`1000 Hz`时约`49.7`天之后`xTickCount`会发生溢出，因此内核需要正确处理**跨越回绕点的延时任务**

>**当前周期内到期**的任务进入`pxDelayedList`，跨越`Tick`**溢出点**的任务进入`pxOverflowDelayedList`，并在`Tick`**回绕后交换两个列表**
```c
/*
 * 函数功能：
 * 将当前任务阻塞指定 tick 数；零延时仅触发一次重新调度
 *
 * 参数：
 * xTicksToDelay  相对延时时长，单位为系统 tick
 *
 * 返回值：
 * 无返回值
 */
void vTaskDelay( const TickType_t xTicksToDelay )
{
    // 记录恢复调度器时是否已经发生任务切换
    BaseType_t xAlreadyYielded = pdFALSE;

    // 正延时需要暂挂调度器并把当前任务移入延时列表
    if( xTicksToDelay > ( TickType_t ) 0U )
    {
        vTaskSuspendAll();
        {
            // 延时列表操作必须在调度器已挂起的状态下进行
            configASSERT( uxSchedulerSuspended == 1U );

            // 当前任务不在事件等待列表，可直接按相对 tick 进入阻塞态
            prvAddCurrentTaskToDelayedList( xTicksToDelay, pdFALSE );
        }
        // 恢复调度器并记录恢复过程是否已经完成任务切换
        xAlreadyYielded = xTaskResumeAll();
    }

    // 零延时或恢复过程未切换时，显式请求调度切换
    if( xAlreadyYielded == pdFALSE )
    {
        taskYIELD_WITHIN_API();
    }
}
```
```c
/*
 * 函数功能：
 * 以绝对周期基准计算下一唤醒时刻，正确处理 tick 回绕并在尚未到期时阻塞当前任务
 *
 * 参数：
 * pxPreviousWakeTime  输入输出参数，传入上次唤醒基准并更新为本次目标时刻
 * xTimeIncrement      周期长度，单位为系统 tick，必须大于 0
 *
 * 返回值：
 * pdTRUE   本次目标尚未到期，当前任务已进入延时状态
 * pdFALSE  本次目标已到期或错过，未阻塞当前任务
 */
BaseType_t xTaskDelayUntil( TickType_t * const pxPreviousWakeTime,
                            const TickType_t xTimeIncrement )
{
    // 保存目标唤醒 tick
    TickType_t xTimeToWake;
    // xAlreadyYielded 记录恢复调度器时是否已经切换任务
    // xShouldDelay 记录下一目标时刻是否尚未到达
    BaseType_t xAlreadyYielded, xShouldDelay = pdFALSE;

    // 周期基准指针必须有效，周期增量必须大于零
    configASSERT( pxPreviousWakeTime );
    configASSERT( ( xTimeIncrement > 0U ) );

    // 挂起调度器后固定 tick 快照，避免判断期间时间推进
    vTaskSuspendAll();
    {
        // 在调度挂起期间取得稳定的当前 tick，用于后续回绕和到期判断
        const TickType_t xConstTickCount = xTickCount;

        // 确保调用前调度器未被挂起，本函数挂起后计数应恰好为 1
        configASSERT( uxSchedulerSuspended == 1U );

        // 计算下一个绝对周期点，允许 TickType_t 自然回绕
        xTimeToWake = *pxPreviousWakeTime + xTimeIncrement;

        // 当前 tick 小于旧基准表示 tick 已在两次调用之间回绕
        if( xConstTickCount < *pxPreviousWakeTime )
        {
            // 只有目标也已回绕且仍位于当前 tick 之后时才需要阻塞
            if( ( xTimeToWake < *pxPreviousWakeTime ) && ( xTimeToWake > xConstTickCount ) )
            {
                xShouldDelay = pdTRUE;
            }
        }
        else
        {
            // 未发生当前 tick 回绕时，目标回绕或目标仍在未来都表示应延时
            if( ( xTimeToWake < *pxPreviousWakeTime ) || ( xTimeToWake > xConstTickCount ) )
            {
                xShouldDelay = pdTRUE;
            }
        }

        // 无论是否错过周期，都推进基准，防止后续周期产生漂移
        *pxPreviousWakeTime = xTimeToWake;

        // 目标尚未到达时，将绝对时刻换算为相对阻塞 tick
        if( xShouldDelay != pdFALSE )
        {
            // 以目标时刻和 tick 快照之差作为当前任务的相对阻塞时间
            prvAddCurrentTaskToDelayedList( xTimeToWake - xConstTickCount, pdFALSE );
        }
    }
    // 恢复调度器并记录恢复过程是否已经完成任务切换
    xAlreadyYielded = xTaskResumeAll();

    // 恢复过程尚未切换任务时显式请求一次调度
    if( xAlreadyYielded == pdFALSE )
    {
        taskYIELD_WITHIN_API();
    }

    // 调用者可区分本次阻塞等待与目标已到期两种结果
    return xShouldDelay;
}
```
```c
/*
 * 函数功能：
 * 将当前任务从就绪列表移入挂起列表或按唤醒 tick 排序的延时列表
 *
 * 参数：
 * xTicksToWait           阻塞持续的 tick 数
 * xCanBlockIndefinitely  在 xTicksToWait 为 portMAX_DELAY 时是否允许无限期阻塞
 *
 * 返回值：
 * 无返回值
 */
STATIC void prvAddCurrentTaskToDelayedList( TickType_t xTicksToWait,
                                            const BaseType_t xCanBlockIndefinitely )
{
    // 保存相对等待时间转换后的绝对唤醒 tick
    TickType_t xTimeToWake;
    // 快照进入函数时的 tick，避免后续计算基准变化
    const TickType_t xConstTickCount = xTickCount;
    // 快照当前 tick 周期的延时列表
    List_t * const pxDelayedList = pxDelayedTaskList;
    // 快照下一 tick 周期的溢出延时列表
    List_t * const pxOverflowDelayedList = pxOverflowDelayedTaskList;

    // 编译延时中止接口时，新一轮阻塞需清除旧的中止标志
    #if ( INCLUDE_xTaskAbortDelay == 1 )
    {
        // 任务刚进入阻塞时清除上一次的延时中止痕迹
        pxCurrentTCB->ucDelayAborted = ( uint8_t ) pdFALSE;
    }
    #endif

    // 将任务的 xStateListItem 成员从就绪列表中移除
    if( uxListRemove( &( pxCurrentTCB->xStateListItem ) ) == ( UBaseType_t ) 0 )
    {
        // 原就绪列表变空时同步清除该优先级的就绪标记
        portRESET_READY_PRIORITY( pxCurrentTCB->uxPriority, uxTopReadyPriority );
    }

    // INCLUDE_vTaskSuspend 为1时，允许用挂起列表表示无限期等待
    #if ( INCLUDE_vTaskSuspend == 1 )
    {
        // 允许无限等待且超时值为最大值时，任务不应由 tick 唤醒
        if( ( xTicksToWait == portMAX_DELAY ) && ( xCanBlockIndefinitely != pdFALSE ) )
        {
            // 无限期等待进入挂起列表，不参与 tick 超时扫描
            listINSERT_END( &xSuspendedTaskList, &( pxCurrentTCB->xStateListItem ) );
        }
        else
        {
            // 将相对等待 tick 转换为绝对唤醒 tick
            xTimeToWake = xConstTickCount + xTicksToWait;

            // 状态列表项值作为按唤醒 tick 排序的键
            listSET_LIST_ITEM_VALUE( &( pxCurrentTCB->xStateListItem ), xTimeToWake );

            // 结果小于起始 tick 表明加法跨过了 TickType_t 溢出点
            if( xTimeToWake < xConstTickCount )
            {
                // 跨越 tick 溢出点的任务进入下一周期延时列表
                vListInsert( pxOverflowDelayedList, &( pxCurrentTCB->xStateListItem ) );
            }
            else
            {
                // 未溢出的任务按唤醒 tick 插入当前周期延时列表
                vListInsert( pxDelayedList, &( pxCurrentTCB->xStateListItem ) );

                // 新任务成为最早超时者时，同步更新调度器的快速检查阈值
                if( xTimeToWake < xNextTaskUnblockTime )
                {
                    xNextTaskUnblockTime = xTimeToWake;
                }
            }
        }
    }
    #else
    {
        // 未编译挂起功能时所有等待都必须转换为有限期延时
        xTimeToWake = xConstTickCount + xTicksToWait;

        // 以绝对唤醒 tick 作为延时列表排序键
        listSET_LIST_ITEM_VALUE( &( pxCurrentTCB->xStateListItem ), xTimeToWake );

        // 加法回绕表示唤醒时刻属于下一 tick 周期
        if( xTimeToWake < xConstTickCount )
        {
            // 插入溢出延时列表，等待 tick 回绕后成为当前列表
            vListInsert( pxOverflowDelayedList, &( pxCurrentTCB->xStateListItem ) );
        }
        else
        {
            // 插入当前周期延时列表
            vListInsert( pxDelayedList, &( pxCurrentTCB->xStateListItem ) );

            // 新任务更早超时时更新快速检查阈值
            if( xTimeToWake < xNextTaskUnblockTime )
            {
                xNextTaskUnblockTime = xTimeToWake;
            }
        }

        // 该构建不使用无限阻塞参数，显式取值抑制未使用形参诊断
        ( void ) xCanBlockIndefinitely;
    }
    #endif
}
```
**③任务挂起**
>**概述**：`FreeRTOS`提供`vTaskSuspend`和`vTaskResume`**主动挂起与恢复任务**，使任务进入`Suspended`状态或重新回到`Ready`状态
{%list%}
vTaskSuspend会将任务从原状态列表移入xSuspendedTaskList，vTaskResume则将真正挂起的任务重新加入就绪列表
{%endlist%}
{%right%}
若挂起的是当前正在运行的任务pxCurrentTCB或者唤醒了优先级更高的任务，需要触发任务调度或更新pxCurrentTCB
{%endright%}
{%warning%}
xSuspendedTaskList还会保存无限期阻塞任务，因此需要通过prvTaskIsTaskSuspended判断任务是否真正处于Suspended状态
{%endwarning%}
>还需满足`xEventListItem`不位于`xPendingReadyList`或**事件列表**，同时也没有处于`taskWAITING_NOTIFICATION`的**通知等待状态**
```c
/*
 * 函数功能：
 * 将指定任务从就绪、延时及事件等待关系中移出并放入挂起列表，必要时驱逐正在运行的任务
 *
 * 参数：
 * xTaskToSuspend  输入待挂起任务句柄，传入 NULL 表示当前任务
 *
 * 返回值：
 * 无返回值
 */
void vTaskSuspend( TaskHandle_t xTaskToSuspend )
{
    // 指向最终被挂起的任务控制块
    TCB_t * pxTCB;

    // 进入临界区，原子更新任务所属的状态列表和事件列表
    taskENTER_CRITICAL();
    {
        // NULL 句柄由内核解析为当前任务，并校验所得 TCB
        pxTCB = prvGetTCBFromHandle( xTaskToSuspend );
        configASSERT( pxTCB != NULL );

        // 从当前状态列表删除任务，若该优先级就绪列表变空则同步就绪优先级记录
        if( uxListRemove( &( pxTCB->xStateListItem ) ) == ( UBaseType_t ) 0 )
        {
            taskRESET_READY_PRIORITY( pxTCB->uxPriority );
        }

        // 若任务同时挂在内核对象事件列表上，也解除该等待关系
        if( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) != NULL )
        {
            ( void ) uxListRemove( &( pxTCB->xEventListItem ) );
        }

        // 将状态列表项加入挂起列表，正式发布挂起状态
        vListInsertEnd( &xSuspendedTaskList, &( pxTCB->xStateListItem ) );

        /* 如果启用了任务通知，还需要清除其通知槽中的等待标志，此处略 */

        /* 如果启用了多核，还需要检查任务是否仍在某个核心运行，如果是则请求该核心重新调度，使任务真正停止执行，此处略 */
    }
    // 完成全部列表和运行状态调整后退出临界区
    taskEXIT_CRITICAL();

    // 单核下挂起当前任务后还需处理最近唤醒时刻和启动前当前任务指针
    #if ( configNUMBER_OF_CORES == 1 )
    {
        // 单核路径记录挂起列表长度，用于调度器未启动时修正当前任务指针
        UBaseType_t uxCurrentListLength;

        // 调度器运行时重算最近唤醒时刻，因为可能挂起任务处于延时列表中
        if( xSchedulerRunning != pdFALSE )
        {
            // 最近唤醒时刻属于共享调度状态，以临界区保护重新计算
            taskENTER_CRITICAL();
            {
                // 从当前延时列表表头更新下一任务唤醒 Tick
                prvResetNextTaskUnblockTime();
            }
            taskEXIT_CRITICAL();
        }

        // 仅挂起当前任务才需要立即让出或重选 pxCurrentTCB
        if( pxTCB == pxCurrentTCB )
        {
            // 调度器已运行时要求当前任务在返回前切换出去
            if( xSchedulerRunning != pdFALSE )
            {
                // 当前任务只有在调度器未暂停时才能立即让出
                configASSERT( uxSchedulerSuspended == 0 );

                // 触发任务调度，本质上是
                portYIELD_WITHIN_API();
            }
            else
            {
                // 读取 xSuspendedTaskList 列表的长度
                uxCurrentListLength = listCURRENT_LIST_LENGTH( &xSuspendedTaskList );

                // 所有任务均挂起时清空当前任务，否则从剩余可运行任务中重新选择
                if( uxCurrentListLength == uxCurrentNumberOfTasks )
                {
                    pxCurrentTCB = NULL;
                }
                else
                {
                    // 选择下一运行任务并更新 pxCurrentTCB
                    vTaskSwitchContext();
                }
            }
        }
    }
    #endif
}
```
```c
/*
 * 函数功能：
 * 从任务上下文恢复一个真正挂起的任务，将其转入就绪列表并按抢占配置请求调度
 *
 * 参数：
 * xTaskToResume  输入待恢复的非空任务句柄
 *
 * 返回值：
 * 无返回值
 */
void vTaskResume( TaskHandle_t xTaskToResume )
{
    // 直接保存目标任务 TCB，恢复当前调用任务本身没有意义
    TCB_t * const pxTCB = xTaskToResume;

    // 要求调用者提供明确的目标任务
    configASSERT( xTaskToResume );

    // 单核排除当前任务，多核仅排除空句柄并在临界区内确认真实挂起状态
    #if ( configNUMBER_OF_CORES == 1 )
        // 单核可直接排除当前任务和空句柄
        if( ( pxTCB != pxCurrentTCB ) && ( pxTCB != NULL ) )
    #else
        // SMP 只在此排除空句柄，运行状态在临界区内由列表关系判定
        if( pxTCB != NULL )
    #endif
    {
        // 临界区保护挂起列表删除、就绪列表插入和调度请求
        taskENTER_CRITICAL();
        {
            // 仅恢复真正处于挂起态且未被 ISR 提前恢复的任务
            if( prvTaskIsTaskSuspended( pxTCB ) != pdFALSE )
            {
                // 先解除挂起列表归属
                ( void ) uxListRemove( &( pxTCB->xStateListItem ) );

                // 再按任务优先级更新就绪状态并插入就绪列表
                prvAddTaskToReadyList( pxTCB );

                // 预抢占配置下请求合适核心重新调度
                taskYIELD_ANY_CORE_IF_USING_PREEMPTION( pxTCB );
            }
        }
        // 完成挂起到就绪迁移及让出请求后退出临界区
        taskEXIT_CRITICAL();
    }
}
```
```c
/*
 * 函数功能：
 * 在临界区调用约束下判定任务是否处于可由恢复 API 恢复的真正挂起状态
 *
 * 参数：
 * xTask  输入待判定的非空任务句柄
 *
 * 返回值：
 * pdTRUE   任务位于挂起链表且不是待就绪或无限期通知等待
 * pdFALSE  任务不满足可恢复的挂起状态
 */
STATIC BaseType_t prvTaskIsTaskSuspended( const TaskHandle_t xTask )
{
    // 默认按非挂起处理，仅在全部链表条件成立后置真
    BaseType_t xReturn = pdFALSE;
    // 将句柄作为只读 TCB 使用
    const TCB_t * const pxTCB = xTask;

    // 恢复接口要求显式传入目标任务，NULL 不具备可判定对象
    configASSERT( xTask );

    // 第一层确认状态链表项确实属于挂起链表
    if( listIS_CONTAINED_WITHIN( &xSuspendedTaskList, &( pxTCB->xStateListItem ) ) != pdFALSE )
    {

        // 已在待就绪链表中的任务已由 ISR 发起恢复，不能重复恢复
        if( listIS_CONTAINED_WITHIN( &xPendingReadyList, &( pxTCB->xEventListItem ) ) == pdFALSE )
        {
            // 事件链表项不属于任何对象时，才可能是真挂起而非无限期阻塞
            if( listIS_CONTAINED_WITHIN( NULL, &( pxTCB->xEventListItem ) ) != pdFALSE )
            {
                // 启用任务通知时，等待通知的任务虽在挂起链表中仍应归为阻塞态
                #if ( configUSE_TASK_NOTIFICATIONS == 1 )
                {
                    // 逐槽检查通知状态，以排除无限期等待任务通知的阻塞任务
                    BaseType_t x;

                    // 先假定是真挂起，发现任一通知等待槽后撤销结论
                    xReturn = pdTRUE;

                    for( x = ( BaseType_t ) 0; x < ( BaseType_t ) configTASK_NOTIFICATION_ARRAY_ENTRIES; x++ )
                    {
                        // 该通知槽是否仍处于等待状态
                        if( pxTCB->ucNotifyState[ x ] == taskWAITING_NOTIFICATION )
                        {
                            xReturn = pdFALSE;
                            break;
                        }
                    }
                }
                #else
                {
                    // 未启用任务通知时，无事件链表归属即可确认是真挂起
                    xReturn = pdTRUE;
                }
                #endif
            }
        }
    }

    // 返回综合状态链表、待就绪链表和通知等待状态的判定
    return xReturn;
}
```
**④任务删除**
>**概述**：`FreeRTOS`提供`vTaskDelete`删除指定任务，将其从**调度系统**移除并根据其**当前运行状态**选择**立即释放或延迟回收**相关资源
{%list%}
如果任务正在运行且调度器已经启动，则将其加入xTasksWaitingTermination并立马触发任务切换，反之直接回收其TCB和任务栈
{%endlist%}
{%right%}
Idle Task会执行prvCheckTasksWaitingTermination进行任务资源的延迟回收，确认任务退出运行态后再安全回收其TCB和任务栈
{%endright%}
{%warning%}
运行任务的任务栈仍被CPU作为当前执行栈使用，TCB也仍会被上下文切换代码访问，直接释放会导致访问已释放内存
{%endwarning%}
{%wrong%}
vTaskDelete只负责回收任务自身的内核资源，任务运行期间动态申请的内存、外设或其他应用资源仍需由应用自行释放
{%endwrong%}
```c
/*
 * 函数功能：
 * 将指定任务从调度和事件列表移除，并根据其是否仍在运行选择立即释放或交由空闲任务延迟回收
 *
 * 参数：
 * xTaskToDelete  待删除任务句柄，NULL 表示调用任务自身
 *
 * 返回值：
 * 无返回值
 */
void vTaskDelete( TaskHandle_t xTaskToDelete )
{
    // 保存待删除任务的控制块
    TCB_t * pxTCB;
    // 标记是否由空闲任务回收资源
    BaseType_t xDeleteTCBInIdleTask = pdFALSE;
    // 记录任务是否仍在运行或等待切换
    BaseType_t xTaskIsRunningOrYielding;

    // 进入临界区，保护任务链表和任务计数
    taskENTER_CRITICAL();
    {
        // 获取待删除任务的 TCB，传入 NULL 时使用当前任务
        pxTCB = prvGetTCBFromHandle( xTaskToDelete );

        // 检查任务控制块指针是否非空
        configASSERT( pxTCB != NULL );

        // 将任务移出状态链表，并检查移除后该链表是否为空
        if( uxListRemove( &( pxTCB->xStateListItem ) ) == ( UBaseType_t ) 0 )
        {
            // 启用端口优化时，清除已空就绪链表的优先级标记
            taskRESET_READY_PRIORITY( pxTCB->uxPriority );
        }

        // 任务的事件节点是否仍在链表中
        if( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) != NULL )
        {
            // 将事件节点移出所在链表
            ( void ) uxListRemove( &( pxTCB->xEventListItem ) );
        }

        // 更新任务变更序号，便于调试器刷新任务信息
        uxTaskNumber++;

        // 检查任务是否仍在运行或已被要求切换出去
        xTaskIsRunningOrYielding = taskTASK_IS_RUNNING_OR_SCHEDULED_TO_YIELD( pxTCB );

        // 调度器已启动，且任务仍在运行或等待切换时，延后回收资源
        if( ( xSchedulerRunning != pdFALSE ) && ( xTaskIsRunningOrYielding != pdFALSE ) )
        {
            // 将任务加入待回收链表
            vListInsertEnd( &xTasksWaitingTermination, &( pxTCB->xStateListItem ) );

            // 增加待回收任务数
            ++uxDeletedTasksWaitingCleanUp;

            // 交由空闲任务回收该任务的资源
            xDeleteTCBInIdleTask = pdTRUE;

            /* 执行移植层特定的任务删除前处理钩子函数，此处略 */

            /* SMP 下若目标任务仍在某个核心运行，则请求对应核心重新调度此处略 */
        }
        else
        {
            // 任务无需延后回收，减少内核登记的任务数
            --uxCurrentNumberOfTasks;

            // 更新下一次延时任务的唤醒时刻
            prvResetNextTaskUnblockTime();
        }
    }

    // 退出临界区
    taskEXIT_CRITICAL();

    // 是否无需交由空闲任务回收
    if( xDeleteTCBInIdleTask != pdTRUE )
    {
        // 在临界区外回收该任务的资源
        prvDeleteTCB( pxTCB );
    }

    // configNUMBER_OF_CORES 为 1 时，如果删除的是 pxCurrentTCB 则需要触发任务切换
    #if ( configNUMBER_OF_CORES == 1 )
    {
        // 调度器是否已经启动
        if( xSchedulerRunning != pdFALSE )
        {
            // 被删除的是否为当前任务
            if( pxTCB == pxCurrentTCB )
            {
                // 确认调度器未被挂起
                configASSERT( uxSchedulerSuspended == 0 );
                // 请求切换到其他任务
                taskYIELD_WITHIN_API();
            }
        }
    }
    #endif
}
```
```c
/*
 * 函数功能：
 * 由空闲任务从待终止链表取出可回收任务并释放其 TCB 与栈资源
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
STATIC void prvCheckTasksWaitingTermination( void )
{
    // INCLUDE_vTaskDelete 为 1 时，编译任务删除后的延迟回收逻辑
    #if ( INCLUDE_vTaskDelete == 1 )
    {
        // 保存本轮准备回收的任务控制块
        TCB_t * pxTCB;

        // 只要还有待回收任务，就继续检查和回收
        while( uxDeletedTasksWaitingCleanUp > ( UBaseType_t ) 0U )
        {
            // configNUMBER_OF_CORES 为 1 时使用单核回收流程，否则使用多核回收流程
            #if ( configNUMBER_OF_CORES == 1 )
            {
                // 进入临界区，保护待回收链表和任务计数
                taskENTER_CRITICAL();
                {
                    {
                        // 获取待回收链表中首个任务的 TCB
                        pxTCB = listGET_OWNER_OF_HEAD_ENTRY( ( &xTasksWaitingTermination ) );
                        // 将任务移出待回收链表
                        ( void ) uxListRemove( &( pxTCB->xStateListItem ) );
                        // 减少任务总数和待回收任务数
                        --uxCurrentNumberOfTasks;
                        --uxDeletedTasksWaitingCleanUp;
                    }
                }
                // 退出临界区
                taskEXIT_CRITICAL();

                // 在临界区外回收该任务的资源
                prvDeleteTCB( pxTCB );
            }
            #else
            {
                /* SMP下任务删除与资源释放是分离的，Idle Task只有确认任务已不在任何核心运行后，才会将其从终止列表移除并释放资源，此处略 */
            }
            #endif
        }
    }
    #endif
}
```
```c
/*
 * 函数功能：
 * 清理任务的端口与 C 运行时 TLS 资源，并按分配方式释放栈和 TCB
 *
 * 参数：
 * pxTCB  已从调度链表移除、等待销毁的任务控制块
 *
 * 返回值：
 * 无返回值
 */
STATIC void prvDeleteTCB( TCB_t * pxTCB )
{

    // 执行端口的任务资源清理操作
    portCLEAN_UP_TCB( pxTCB );

    // configUSE_C_RUNTIME_TLS_SUPPORT 为 1 时，还需销毁每任务 TLS 块
    #if ( configUSE_C_RUNTIME_TLS_SUPPORT == 1 )
    {
        // 启用 C 运行时 TLS 支持时先销毁任务的 TLS 块
        configDEINIT_TLS_BLOCK( pxTCB->xTLSBlock );
    }
    #endif

    // configSUPPORT_DYNAMIC_ALLOCATION 为 1 且 configSUPPORT_STATIC_ALLOCATION 为 0 且 portUSING_MPU_WRAPPERS 为 0 时，纯动态构建可直接释放两块内存，混合构建则必须检查创建时的所有权标记
    #if ( ( configSUPPORT_DYNAMIC_ALLOCATION == 1 ) && ( configSUPPORT_STATIC_ALLOCATION == 0 ) && ( portUSING_MPU_WRAPPERS == 0 ) )
    {
        // 纯动态分配构建中，栈与 TCB 都归内核分配器回收
        vPortFreeStack( pxTCB->pxStack );
        // 释放动态分配的任务控制块
        vPortFree( pxTCB );
    }
    // 栈与 TCB 可能采用不同分配方式时，按任务创建方式分别释放
    #elif ( tskSTATIC_AND_DYNAMIC_ALLOCATION_POSSIBLE != 0 )
    {
        // 任务栈和 TCB 都使用动态内存时
        if( pxTCB->ucStaticallyAllocated == tskDYNAMICALLY_ALLOCATED_STACK_AND_TCB )
        {
            // 栈与 TCB 都由动态分配器创建，按先栈后 TCB 的顺序全部释放
            vPortFreeStack( pxTCB->pxStack );
            // 释放动态分配的任务控制块
            vPortFree( pxTCB );
        }
        // 任务栈由调用者提供、TCB 使用动态内存时
        else if( pxTCB->ucStaticallyAllocated == tskSTATICALLY_ALLOCATED_STACK_ONLY )
        {
            // 栈由应用静态提供，仅 TCB 需要交还动态分配器
            vPortFree( pxTCB );
        }
        else
        {
            // 栈与 TCB 均为静态存储时不释放，只验证所有权标记合法
            configASSERT( pxTCB->ucStaticallyAllocated == tskSTATICALLY_ALLOCATED_STACK_AND_TCB );
            mtCOVERAGE_TEST_MARKER();
        }
    }
    #endif
}
```
