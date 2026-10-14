---
title: FreeRTOS源码阅读（九）
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
date: 2026-09-30 16:22:19
keywords:
summary: FreeRTOS信号量与互斥量
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（九）
#### 信号量与互斥量
**①引言**
>**概述**：`FreeRTOS`的信号量和互斥量是基于`Queue_t`实现的**特殊队列**，提供`xSemaphoreCreateCounting`等接口创建信号量和互斥量
{%list%}
由信号量和互斥量的创建接口可知，其本质就是数据项大小为0的特殊队列，不存储实际消息，仅复用队列的计数、阻塞与唤醒机制
{%endlist%}
{%right%}
普通信号量和消息队列的pcHead会被设置为一个非空地址，而互斥量则特意将其设置为NULL，用于运行时识别互斥量
{%endright%}
{%warning%}
queueQUEUE_TYPE_*宏也用于记录具体的队列对象类型，主要服务于跟踪和调试，仅在开启configUSE_TRACE_FACILITY时有效
{%endwarning%}
{%wrong%}
互斥量依赖任务所有权和优先级继承机制，而中断没有任务身份，无法参与优先级继承，因此不能在中断中获取或释放互斥量
{%endwrong%}
```c
/* semphr.h */
/* 信号量句柄与队列句柄共用表示，区别由对象类型和零长度载荷语义决定 */
typedef QueueHandle_t SemaphoreHandle_t;

/* 信号量对队列容量、载荷与等待时间的约定 */
#define semBINARY_SEMAPHORE_QUEUE_LENGTH    ( ( UBaseType_t ) 1U ) // 二值信号量的最大可用计数为 1
#define semSEMAPHORE_QUEUE_ITEM_LENGTH      ( ( UBaseType_t ) 0U ) // 信号量的数据项长度为 0，只维护计数，不复制载荷
#define semGIVE_BLOCK_TIME                  ( ( TickType_t ) 0U )  // 释放信号量时不等待，最长阻塞时间固定为 0 tick

/* queue.c */
/* 复用pcHead成员作为互斥量标记，用于运行时识别 */
#define uxQueueType         pcHead

/* pcHead为NULL表示互斥量，非NULL表示普通队列或信号量 */
#define queueQUEUE_IS_MUTEX NULL

/* queue.h */
/* 队列对象类型标识 */
#define queueQUEUE_TYPE_BASE                ( ( uint8_t ) 0U ) // 普通消息队列
#define queueQUEUE_TYPE_MUTEX               ( ( uint8_t ) 1U ) // 普通互斥量
#define queueQUEUE_TYPE_COUNTING_SEMAPHORE  ( ( uint8_t ) 2U ) // 计数信号量
#define queueQUEUE_TYPE_BINARY_SEMAPHORE    ( ( uint8_t ) 3U ) // 二值信号量
#define queueQUEUE_TYPE_RECURSIVE_MUTEX     ( ( uint8_t ) 4U ) // 递归互斥量
```
```c
/*
 * 函数功能：
 * 创建初始计数为 0 的二值信号量，需先 give 才能 take
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 对象句柄  成功创建的二值信号量
 * NULL      对象创建失败
 */
#define xSemaphoreCreateBinary()    xQueueGenericCreate( ( UBaseType_t ) 1, semSEMAPHORE_QUEUE_ITEM_LENGTH, queueQUEUE_TYPE_BINARY_SEMAPHORE )

/*
 * 函数功能：
 * 创建最大计数 uxMaxCount、初始计数 uxInitialCount 的信号量
 *
 * 参数：
 * uxMaxCount      输入，计数信号量允许的最大计数，必须大于 0
 * uxInitialCount  输入，初始可用计数，不得超过 uxMaxCount
 *
 * 返回值：
 * 对象句柄  成功创建的计数信号量
 * NULL      对象创建失败
 */
#define xSemaphoreCreateCounting( uxMaxCount, uxInitialCount )    xQueueCreateCountingSemaphore( ( uxMaxCount ), ( uxInitialCount ) )

 /*
 * 函数功能：
 * 动态创建初始可用的普通互斥锁，支持优先级继承，仅能在任务上下文获取和释放
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 对象句柄  成功创建的互斥锁
 * NULL      对象创建失败
 */
#define xSemaphoreCreateMutex()    xQueueCreateMutex( queueQUEUE_TYPE_MUTEX )

 /*
  * 函数功能：
  * 动态创建递归互斥锁，需配套使用 TakeRecursive 与 GiveRecursive
  *
  * 参数：
  * 无
  *
  * 返回值：
  * 对象句柄  成功创建的递归互斥锁
  * NULL      对象创建失败
  */
#define xSemaphoreCreateRecursiveMutex()    xQueueCreateMutex( queueQUEUE_TYPE_RECURSIVE_MUTEX )
```
```c
/*
 * 函数功能：
 * 动态创建计数信号量并设置初始计数
 *
 * 参数：
 * uxMaxCount      输入，最大计数
 * uxInitialCount  输入，初始计数，不得大于最大计数
 *
 * 返回值：
 * 非 NULL         创建成功的信号量句柄
 * NULL            参数无效或分配失败
 */
QueueHandle_t xQueueCreateCountingSemaphore( const UBaseType_t uxMaxCount,
                                                const UBaseType_t uxInitialCount )
{
    // 保存动态创建得到的计数信号量句柄
    QueueHandle_t xHandle = NULL;

    // 最大计数必须非零，初始计数不能超过最大计数
    if( ( uxMaxCount != 0U ) &&
        ( uxInitialCount <= uxMaxCount ) )
    {
        // 动态创建项目大小为 0 的队列，容量等于最大计数
        xHandle = xQueueGenericCreate( uxMaxCount, queueSEMAPHORE_QUEUE_ITEM_LENGTH, queueQUEUE_TYPE_COUNTING_SEMAPHORE );

        // 队列创建成功，才能填写信号量的初始计数
        if( xHandle != NULL )
        {
            // 设置初始可用计数，之后释放时加一、获取时减一
            ( ( Queue_t * ) xHandle )->uxMessagesWaiting = uxInitialCount;
        }
    }
    else
    {
        // 最大计数为零或初始计数越界时触发断言
        configASSERT( xHandle );
    }

    return xHandle;
}
```
```c
/*
 * 函数功能：
 * 动态创建并初始化普通或递归互斥量
 *
 * 参数：
 * ucQueueType  输入，互斥量类型
 *
 * 返回值：
 * 非 NULL      创建成功的互斥量句柄
 * NULL         内存分配失败
 */
QueueHandle_t xQueueCreateMutex( const uint8_t ucQueueType )
{
    // 保存队列创建结果，随后用它初始化互斥量
    QueueHandle_t xNewQueue;

    // 保存互斥量所用队列的容量和项目大小，交给通用创建函数
    const UBaseType_t uxMutexLength = ( UBaseType_t ) 1, uxMutexSize = ( UBaseType_t ) 0;

    // 调用通用创建函数申请队列，失败时得到 NULL
    xNewQueue = xQueueGenericCreate( uxMutexLength, uxMutexSize, ucQueueType );

    // 把新队列初始化为互斥量；创建失败时，由初始化函数记录失败
    prvInitialiseMutex( ( Queue_t * ) xNewQueue );

    return xNewQueue;
}
```
```c
/*
 * 函数功能：
 * 把已创建的容量为 1、项目大小为 0 的队列初始化为互斥量
 *
 * 参数：
 * pxNewQueue  输入输出，待配置的队列控制块
 *
 * 返回值：
 * 无返回值
 */
static void prvInitialiseMutex( Queue_t * pxNewQueue )
{
    // 队列创建成功，才可以把它初始化为互斥量
    if( pxNewQueue != NULL )
    {
        // 新互斥量尚无持有任务，清空持有者句柄
        pxNewQueue->u.xSemaphore.xMutexHolder = NULL;

        // 通过 uxQueueType 访问 pcHead，将它设为 NULL，标记这是互斥量
        pxNewQueue->uxQueueType = queueQUEUE_IS_MUTEX;

        // 重复获取次数清零，新互斥量还没有被任何任务获取
        pxNewQueue->u.xSemaphore.uxRecursiveCallCount = 0;

        // 不等待地归还一个计数，使新互斥量一开始就能被获取
        ( void ) xQueueGenericSend( pxNewQueue, NULL, ( TickType_t ) 0U, queueSEND_TO_BACK );
    }
}
```
**②获取与释放**
>**概述**：`FreeRTOS`提供`xSemaphoreTake`和`xSemaphoreGive`两个接口实现**信号量与普通互斥量的获取和释放**，如下所示
{%list%}
xSemaphoreTake的底层实现为xQueueSemaphoreTake，xSemaphoreGive的底层实现为xQueueGenericSend
{%endlist%}
>`xQueueSemaphoreTake`负责检查并扣减**可用计数**，计数为`0`时按需**阻塞等待**，并处理互斥量的**任务所有权**和**优先级继承**

>`xSemaphoreGive`负责增加可用计数并按需**唤醒等待任务**，释放互斥量时还需**清除任务所有权**，并根据情况**恢复持有任务优先级**
{%right%}
信号量主要用于事件同步和资源计数，互斥量主要用于保护共享资源，防止多个任务同时访问，并通过优先级继承缓解优先级反转
{%endright%}
{%warning%}
普通互斥量不支持同一任务重复获取，未释放前再次阻塞等待可能导致死锁，且互斥量应由持有任务负责释放
{%endwarning%}
```c
/*
 * 函数功能：
 * 任务获取二值或计数信号量、普通互斥锁，等待单位为 tick
 *
 * 参数：
 * xSemaphore  输入，信号量或互斥锁句柄，允许的对象类型见接口契约
 * xBlockTime  输入，获取对象的最长等待时间，单位 tick，0 表示立即尝试
 *
 * 返回值：
 * pdTRUE   成功取得信号量或相应互斥锁
 * pdFALSE  等待结束时仍未取得对象
 */
#define xSemaphoreTake( xSemaphore, xBlockTime )    xQueueSemaphoreTake( ( xSemaphore ), ( xBlockTime ) )

/*
 * 函数功能：
 * 释放二值或计数信号量、普通互斥锁，等待时间固定为 0；普通互斥锁必须由拥有者释放
 *
 * 参数：
 * xSemaphore  输入，信号量或互斥锁句柄，允许的对象类型见接口契约
 *
 * 返回值：
 * pdTRUE   成功释放信号量或相应层次的互斥锁持有
 * pdFALSE  对象不允许本次释放
 */
#define xSemaphoreGive( xSemaphore )    xQueueGenericSend( ( QueueHandle_t ) ( xSemaphore ), NULL, semGIVE_BLOCK_TIME, queueSEND_TO_BACK )
```
```c
/*
 * 函数功能：
 * 获取二值信号量、计数信号量或互斥量；需要等待时处理阻塞，互斥量还要处理临时提高的优先级
 *
 * 参数：
 * xQueue          输入，信号量或互斥量句柄
 * xTicksToWait    输入，计数为 0 时允许阻塞的最大 tick 数
 *
 * 返回值：
 * pdPASS          获取成功
 * errQUEUE_EMPTY  等待期限内计数仍为 0
 */
BaseType_t xQueueSemaphoreTake( QueueHandle_t xQueue,
                                TickType_t xTicksToWait )
{
    // 记录是否已经开始计时，避免每次重试都重新计算完整的等待时间
    BaseType_t xEntryTimeSet = pdFALSE;
    // 保存等待开始时的 tick 计数和溢出次数，用来计算还能等多久
    TimeOut_t xTimeOut;
    // 通过信号量或互斥量句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // configUSE_MUTEXES == 1 时，记录本次等待是否涉及优先级继承，以便超时后重新调整持有任务的优先级
    #if ( configUSE_MUTEXES == 1 )
        // 记录本次等待是否涉及临时提高持有任务的优先级，超时后据此重新检查
        BaseType_t xInheritanceOccurred = pdFALSE;
    #endif

    // 断言信号量或互斥量句柄有效
    configASSERT( ( pxQueue ) );

    // 项目大小必须为 0，这里只处理信号量或互斥量的可用计数
    configASSERT( pxQueue->uxItemSize == 0 );

    // INCLUDE_xTaskGetSchedulerState == 1 时提供调度器状态查询，configUSE_TIMERS == 1 时也需要该接口；任一为 1 时检查是否允许阻塞
    #if ( ( INCLUDE_xTaskGetSchedulerState == 1 ) || ( configUSE_TIMERS == 1 ) )
    {
        // 调度器挂起时不能阻塞，因此等待时间必须为 0
        configASSERT( !( ( xTaskGetSchedulerState() == taskSCHEDULER_SUSPENDED ) && ( xTicksToWait != 0 ) ) );
    }
    #endif

    // 没有可用计数时等待后重试，直到获取成功、不允许等待或等待时间已到
    for( ; ; )
    {
        // 进入临界区，保护可用计数、持有任务和等待列表
        taskENTER_CRITICAL();
        {
            // 保存这次读取的可用计数，用来判断是否能获取并计算获取后的数量
            const UBaseType_t uxSemaphoreCount = pxQueue->uxMessagesWaiting;

            // 可用计数大于 0，当前任务可以立即获取
            if( uxSemaphoreCount > ( UBaseType_t ) 0 )
            {
                // 获取后可用计数减一；如果是互斥量，就从可获取变为已被持有
                pxQueue->uxMessagesWaiting = ( UBaseType_t ) ( uxSemaphoreCount - ( UBaseType_t ) 1 );

                // configUSE_MUTEXES == 1 时支持互斥量，获取成功后还要记录持有任务
                #if ( configUSE_MUTEXES == 1 )
                {
                    // 标记表明这是互斥量，需要记下当前持有它的任务
                    if( pxQueue->uxQueueType == queueQUEUE_IS_MUTEX )
                    {
                        // 当前任务持有的互斥量数量加一，并将当前任务记为此互斥量的持有者
                        pxQueue->u.xSemaphore.xMutexHolder = pvTaskIncrementMutexHeldCount();
                    }
                }
                #endif

                // 获取后计数少了一次，检查是否有任务正在等待向该对象发送
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToSend ) ) == pdFALSE )
                {
                    // 唤醒一个发送等待者，返回非 pdFALSE 时，需要安排任务切换
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToSend ) ) != pdFALSE )
                    {
                        // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                        queueYIELD_IF_USING_PREEMPTION();
                    }
                }

                // 获取完成，互斥量的持有任务也已记录，退出临界区
                taskEXIT_CRITICAL();

                // 本次获取成功
                return pdPASS;
            }
            else
            {
                // 可用计数为 0，而且剩余等待时间为 0，立即返回获取失败
                if( xTicksToWait == ( TickType_t ) 0 )
                {
                    // 现在不能获取且不能继续等待，退出临界区后返回失败
                    taskEXIT_CRITICAL();

                    // 返回队列空错误
                    return errQUEUE_EMPTY;
                }
                // 第一次发现需要等待计数，还没有记录等待开始的时间
                else if( xEntryTimeSet == pdFALSE )
                {
                    // 记录本次获取开始等待时的 tick 计数和溢出次数
                    vTaskInternalSetTimeOutState( &xTimeOut );

                    // 标记已经开始计时，之后重试只使用剩余等待时间
                    xEntryTimeSet = pdTRUE;
                }
            }
        }
        // 本次检查结束，退出临界区，接下来准备等待可用计数
        taskEXIT_CRITICAL();

        // 挂起调度器，准备将当前任务加入获取等待列表
        vTaskSuspendAll();
        // 锁住事件列表，避免 ISR 在加入等待任务的过程中直接修改列表
        prvLockQueue( pxQueue );

        // 扣除已经等过的时间后还没超时，可以继续准备等待
        if( xTaskCheckForTimeOut( &xTimeOut, &xTicksToWait ) == pdFALSE )
        {
            // 锁住事件列表后计数仍为 0，当前任务确实需要等待
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
                // configUSE_MUTEXES == 1 时，等待互斥量前还要考虑是否临时提高持有任务的优先级
                #if ( configUSE_MUTEXES == 1 )
                {
                    // 这是互斥量，等待前需要检查是否临时提高持有任务的优先级
                    if( pxQueue->uxQueueType == queueQUEUE_IS_MUTEX )
                    {
                        // 在临界区内检查和调整互斥量持有者优先级
                        taskENTER_CRITICAL();
                        {
                            // 必要时让持有任务继承当前任务的优先级，并记下本次等待涉及继承
                            xInheritanceOccurred = xTaskPriorityInherit( pxQueue->u.xSemaphore.xMutexHolder );
                        }
                        // 优先级处理完成，退出这段临界区，接下来加入等待列表
                        taskEXIT_CRITICAL();
                    }
                }
                #endif

                // 把当前任务加入获取等待列表，最多再等剩余的 tick 数
                vTaskPlaceOnEventList( &( pxQueue->xTasksWaitingToReceive ), xTicksToWait );

                // 解锁队列，补做加入等待列表期间 ISR 推迟的唤醒操作
                prvUnlockQueue( pxQueue );

                // 恢复调度器时没有发生任务切换，需要主动让出处理器，让当前任务开始等待
                if( xTaskResumeAll() == pdFALSE )
                {
                    // 当前任务已经需要阻塞，主动让出处理器，让其他任务运行
                    taskYIELD_WITHIN_API();
                }
            }
            else
            {
                // 计数已经可用，不必阻塞；解锁并处理推迟的唤醒操作
                prvUnlockQueue( pxQueue );
                // 恢复调度器并重新尝试获取计数
                ( void ) xTaskResumeAll();
            }
        }
        else
        {
            // 等待时间已到，解锁并处理 ISR 推迟的唤醒操作
            prvUnlockQueue( pxQueue );

            // 恢复调度器，再检查计数；获取失败时还要检查持有任务的优先级
            ( void ) xTaskResumeAll();

            // 此时计数仍为 0，才返回获取失败，并按需要调整互斥量持有任务的优先级
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
                // configUSE_MUTEXES == 1 时，获取超时且计数仍为 0，还要处理此前临时提高的优先级
                #if ( configUSE_MUTEXES == 1 )
                {
                    // 本次等待涉及优先级继承，超时后需要重新检查持有任务的优先级
                    if( xInheritanceOccurred != pdFALSE )
                    {
                        // 进入临界区，保护对剩余等待任务优先级的读取，以及对持有任务优先级的调整
                        taskENTER_CRITICAL();
                        {
                            // 保存仍在等待获取的任务中的最高优先级，用来调整持有任务的优先级
                            UBaseType_t uxHighestWaitingPriority;

                            // 查询剩余等待任务的最高优先级，超时后持有任务仍可能需要为这些任务保持较高优先级
                            uxHighestWaitingPriority = prvGetHighestPriorityOfWaitToReceiveList( pxQueue );

                            // 按剩余等待任务调整持有任务的优先级；若它还持有其他互斥量，此函数不会降低其优先级
                            vTaskPriorityDisinheritAfterTimeout( pxQueue->u.xSemaphore.xMutexHolder, uxHighestWaitingPriority );
                        }
                        // 超时后的优先级处理完成，退出这段临界区
                        taskEXIT_CRITICAL();
                    }
                }
                #endif

                // 返回队列空错误
                return errQUEUE_EMPTY;
            }
        }
    }
}
```
```c
/*
 * 函数功能：
 * 任务向队首或队尾发送项目，也可覆盖容量为 1 的队列；没有空间时按指定时间等待
 *
 * 参数：
 * xQueue         输入，目标队列句柄
 * pvItemToQueue  输入，待复制项目的地址；项目大小为 0 时可为 NULL
 * xTicksToWait   输入，队列满时允许阻塞的最大 tick 数
 * xCopyPosition  输入，选择从队首发送、从队尾发送或覆盖已有项目
 *
 * 返回值：
 * pdPASS         写入成功
 * errQUEUE_FULL  等待期限内没有可用空间
 */
BaseType_t xQueueGenericSend( QueueHandle_t xQueue,
                              const void * const pvItemToQueue,
                              TickType_t xTicksToWait,
                              const BaseType_t xCopyPosition )
{
    // 记录是否已经开始计时，避免每次重试都重新计算完整的等待时间
    BaseType_t xEntryTimeSet = pdFALSE, xYieldRequired;
    // 保存等待开始时的 tick 计数和溢出次数，用来计算还能等多久
    TimeOut_t xTimeOut;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 断言目标队列句柄有效
    configASSERT( pxQueue );
    // 复制非零字节项目时，断言输入数据地址不为空
    configASSERT( !( ( pvItemToQueue == NULL ) && ( pxQueue->uxItemSize != ( UBaseType_t ) 0U ) ) );
    // 断言覆盖模式仅用于容量为 1 的队列
    configASSERT( !( ( xCopyPosition == queueOVERWRITE ) && ( pxQueue->uxLength != 1 ) ) );

    // 没有空间时等待后重试，直到发送成功、不允许等待或等待时间已到
    for( ; ; )
    {
        // 进入临界区，一起保护项目数、读写位置和等待列表
        taskENTER_CRITICAL();
        {
            // 队列还有空位，或者允许覆盖容量为 1 的队列，就可以立即写入
            if( ( pxQueue->uxMessagesWaiting < pxQueue->uxLength ) || ( xCopyPosition == queueOVERWRITE ) )
            {
                // configUSE_QUEUE_SETS == 1 时，已加入队列集的成员要通知队列集；为 0 时只唤醒本队列的等待任务
                #if ( configUSE_QUEUE_SETS == 1 )
                {
                    /* 若队列属于队列集则通知队列集有新消息可读（覆盖已有消息除外），否则唤醒等待接收的任务，并在必要时触发任务切换，此处略 */
                }
                // 未启用队列集，直接处理本队列的接收等待任务
                #else
                {
                    // 写入项目并更新计数，同时记下释放互斥量后是否需要切换任务
                    xYieldRequired = prvCopyDataToQueue( pxQueue, pvItemToQueue, xCopyPosition );

                    // 未启用队列集，检查本队列是否有接收等待任务
                    if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToReceive ) ) == pdFALSE )
                    {
                        // 唤醒优先级最高的接收等待者；返回非 pdFALSE 时，需要安排任务切换
                        if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToReceive ) ) != pdFALSE )
                        {
                            // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                            queueYIELD_IF_USING_PREEMPTION();
                        }
                    }
                    // 虽然没有接收等待者，但释放互斥量后优先级降低，也可能需要切换任务
                    else if( xYieldRequired != pdFALSE )
                    {
                        // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                        queueYIELD_IF_USING_PREEMPTION();
                    }
                    else
                }
                #endif

                // 写入完成，等待任务也已处理，退出临界区
                taskEXIT_CRITICAL();

                // 本次发送成功
                return pdPASS;
            }
            else
            {
                // 队列已满，而且剩余等待时间为 0，立即返回发送失败
                if( xTicksToWait == ( TickType_t ) 0 )
                {
                    // 本次不能继续等待，退出临界区后返回队列已满
                    taskEXIT_CRITICAL();

                    // 返回队列满错误
                    return errQUEUE_FULL;
                }
                // 第一次发现需要等待，还没有记录本次等待的开始时间
                else if( xEntryTimeSet == pdFALSE )
                {
                    // 记录等待开始时的 tick 计数和溢出次数，之后重试继续使用这个起点
                    vTaskInternalSetTimeOutState( &xTimeOut );

                    // 标记已经开始计时，重试时不重新计时
                    xEntryTimeSet = pdTRUE;
                }
                else
            }
        }
        // 本次检查结束，退出临界区，接下来准备等待发送空间
        taskEXIT_CRITICAL();

        // 挂起调度器，准备将当前任务加入发送等待列表
        vTaskSuspendAll();
        // 锁住事件列表；ISR 仍可收发，但唤醒等待任务的操作推迟到解锁时处理
        prvLockQueue( pxQueue );

        // 扣除已经等过的时间后还没超时，可以继续检查是否需要阻塞
        if( xTaskCheckForTimeOut( &xTimeOut, &xTicksToWait ) == pdFALSE )
        {
            // 退出临界区后，其他任务或中断可能已消费消息，因此再次检查队列是否仍满
            if( prvIsQueueFull( pxQueue ) != pdFALSE )
            {
                // 把当前任务加入发送等待列表，最多再等剩余的 tick 数
                vTaskPlaceOnEventList( &( pxQueue->xTasksWaitingToSend ), xTicksToWait );

                // 解锁队列，补做 ISR 在锁定期间推迟的唤醒操作
                prvUnlockQueue( pxQueue );

                // 恢复调度器时没有发生任务切换，需要主动让出处理器，让当前任务停止运行并等待
                if( xTaskResumeAll() == pdFALSE )
                {
                    // 当前任务已登记为阻塞，主动让出处理器，让其他任务运行
                    taskYIELD_WITHIN_API();
                }
            }
            else
            {
                // 队列已经有空位，不必阻塞；解锁并处理推迟的唤醒操作
                prvUnlockQueue( pxQueue );
                // 恢复调度器，回到循环再次尝试发送
                ( void ) xTaskResumeAll();
            }
        }
        else
        {
            // 等待时间已到，解锁并处理锁定期间推迟的唤醒操作
            prvUnlockQueue( pxQueue );
            // 恢复调度器，返回发送失败
            ( void ) xTaskResumeAll();

            // 返回队列满错误
            return errQUEUE_FULL;
        }
    }
}
```
```c
/*
 * 函数功能：
 * 按指定位置写入项目并移动读写指针；信号量和互斥量只更新计数及相关状态
 * 调用者必须已进入临界区，并保证队列有空位，或者允许覆盖容量为 1 的队列
 *
 * 参数：
 * pxQueue        输入输出，目标队列控制块
 * pvItemToQueue  输入，待复制项目地址
 * xPosition      输入，选择从队尾发送、从队首发送或覆盖已有项目
 *
 * 返回值：
 * pdTRUE         释放互斥量后，需要主动让出处理器
 * pdFALSE        无需因为释放互斥量后的优先级变化而让出处理器
 */
static BaseType_t prvCopyDataToQueue( Queue_t * const pxQueue,
                                      const void * pvItemToQueue,
                                      const BaseType_t xPosition )
{
    // 保存释放互斥量后是否需要切换任务
    BaseType_t xReturn = pdFALSE;
    // 保存写入前的项目数，用来计算写入后的数量
    UBaseType_t uxMessagesWaiting;

    // 读取写入前的项目数；覆盖已有项目时，只调整这个局部变量
    uxMessagesWaiting = pxQueue->uxMessagesWaiting;

    // 项目大小为 0，不复制数据，只处理计数和互斥量状态
    if( pxQueue->uxItemSize == ( UBaseType_t ) 0 )
    {
        // configUSE_MUTEXES == 1 时支持互斥量，释放时还要处理持有数量和临时提高的优先级
        #if ( configUSE_MUTEXES == 1 )
        {
            // 这是互斥量，释放时需要更新持有任务的持有数量，并按需要恢复它的优先级
            if( pxQueue->uxQueueType == queueQUEUE_IS_MUTEX )
            {
                // 更新任务持有的互斥量数量，必要时恢复原优先级，并记下是否需要切换任务
                xReturn = xTaskPriorityDisinherit( pxQueue->u.xSemaphore.xMutexHolder );
                // 清空持有任务，后面统一增加可用计数，使互斥量可被再次获取
                pxQueue->u.xSemaphore.xMutexHolder = NULL;
            }
        }
        #endif
    }
    // 要求从队尾发送，用 pcWriteTo 找到这次写入的位置
    else if( xPosition == queueSEND_TO_BACK )
    {
        // 把项目的字节复制到写入位置，不保存发送缓冲区地址
        ( void ) memcpy( ( void * ) pxQueue->pcWriteTo, pvItemToQueue, ( size_t ) pxQueue->uxItemSize );

        // 写指针向后移动一个项目，准备下一次从队尾发送
        pxQueue->pcWriteTo += pxQueue->uxItemSize;

        // 写指针到了缓冲区末尾之后，需要回到开头
        if( pxQueue->pcWriteTo >= pxQueue->u.xQueue.pcTail )
        {
            // 写指针回到数据区开头，下次从这里写入
            pxQueue->pcWriteTo = pxQueue->pcHead;
        }
    }
    else
    {
        // 先写入当前读指针所指位置，再将读指针向前退一个项目，让本次数据成为下一次读取的队首
        ( void ) memcpy( ( void * ) pxQueue->u.xQueue.pcReadFrom, pvItemToQueue, ( size_t ) pxQueue->uxItemSize );

        // 读指针退一个项目，下一次读取时向后移动，就会读到刚写入的数据
        pxQueue->u.xQueue.pcReadFrom -= pxQueue->uxItemSize;

        // 读指针退到了数据区开头之前，需要移到最后一个项目处
        if( pxQueue->u.xQueue.pcReadFrom < pxQueue->pcHead )
        {
            // 将读指针移到数据区的最后一个项目处
            pxQueue->u.xQueue.pcReadFrom = ( pxQueue->u.xQueue.pcTail - pxQueue->uxItemSize );
        }

        // 本次是覆盖操作，需要根据覆盖前是否已有项目决定数量
        if( xPosition == queueOVERWRITE )
        {
            // 覆盖前已有项目，先让局部计数减一，抵消后面统一执行的加一
            if( uxMessagesWaiting > ( UBaseType_t ) 0 )
            {
                // 这里只将局部计数减一，没有取走队列中的项目
                --uxMessagesWaiting;
            }
        }
    }

    // 项目数统一加一；覆盖已有项目时，前面先减了一次，所以最终项目数不变
    pxQueue->uxMessagesWaiting = ( UBaseType_t ) ( uxMessagesWaiting + ( UBaseType_t ) 1 );

    return xReturn;
}
```
**③优先级反转**
>**概述**：高优先级任务等待**低优先级任务持有的资源**，而中优先级任务**不断抢占低优先级任务**导致**高优先级任务持续等待**
{%list%}
FreeRTOS通过优先级继承机制即PIP临时提升互斥量持有者的优先级，使其尽快运行并释放资源，从而缓解优先级反转
{%endlist%}
>除此之外，其余常见用于**缓解优先级反转**的机制还有`PCP`和`ICPP`，即**优先级天花板**和**立即优先级天花板**

>`PCP`：为共享资源预设**资源天花板**，即**可能访问该资源的任务**中的最高优先级，因此需要事先明确**任务与资源的访问关系**

>任务获取资源时，不仅要求**目标资源空闲**，还需确保自身**有效优先级严格高于系统天花板**，才能成功获取资源

>系统天花板是**当前被占用资源的最高资源天花板**，随资源占用情况**动态变化**，并且只考虑**其他任务持有的资源**

>任务因**资源被占用**或**系统天花板限制**而阻塞时，**阻塞它的资源持有者**临时继承该任务的优先级以便**尽快释放资源**

>任务释放资源后，系统**更新系统天花板**，重新检查等待任务的**获取条件**，并根据剩余阻塞关系**调整或恢复持有者优先级**

>`ICPP`：同样为共享资源预设**资源天花板**，任务获取资源时**仅要求资源空闲**，在获取资源后**立即将有效优先级提升至资源天花板**
{%right%}
PCP和ICPP不仅能够缓解优先级反转，还能预防死锁与链式阻塞，并限制任务的最坏阻塞时间，提高实时系统的可预测性
{%endright%}
{%warning%}
优先级继承只能避免无关的中优先级任务持续抢占互斥量持有者，高优先级任务仍必须等待低优先级任务完成临界区并释放互斥量
{%endwarning%}
>`PCP`和`ICPP`均需预先明确任务与资源的访问关系，增加设计和维护成本，且可能引入不必要的**资源阻塞**或**优先级提升**

**④优先级继承**
>**概述**：任务获取互斥量**失败时**，会调用`xTaskPriorityInherit`
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
```c
/*
 * 任务控制块
 * 每个任务都有一个 TCB，用于保存栈、链表节点、优先级及可选功能的数据
 */
typedef struct tskTaskControlBlock       
{
    // configUSE_MUTEXES 为 1 时，保存优先级继承所需的基础优先级和互斥量持有数
    #if ( configUSE_MUTEXES == 1 )
        UBaseType_t uxBasePriority;      // 应用设置的基础优先级，优先级继承期间与当前优先级分离
        UBaseType_t uxMutexesHeld;       // 当前任务持有的互斥量数量，用于优先级继承恢复判断
    #endif
} tskTCB;
```
```c
/*
 * 函数功能：
 * 累加当前任务持有的互斥量数并返回其句柄
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 当前任务句柄，未创建任务时可为 NULL
 */
TaskHandle_t pvTaskIncrementMutexHeldCount( void )
{
    // 保存当前任务的控制块指针
    TCB_t * pxTCB;

    // 读取当前任务 TCB，随后仅在任务已经建立时递增持有计数
    pxTCB = pxCurrentTCB;

    // 只有已存在当前任务时才记录新增的互斥量所有权
    if( pxTCB != NULL )
    {
        ( pxTCB->uxMutexesHeld )++;
    }

    // 返回当前任务句柄，供互斥量记录持有者
    return pxTCB;
}
```
```c
/*
 * 函数功能：
 * 当互斥量持有者优先级较低时，使其继承当前等待任务的优先级
 *
 * 参数：
 * pxMutexHolder  互斥量当前持有者的任务句柄，可为 NULL
 *
 * 返回值：
 * pdTRUE   发生继承，或持有者已因其他互斥量保持更高优先级
 * pdFALSE  持有者为 NULL 或无需继承
 */
BaseType_t xTaskPriorityInherit( TaskHandle_t const pxMutexHolder )
{
    // 持有者句柄即其 TCB 指针，后续要更新优先级和链表项
    TCB_t * const pxMutexHolderTCB = pxMutexHolder;
    // 保存本次优先级继承的结果
    BaseType_t xReturn = pdFALSE;

    // 互斥量有任务持有者时
    if( pxMutexHolder != NULL )
    {

        // 只有持有者的有效优先级低于当前等待者时才需提升
        if( pxMutexHolderTCB->uxPriority < pxCurrentTCB->uxPriority )
        {
            // 事件链表项未被特殊值占用时，按新的继承优先级重建其反向排序值
            if( ( listGET_LIST_ITEM_VALUE( &( pxMutexHolderTCB->xEventListItem ) ) & taskEVENT_LIST_ITEM_VALUE_IN_USE ) == ( ( TickType_t ) 0U ) )
            {
                // 按继承后的优先级更新事件节点的排序值
                listSET_LIST_ITEM_VALUE( &( pxMutexHolderTCB->xEventListItem ), ( TickType_t ) configMAX_PRIORITIES - ( TickType_t ) pxCurrentTCB->uxPriority );
            }

            // 持有者就绪时，必须从旧优先级链表移除后再修改优先级
            if( listIS_CONTAINED_WITHIN( &( pxReadyTasksLists[ pxMutexHolderTCB->uxPriority ] ), &( pxMutexHolderTCB->xStateListItem ) ) != pdFALSE )
            {
                // 将持有者移出旧优先级的就绪链表，并检查链表是否已空
                if( uxListRemove( &( pxMutexHolderTCB->xStateListItem ) ) == ( UBaseType_t ) 0 )
                {
                    // 清除持有者原优先级在就绪记录中的标记
                    portRESET_READY_PRIORITY( pxMutexHolderTCB->uxPriority, uxTopReadyPriority );
                }

                // 将持有者的有效优先级提高到当前任务的优先级
                pxMutexHolderTCB->uxPriority = pxCurrentTCB->uxPriority;
                // 将持有者加入新优先级的就绪链表
                prvAddTaskToReadyList( pxMutexHolderTCB );
                // configNUMBER_OF_CORES 大于 1 时，多核处理继承后的任务运行状态及跨核让出
                #if ( configNUMBER_OF_CORES > 1 )
                {
                    // 持有者未运行时请求适当的核重新调度，使提升后的任务及时参与竞争
                    if( taskTASK_IS_RUNNING( pxMutexHolderTCB ) != pdTRUE )
                    {
                        // 检查优先级提升后的持有者是否需要抢占其他任务
                        prvYieldForTask( pxMutexHolderTCB );
                    }
                }
                #endif
            }
            else
            {
                // 阻塞或挂起任务不在就绪链表中，只更新 TCB 的有效优先级
                pxMutexHolderTCB->uxPriority = pxCurrentTCB->uxPriority;
            }

            // 记录本次已提高持有者的优先级
            xReturn = pdTRUE;
        }
        else
        {
            // 有效优先级已经足够高时，基础优先级仍低于等待者说明继承状态仍然存在
            if( pxMutexHolderTCB->uxBasePriority < pxCurrentTCB->uxPriority )
            {
                // 记录持有者已经处于满足本次等待需求的继承状态
                xReturn = pdTRUE;
            }
        }
    }

    // 返回持有者是否发生或保持所需的优先级继承
    return xReturn;
}
```

**⑤优先级恢复**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}

**⑥嵌套互斥量**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}