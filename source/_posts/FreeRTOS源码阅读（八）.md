---
title: FreeRTOS源码阅读（八）
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
date: 2026-09-30 14:56:52
keywords:
summary: FreeRTOS消息队列
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（八）
#### 消息队列
**①引言**
>**概述**：`FreeRTOS`消息队列是一种用于**任务间及任务与中断间**传递数据的通信机制，属于内核基础功能，将`queue.c`编入工程即可
{%list%}
消息队列通过环形缓冲区存储固定大小的数据项，采用数据拷贝方式传递消息，并结合等待链表实现队列空或满时的阻塞与唤醒
{%endlist%}
>`FreeRTOS`的**消息队列**和**信号量**都基于`Queue_t`控制块实现，共用**计数**、**阻塞**、**唤醒**和**队列锁**机制，如下所示
{%right%}
消息队列能够缓存多条消息，支持先进先出的数据传递、任务间异步通信及阻塞唤醒机制，实现任务解耦并减少CPU的无效等待
{%endright%}
{%warning%}
消息队列需要额外的缓冲区，并通过数据拷贝传递消息，内存和CPU开销较高，数据较大时可以通过传递指针减小内存开销
{%endwarning%}
```c
/*
 * 队列环形缓冲区指针
 * 记录缓冲区末尾之后的地址和上一次读取的位置，供读写指针移动时使用
 */
typedef struct QueuePointers
{
    int8_t * pcTail;         //缓冲区末尾之后的地址，用于判断读写指针是否需要回到开头
    int8_t * pcReadFrom;     //上一次读取的位置，下次读取前先向后移动一个项目
} QueuePointers_t;

/*
 * 互斥量持有状态
 * 记录当前持有任务和重复获取次数，获取和释放时使用
 */
typedef struct SemaphoreData
{
    TaskHandle_t xMutexHolder;           //当前持有互斥量的任务句柄
    UBaseType_t uxRecursiveCallCount;    //同一任务获取后还没有释放的次数
} SemaphoreData_t;
```
```c
/*
 * 队列控制块
 * 每个队列、信号量或互斥量各有一个实例，保存读写位置、等待任务、容量、计数和可选功能所需信息
 * 保留 QueueDefinition 这个结构名称，让已有的内核调试器仍能识别它
 */
typedef struct QueueDefinition
{
    int8_t * pcHead;                                         //数据区起始地址，也用于区分互斥量与其他队列对象
    int8_t * pcWriteTo;                                      //下一次从队尾发送时写入的位置
    union
    {
        QueuePointers_t xQueue;                              //普通队列的缓冲区末尾地址和读取位置
        SemaphoreData_t xSemaphore;                          //互斥量的持有任务和重复获取次数
    } u;
    List_t xTasksWaitingToSend;                              //等待发送空间的任务列表，按任务优先级排列
    List_t xTasksWaitingToReceive;                           //等待接收数据或获取计数的任务列表，按任务优先级排列
    volatile UBaseType_t uxMessagesWaiting;                  //队列中的项目数，在信号量中表示可用计数
    UBaseType_t uxLength;                                    //最多能保存的项目数
    UBaseType_t uxItemSize;                                  //一个项目占用的字节数，决定复制大小和指针移动距离
    volatile int8_t cRxLock;                                 //接收事件锁的状态，以及锁定期间记下的接收次数
    volatile int8_t cTxLock;                                 //发送事件锁的状态，以及锁定期间记下的发送次数

    // configSUPPORT_STATIC_ALLOCATION 和 configSUPPORT_DYNAMIC_ALLOCATION 同为 1 时，记录内存来源，以便删除时决定是否释放；FreeRTOS.h 中两者未定义时分别默认为 0 和 1
    #if ( ( configSUPPORT_STATIC_ALLOCATION == 1 ) && ( configSUPPORT_DYNAMIC_ALLOCATION == 1 ) )
        uint8_t ucStaticallyAllocated;                       //记录内存由内核申请还是调用者提供，删除时据此决定是否释放
    #endif
} xQUEUE;

/* 保留调试器识别的 xQUEUE，同时用 Queue_t 作为内核中的类型名 */
typedef xQUEUE Queue_t;
```
**②队列锁定**
>**概述**：`FreeRTOS`的每个队列都有`cRxLock`和`cTxLock`，分别分别记录**接收和发送事件的锁定状态**以及**锁定期间累计的事件数量**
{%list%}
prvLockQueue将cRxLock和cTxLock置为queueLOCKED_UNMODIFIED，中断接口会根据队列锁的状态做出不同的操作
{%endlist%}
>队列**未锁定时**，中断接口可**直接唤醒等待任务**，反之将相关事件**累计到锁计数中**，待**解锁后统一处理**
{%right%}
队列锁用于保护队列的任务等待列表，避免任务调整等待列表时中断直接修改链表并唤醒等待任务，同时允许中断正常收发消息
{%endright%}
{%warning%}
队列锁不会阻止中断收发消息，不能代替临界区，消息缓冲区、读写指针及消息计数等共享数据仍需通过临界区保护
{%endwarning%}
```c
/* 队列事件锁的状态和计数上限 */
#define queueUNLOCKED             ( ( int8_t ) -1 )   // 未锁定，可以直接处理等待任务
#define queueLOCKED_UNMODIFIED    ( ( int8_t ) 0 )    // 已锁定，期间还没有发生对应的收发操作
#define queueINT8_MAX             ( ( int8_t ) 127 )  // 锁计数最大为 127，增加前用断言检查，防止溢出
```
```c
/* 在临界区内锁住收发事件列表；只有尚未锁定时才把状态从 -1 改为 0，不覆盖已有计数 */
#define prvLockQueue( pxQueue )                            \
    taskENTER_CRITICAL();                                  \
    {                                                      \
        if( ( pxQueue )->cRxLock == queueUNLOCKED )        \
        {                                                  \
            ( pxQueue )->cRxLock = queueLOCKED_UNMODIFIED; \
        }                                                  \
        if( ( pxQueue )->cTxLock == queueUNLOCKED )        \
        {                                                  \
            ( pxQueue )->cTxLock = queueLOCKED_UNMODIFIED; \
        }                                                  \
    }                                                      \
    taskEXIT_CRITICAL()
```
```c
/*
 * 函数功能：
 * 解锁队列，补做 ISR 收发期间推迟的唤醒操作
 * 调用前必须已挂起调度器；这里只记下任务切换请求，恢复调度器时再处理实际切换
 *
 * 参数：
 * pxQueue  输入输出，待解锁的队列控制块
 *
 * 返回值：
 * 无返回值
 */
static void prvUnlockQueue( Queue_t * const pxQueue )
{

    // 进入临界区，保护发送锁计数和接收等待列表
    taskENTER_CRITICAL();
    {
        // 保存锁定期间记下的发送次数，逐次处理后减一
        int8_t cTxLock = pxQueue->cTxLock;

        // 逐次处理锁定期间的发送；已加入队列集时逐次通知队列集，否则逐个唤醒接收等待者，没有等待者时结束
        while( cTxLock > queueLOCKED_UNMODIFIED )
        {
            // configUSE_QUEUE_SETS == 1 时，已加入队列集的成员要通知队列集；为 0 时只唤醒本队列的等待任务
            #if ( configUSE_QUEUE_SETS == 1 )
            {
                /* 若队列属于队列集则通知队列集，否则唤醒等待接收的任务，并记录必要的任务切换请求，此处略 */
            }
            // 未启用队列集，直接处理本队列的接收等待任务
            #else
            {
                // 未启用队列集，检查是否还有接收等待任务
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToReceive ) ) == pdFALSE )
                {
                    // 唤醒一个接收等待者；返回非 pdFALSE 时，记下稍后切换任务的请求
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToReceive ) ) != pdFALSE )
                    {
                        // 先记下任务切换请求，恢复调度器时再处理实际切换
                        vTaskMissedYield();
                    }
                }
                else
                {
                    break;
                }
            }
            #endif

            // 已处理一次发送，剩余待处理次数减一
            --cTxLock;
        }

        // 发送处理结束，将发送锁设为 -1，后续发送可以直接唤醒等待任务
        pxQueue->cTxLock = queueUNLOCKED;
    }
    // 发送锁和接收等待任务已处理，退出这段临界区
    taskEXIT_CRITICAL();

    // 进入临界区，保护接收锁计数和发送等待列表
    taskENTER_CRITICAL();
    {
        // 保存锁定期间记下的接收次数，逐次处理后减一
        int8_t cRxLock = pxQueue->cRxLock;

        // 按锁定期间的接收次数逐个唤醒发送等待者，直到次数用完或已没有等待任务
        while( cRxLock > queueLOCKED_UNMODIFIED )
        {
            // 还有发送等待任务，可以用这次接收腾出的空间唤醒一个任务
            if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToSend ) ) == pdFALSE )
            {
                // 唤醒一个发送等待者；返回非 pdFALSE 时，记下稍后切换任务的请求
                if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToSend ) ) != pdFALSE )
                {
                    // 先记下任务切换请求，恢复调度器时再处理
                    vTaskMissedYield();
                }

                // 已处理一次接收，剩余待处理次数减一
                --cRxLock;
            }
            else
            {
                break;
            }
        }

        // 接收处理结束，将接收锁设为 -1
        pxQueue->cRxLock = queueUNLOCKED;
    }
    // 退出临界区，收发事件列表现在都已解锁
    taskEXIT_CRITICAL();
}
```
**③事件阻塞**
>**概述**：`FreeRTOS`通过`vTaskPlaceOnEventList`和`xTaskRemoveFromEventList`管理任务的**事件阻塞状态**，详细如下所示
{%list%}
vTaskPlaceOnEventList将任务的xEventListItem加入对应事件等待列表，并将其xStateListItem挂载到延时列表或挂起列表
{%endlist%}
>`xTaskRemoveFromEventList`将**最高优先级的等待任务**移出事件链表，并根据**调度器状态**将其加入**就绪链表或待就绪链表**
{%right%}
xEventListItem的值在任务初始化时被设置为configMAX_PRIORITIES - uxPriority，使事件等待链表按任务优先级从高到低排列
{%endright%}
{%warning%}
如果唤醒任务优先级更高，xTaskRemoveFromEventList只会将xYieldPendings置为pdTRUE，具体任务切换由调用者执行
{%endwarning%}
>因为`xTaskRemoveFromEventList`可能在**临界区内**、**中断上下文中**和**调度器挂起期间**调用，不能直接进行任务切换
```c
/*
 * 函数功能：
 * 按优先级把当前任务加入内核对象事件链表，并按等待时长转入延时或挂起链表
 *
 * 参数：
 * pxEventList   输入输出由已加锁内核对象拥有的事件等待链表
 * xTicksToWait  输入最大等待 Tick 数
 * 调用前提：调度器已暂停，且事件链表所属队列已锁定
 *
 * 返回值：
 * 无返回值
 */
void vTaskPlaceOnEventList( List_t * const pxEventList,
                            const TickType_t xTicksToWait )
{
    // 调用者必须提供有效事件链表
    configASSERT( pxEventList );

    // 按任务优先级将当前任务插入事件等待链表
    vListInsert( pxEventList, &( pxCurrentTCB->xEventListItem ) );

    // 将当前任务从就绪态转入有限延时或无限挂起等待
    prvAddCurrentTaskToDelayedList( xTicksToWait, pdTRUE );
}
```
```c
/*
 * 函数功能：
 * 从按优先级排序的事件链表唤醒最高优先级任务，并根据调度状态直接就绪或暂存为待就绪
 *
 * 参数：
 * pxEventList  输入非空且由调用者在临界区内保护的事件链表
 *
 * 返回值：
 * pdTRUE   唤醒结果要求当前核心执行上下文切换
 * pdFALSE  当前核心无需立即切换
 */
BaseType_t xTaskRemoveFromEventList( const List_t * const pxEventList )
{
    // 指向按优先级排序事件链表的最高优先级等待任务
    TCB_t * pxUnblockedTCB;
    // 表示本次唤醒是否要求当前核心切换
    BaseType_t xReturn;

    // 获取事件链表中的第一个等待任务
    pxUnblockedTCB = listGET_OWNER_OF_HEAD_ENTRY( pxEventList );
    // 确认事件链表首节点关联的任务非空
    configASSERT( pxUnblockedTCB );
    // 将被唤醒任务的事件节点移出链表
    listREMOVE_ITEM( &( pxUnblockedTCB->xEventListItem ) );

    // 调度器未被挂起时
    if( uxSchedulerSuspended == ( UBaseType_t ) 0U )
    {
        // 将任务移出所在的延时链表或挂起链表
        listREMOVE_ITEM( &( pxUnblockedTCB->xStateListItem ) );
        // 将被唤醒任务加入对应优先级的就绪链表
        prvAddTaskToReadyList( pxUnblockedTCB );

        // configUSE_TICKLESS_IDLE 不为 0 时，启用 Tickless Idle 时，事件提前唤醒任务后更新下一次唤醒时间
        #if ( configUSE_TICKLESS_IDLE != 0 )
        {
            // 更新下一任务的唤醒时刻
            prvResetNextTaskUnblockTime();
        }
        #endif
    }
    else
    {
        // 调度器暂停时不能改动状态链表，先把事件项放入待就绪链表
        listINSERT_END( &( xPendingReadyList ), &( pxUnblockedTCB->xEventListItem ) );
    }

    // configNUMBER_OF_CORES 为 1 时，单核直接比较当前任务优先级；多核由跨核抢占逻辑决定是否让出
    #if ( configNUMBER_OF_CORES == 1 )
    {
        // 单核仅在新就绪任务优先级更高时要求当前执行流让出
        if( pxUnblockedTCB->uxPriority > pxCurrentTCB->uxPriority )
        {
            // 通知调用者需要切换当前核心的任务
            xReturn = pdTRUE;

            // 记录当前核心有待处理的任务切换请求
            xYieldPendings[ 0 ] = pdTRUE;
        }
        else
        {
            // 新就绪任务优先级不更高，当前核心不需要立即切换
            xReturn = pdFALSE;
        }
    }
    #else
    {
        // 先将本次结果设为不需要切换当前核心
        xReturn = pdFALSE;

        // configUSE_PREEMPTION 为 1 时，开启抢占调度时，事件唤醒可要求合适核心立即重新选任务
        #if ( configUSE_PREEMPTION == 1 )
        {
            // 检查是否需要让其他任务为该任务让出核心
            prvYieldForTask( pxUnblockedTCB );

            // 当前核心是否被标记为需要让出
            if( xYieldPendings[ portGET_CORE_ID() ] != pdFALSE )
            {
                // 通知调用者需要切换当前核心的任务
                xReturn = pdTRUE;
            }
        }
        #endif
    }
    #endif

    // 返回调用者是否应立即触发当前核心上下文切换
    return xReturn;
}
```
**④超时管理**
>**概述**：`FreeRTOS`通过`TimeOut_t`记录等待状态，并通过`vTaskInternalSetTimeOutState`和`xTaskCheckForTimeOut`进行超时管理
{%list%}
vTaskInternalSetTimeOutState记录当前Tick和回绕数，xTaskCheckForTimeOut计算已等待时间，并更新剩余等待时间及计时基准
{%endlist%}
{%right%}
队列操作可能因提前唤醒而多次阻塞重试，超时管理用于累计已等待时间，避免重复等待导致等待期限延长
{%endright%}
{%warning%}
队列唤醒只保证任务可以重新尝试收发，并不保证一定成功，因为任务恢复运行前队列状态可能已经被其他任务或中断改变
{%endwarning%}
```c
/* 跨多次等待保存超时起点，同时记录节拍回绕次数以正确计算经过时间 */
typedef struct xTIME_OUT
{
    BaseType_t xOverflowCount;   // 保存进入等待时的 tick 回绕次数，配合节拍值区分跨回绕的超时
    TickType_t xTimeOnEntering;  // 保存进入等待时的系统节拍值，作为已耗时计算起点
} TimeOut_t;
```
```c
/*
 * 函数功能：
 * 在调用者已提供同步保证时记录内部超时基准快照
 *
 * 参数：
 * pxTimeOut  输出超时状态快照
 *
 * 返回值：
 * 无返回值
 */
void vTaskInternalSetTimeOutState( TimeOut_t * const pxTimeOut )
{
    // 在调用者提供的同步保护下，记录当前Tick回绕次数
    pxTimeOut->xOverflowCount = xNumOfOverflows;

    // 保存开始等待时的 tick 值
    pxTimeOut->xTimeOnEntering = xTickCount;
}
```
```c
/*
 * 函数功能：
 * 根据 Tick 快照、溢出次数和剩余等待时长判断当前等待是否结束，并在未超时时更新剩余时间与基准
 *
 * 参数：
 * pxTimeOut      输入输出上次检查或开始等待时的 Tick 快照
 * pxTicksToWait  输入输出剩余等待 Tick 数
 *
 * 返回值：
 * pdTRUE   等待已因超时或主动取消而结束
 * pdFALSE  尚未超时，或配置为无限期等待
 */
BaseType_t xTaskCheckForTimeOut( TimeOut_t * const pxTimeOut,
                                 TickType_t * const pxTicksToWait )
{
    // 保存本轮检查是否结束等待
    BaseType_t xReturn;

    // 两个状态对象都必须可读写
    configASSERT( pxTimeOut );
    // 确认已提供剩余等待时长的指针
    configASSERT( pxTicksToWait );

    // 在临界区内取得 Tick、回绕次数和当前任务取消标志的一致视图
    taskENTER_CRITICAL();
    {
        // 保存本次检查使用的 tick 值
        const TickType_t xConstTickCount = xTickCount;
        // 保存从上次计时基准到现在经过的 tick 数
        const TickType_t xElapsedTime = xConstTickCount - pxTimeOut->xTimeOnEntering;

        // INCLUDE_xTaskAbortDelay 为 1 时，编译延时中止接口时，超时检查还需识别主动中止标志
        #if ( INCLUDE_xTaskAbortDelay == 1 )
            // 当前任务的等待已被主动中止时
            if( pxCurrentTCB->ucDelayAborted != ( uint8_t ) pdFALSE )
            {
                // 清除已经处理的等待中止标志
                pxCurrentTCB->ucDelayAborted = ( uint8_t ) pdFALSE;
                // 本次等待已被中止，返回等待结束
                xReturn = pdTRUE;
            }
            else
        #endif

        // INCLUDE_vTaskSuspend 为 1 时，编译任务挂起接口时，无限期等待可通过挂起链表表示
        #if ( INCLUDE_vTaskSuspend == 1 )
            // 等待时间为 portMAX_DELAY，表示无限期等待时
            if( *pxTicksToWait == portMAX_DELAY )
            {
                // 无限等待不扣减等待值，也不更新超时基准
                xReturn = pdFALSE;
            }
            else
        #endif

        // 回绕次数变化且当前 Tick 已追过旧基准，说明至少经历了完整计数周期
        if( ( xNumOfOverflows != pxTimeOut->xOverflowCount ) && ( xConstTickCount >= pxTimeOut->xTimeOnEntering ) )
        {
            // 完整计数周期已经超过任何可表示等待值，直接耗尽剩余时间
            xReturn = pdTRUE;
            *pxTicksToWait = ( TickType_t ) 0;
        }
        // 已经经过的 tick 数小于剩余等待时间时
        else if( xElapsedTime < *pxTicksToWait )
        {
            // 保留尚未消耗的等待 Tick，并从当前时刻开始下一轮计时
            *pxTicksToWait -= xElapsedTime;
            vTaskInternalSetTimeOutState( pxTimeOut );
            // 剩余等待时间还未用完，返回尚未超时
            xReturn = pdFALSE;
        }
        else
        {
            // 已耗时间达到剩余等待值，归零并报告超时
            *pxTicksToWait = ( TickType_t ) 0;
            xReturn = pdTRUE;
        }
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回本轮是否应结束等待
    return xReturn;
}
```
**⑤队列创建**
>**概述**：`FreeRTOS`提供`xQueueCreate`和`xQueueCreateStatic`创建队列，这里主要关注前者，其底层实现为`xQueueGenericCreate`
{%list%}
xQueueGenericCreate为Queue_t和消息缓冲区动态分配内存，随后调用prvInitialiseNewQueue初始化Queue_t的各个成员
{%endlist%}
{%right%}
队列创建后处于空状态，消息计数为0，任务等待链表为空，队列事件锁处于未锁定状态，其管理指针位置如下所示
{%endright%}
{%warning%}
pcReadFrom初始指向最后一个槽位，因为读取数据时会先移动指针，再读取消息，使第一次读取时恰好回绕到队列起点
{%endwarning%}
```map
pcWriteTo                                     pcTail
↓                                              ↓
┌───────────┬───────────┬───────┬──────────────┐
│  Slot 0   │  Slot 1   │  ...  │   Slot N-1   │
└───────────┴───────────┴───────┴──────────────┘
↑                               ↑
pcHead                          pcReadFrom
```
```c
/*
 * 函数功能：
 * 动态创建固定项大小的队列，存储容量为 uxQueueLength 项，每项 uxItemSize 字节
 *
 * 参数：
 * uxQueueLength  输入，队列最多容纳的数据项数量
 * uxItemSize     输入，每个队列项的字节数；0 用于不保存载荷的信号量
 *
 * 返回值：
 * 对象句柄        成功创建的队列
 * NULL           对象创建失败
 */
#define xQueueCreate( uxQueueLength, uxItemSize )    xQueueGenericCreate( ( uxQueueLength ), ( uxItemSize ), ( queueQUEUE_TYPE_BASE ) )
/*
 * 函数功能：
 * 使用调用者的控制块和数据区创建队列，数据区至少容纳 uxQueueLength × uxItemSize 字节
 * 缓冲区在队列存活期间必须有效
 *
 * 参数：
 * uxQueueLength    输入，队列最多容纳的数据项数量
 * uxItemSize       输入，每个队列项的字节数；0 用于不保存载荷的信号量
 * pucQueueStorage  输入输出，调用者提供的队列载荷存储区，容量须与队列长度和项大小匹配
 * pxQueueBuffer    输入输出，静态队列控制块，使用期间须持续有效
 *
 * 返回值：
 * 对象句柄          使用有效静态存储创建的队列
 * NULL             参数检查未通过而未创建对象；无效参数也可能先触发 configASSERT
  */
#define xQueueCreateStatic( uxQueueLength, uxItemSize, pucQueueStorage, pxQueueBuffer )    xQueueGenericCreateStatic( ( uxQueueLength ), ( uxItemSize ), ( pucQueueStorage ), ( pxQueueBuffer ), ( queueQUEUE_TYPE_BASE ) )
```
```c
/*
 * 函数功能：
 * 一次申请队列控制块和保存项目的内存，再初始化队列
 *
 * 参数：
 * uxQueueLength  输入，队列最多容纳的项目数
 * uxItemSize     输入，每个项目的字节数，信号量为 0
 * ucQueueType    输入，供跟踪工具记录的队列类型
 *
 * 返回值：
 * 非 NULL        创建成功后的队列句柄
 * NULL           参数无效、长度计算溢出或内存分配失败
 */
QueueHandle_t xQueueGenericCreate( const UBaseType_t uxQueueLength,
                                    const UBaseType_t uxItemSize,
                                    const uint8_t ucQueueType )
{
    // 保存待初始化的新队列控制块地址
    Queue_t * pxNewQueue = NULL;
    // 保存容纳全部项目所需的数据区字节数
    size_t xQueueSizeInBytes;
    // 保存新申请内存中项目数据的起始地址
    uint8_t * pucQueueStorage;

    // 容量必须非零，项目总大小和加上控制块后的大小都不能溢出，才能申请内存
    if( ( uxQueueLength > ( UBaseType_t ) 0 ) &&
        ( ( SIZE_MAX / uxQueueLength ) >= uxItemSize ) &&
        ( ( SIZE_MAX - sizeof( Queue_t ) ) >= ( size_t ) ( ( size_t ) uxQueueLength * ( size_t ) uxItemSize ) ) )
    {

        // 计算保存全部项目需要的字节数；项目大小为 0 时不需要额外的数据区
        xQueueSizeInBytes = ( size_t ) ( ( size_t ) uxQueueLength * ( size_t ) uxItemSize );

        // 一次申请控制块和数据区所需的全部内存，删除时一起释放
        pxNewQueue = ( Queue_t * ) pvPortMalloc( sizeof( Queue_t ) + xQueueSizeInBytes );

        // 申请成功后，才能设置数据区地址并初始化队列
        if( pxNewQueue != NULL )
        {
            // 把控制块起始地址转成字节指针，便于按字节计算数据区地址
            pucQueueStorage = ( uint8_t * ) pxNewQueue;

            // 向后移过控制块，让数据区从它后面开始
            pucQueueStorage += sizeof( Queue_t );

            // configSUPPORT_STATIC_ALLOCATION == 1 时也支持静态创建，需要标记本队列使用动态内存
            #if ( configSUPPORT_STATIC_ALLOCATION == 1 )
            {
                // 标记为动态创建，删除时由内核释放这块内存
                pxNewQueue->ucStaticallyAllocated = pdFALSE;
            }
            #endif

            // 使用新申请的数据区，完成队列初始化
            prvInitialiseNewQueue( uxQueueLength, uxItemSize, pucQueueStorage, ucQueueType, pxNewQueue );
        }
    }
    else
    {
        // 容量无效或大小计算溢出时触发断言，返回 NULL 表示创建失败
        configASSERT( pxNewQueue );
    }

    return pxNewQueue;
}
```
```c
/*
 * 函数功能：
 * 设置新队列的容量、数据区等信息，再初始化成空队列
 *
 * 参数：
 * uxQueueLength    输入，队列容量
 * uxItemSize       输入，每个项目的字节数
 * pucQueueStorage  输入，队列数据区首地址
 * ucQueueType      输入，跟踪工具使用的队列类型
 * pxNewQueue       输入，待初始化的队列控制块
 *
 * 返回值：
 * 无返回值
 */
static void prvInitialiseNewQueue( const UBaseType_t uxQueueLength,
                                   const UBaseType_t uxItemSize,
                                   uint8_t * pucQueueStorage,
                                   const uint8_t ucQueueType,
                                   Queue_t * pxNewQueue )
{

    // 未启用跟踪功能时不使用对象类型，保留参数引用以避免未使用警告
    ( void ) ucQueueType;

    // 项目大小为 0，只维护计数，不保存实际项目数据
    if( uxItemSize == ( UBaseType_t ) 0 )
    {
        // 借用控制块自身地址作为头指针，避免与互斥量的 NULL 标记混淆
        pxNewQueue->pcHead = ( int8_t * ) pxNewQueue;
    }
    else
    {
        // 普通队列把头指针设为项目数据区起点
        pxNewQueue->pcHead = ( int8_t * ) pucQueueStorage;
    }

    // 保存队列最多能容纳的项目数
    pxNewQueue->uxLength = uxQueueLength;

    // 保存每个项目的字节数，供指针移动和复制使用
    pxNewQueue->uxItemSize = uxItemSize;

    // 按新队列方式复位，清空项目并初始化两个等待列表
    ( void ) xQueueGenericReset( pxNewQueue, pdTRUE );
}
```
```c
/*
 * 函数功能：
 * 清空队列并重设读写位置；新建时初始化等待列表，复位已有队列时若有发送等待任务则唤醒一个
 *
 * 参数：
 * xQueue     输入，待复位的队列句柄
 * xNewQueue  输入，pdTRUE 表示首次初始化，pdFALSE 表示复位已有队列
 *
 * 返回值：
 * pdPASS     队列结构有效且完成复位
 * pdFAIL     队列参数或容量计算无效
 */
BaseType_t xQueueGenericReset( QueueHandle_t xQueue,
                               BaseType_t xNewQueue )
{
    // 保存队列复位是否成功
    BaseType_t xReturn = pdPASS;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 断言待复位的队列句柄有效
    configASSERT( pxQueue );

    // 控制块非空、容量至少为 1，且容量乘项目大小不超过 SIZE_MAX，才能重新计算读写位置
    if( ( pxQueue != NULL ) &&
        ( pxQueue->uxLength >= 1U ) &&
        ( ( SIZE_MAX / pxQueue->uxLength ) >= pxQueue->uxItemSize ) )
    {
        // 进入临界区，保护复位时对项目数、读写位置和等待列表的修改
        taskENTER_CRITICAL();
        {
            // 计算缓冲区末尾之后的地址，读写指针到这里时需要回到开头
            pxQueue->u.xQueue.pcTail = pxQueue->pcHead + ( pxQueue->uxLength * pxQueue->uxItemSize );
            // 项目数清零，队列变为空队列
            pxQueue->uxMessagesWaiting = ( UBaseType_t ) 0U;
            // 写指针回到缓冲区开头，下次从这里写入
            pxQueue->pcWriteTo = pxQueue->pcHead;
            // 先把读指针放在最后一个项目处，下次向后移一个项目就回到开头
            pxQueue->u.xQueue.pcReadFrom = pxQueue->pcHead + ( ( pxQueue->uxLength - 1U ) * pxQueue->uxItemSize );
            // 接收事件锁设为 -1，后续接收可以直接唤醒等待发送的任务
            pxQueue->cRxLock = queueUNLOCKED;
            // 发送事件锁设为 -1，后续发送可以直接唤醒等待接收的任务
            pxQueue->cTxLock = queueUNLOCKED;

            // xNewQueue 为 pdFALSE 表示复位已有队列，保留原等待列表
            if( xNewQueue == pdFALSE )
            {
                // 清空后有了发送空间，检查是否有任务正在等待发送
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToSend ) ) == pdFALSE )
                {
                    // 唤醒优先级最高的发送等待者；返回非 pdFALSE 时，需要安排任务切换
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToSend ) ) != pdFALSE )
                    {
                        // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                        queueYIELD_IF_USING_PREEMPTION();
                    }
                }
            }
            else
            {
                // 初始化发送等待列表，之后在这里记录等待发送空间的任务
                vListInitialise( &( pxQueue->xTasksWaitingToSend ) );

                // 初始化接收等待列表，之后在这里记录等待接收数据的任务
                vListInitialise( &( pxQueue->xTasksWaitingToReceive ) );
            }
        }
        // 队列复位完成，退出临界区
        taskEXIT_CRITICAL();
    }
    else
    {
        xReturn = pdFAIL;
    }

    // 断言复位没有因无效控制块、容量或乘法溢出而失败
    configASSERT( xReturn != pdFAIL );

    return xReturn;
}
```
**⑥队列发送**
>**概述**：`FreeRTOS`提供`xQueueSend`和`xQueueSendToBack`等队列发送接口，底层实现均为`xQueueGenericSend`，只是**插入方式不同**
{%list%}
xQueueGenericSend负责检查队列状态、写入消息并唤醒等待接收的任务，队列已满时则根据等待时间决定阻塞重试或返回失败
{%endlist%}
>`prvCopyDataToQueue`根据发送方式完成**数据拷贝和环形指针更新**，普通发送使消息计数加`1`，覆盖已有消息时**计数保持不变**
{%right%}
使用vTaskSuspendAll暂停任务调度，配合prvLockQueue延迟中断唤醒，避免长时间屏蔽中断，同时保证任务等待链表安全
{%endright%}
{%warning%}
首次检查队列已满退出临界区时，其他任务或中断可能消费队列，因此在进入阻塞状态前需要再次检查队列，避免不必要的阻塞
{%endwarning%}
```c
/*
 * 函数功能：
 * 使用队首插入模式
 * 按前插、后插或覆盖模式复制一个数据项，队列满时可等待；覆盖模式仅用于长度为 1 的队列
 *
 * 参数：
 * xQueue         输入，要操作或查询的有效队列对象句柄
 * pvItemToQueue  输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * xTicksToWait   输入，最长等待 tick 数；0 表示立即尝试，INCLUDE_vTaskSuspend 为 1 时 portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSendToFront( xQueue, pvItemToQueue, xTicksToWait ) \
    xQueueGenericSend( ( xQueue ), ( pvItemToQueue ), ( xTicksToWait ), queueSEND_TO_FRONT )

/*
 * 函数功能：
 * 使用队尾插入模式
 * 按前插、后插或覆盖模式复制一个数据项，队列满时可等待；覆盖模式仅用于长度为 1 的队列
 *
 * 参数：
 * xQueue         输入，要操作或查询的有效队列对象句柄
 * pvItemToQueue  输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * xTicksToWait   输入，最长等待 tick 数；0 表示立即尝试，INCLUDE_vTaskSuspend 为 1 时 portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSendToBack( xQueue, pvItemToQueue, xTicksToWait ) \
    xQueueGenericSend( ( xQueue ), ( pvItemToQueue ), ( xTicksToWait ), queueSEND_TO_BACK )

/*
 * 函数功能：
 * 使用队尾插入模式
 * 按前插、后插或覆盖模式复制一个数据项，队列满时可等待；覆盖模式仅用于长度为 1 的队列
 *
 * 参数：
 * xQueue         输入，要操作或查询的有效队列对象句柄
 * pvItemToQueue  输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * xTicksToWait   输入，最长等待 tick 数；0 表示立即尝试，INCLUDE_vTaskSuspend 为 1 时 portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSend( xQueue, pvItemToQueue, xTicksToWait ) \
    xQueueGenericSend( ( xQueue ), ( pvItemToQueue ), ( xTicksToWait ), queueSEND_TO_BACK )

/*
 * 函数功能：
 * 向长度为 1 的队列复制一个数据项，已有数据时直接覆盖；本接口不等待空位
 *
 * 参数：
 * xQueue         输入，要操作或查询的有效队列对象句柄
 * pvItemToQueue  输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 *
 * 返回值：
 * pdPASS         单项队列写入成功，原有数据项已按需覆盖
 */
#define xQueueOverwrite( xQueue, pvItemToQueue ) \
    xQueueGenericSend( ( xQueue ), ( pvItemToQueue ), 0, queueOVERWRITE )
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
**⑦队列接收**
>**概述**：`FreeRTOS`提供`xQueueReceive`和`xQueuePeek`用于队列读取，前者**读取并移除队首消息**，后者**仅查看队首消息而不移除**
{%list%}
xQueueReceive负责检查队列状态、读取队首消息并按需唤醒等待发送的任务，队列为空时根据等待时间决定阻塞重试或返回失败
{%endlist%}
>`xQueuePeek`同样检查队列状态并读取**队首消息**，但读取后会**恢复读指针并保持消息计数不变**，不会移除消息
{%right%}
xQueueReceive取走消息后可能唤醒等待发送的任务，而xQueuePeek保留消息，因此可能唤醒其他等待接收的任务
{%endright%}
{%warning%}
xQueuePeek只查看队首消息，不会锁定该消息，其他任务可能在随后将其取走，因此不能保证下次接收的仍是同一条消息
{%endwarning%}
```c
/*
 * 函数功能：
 * 任务从队列取走一个项目，队列为空时按指定时间等待数据
 *
 * 参数：
 * xQueue          输入，源队列句柄
 * pvBuffer        输出，接收项目副本的缓冲区
 * xTicksToWait    输入，队列空时允许阻塞的最大 tick 数
 *
 * 返回值：
 * pdPASS          接收成功
 * errQUEUE_EMPTY  等待期限内没有数据
 */
BaseType_t xQueueReceive( QueueHandle_t xQueue,
                          void * const pvBuffer,
                          TickType_t xTicksToWait )
{
    // 记录是否已经开始计时，避免每次重试都重新计算完整的等待时间
    BaseType_t xEntryTimeSet = pdFALSE;
    // 保存等待开始时的 tick 计数和溢出次数，用来计算还能等多久
    TimeOut_t xTimeOut;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 断言源队列句柄有效
    configASSERT( ( pxQueue ) );

    // 项目大小非零时必须提供接收缓冲区，只维护计数的对象可以不提供
    configASSERT( !( ( ( pvBuffer ) == NULL ) && ( ( pxQueue )->uxItemSize != ( UBaseType_t ) 0U ) ) );

    // 没有数据时等待后重试，直到接收成功、不允许等待或等待时间已到
    for( ; ; )
    {
        // 进入临界区，一起保护项目数、读写位置和等待列表
        taskENTER_CRITICAL();
        {
            // 保存这次读取的项目数，用来判断是否有数据并计算接收后的数量
            const UBaseType_t uxMessagesWaiting = pxQueue->uxMessagesWaiting;

            // 这次读到的项目数大于 0，可以立即取走一个项目
            if( uxMessagesWaiting > ( UBaseType_t ) 0 )
            {
                // 移动到下一个读取位置，将队首项目复制到调用者的缓冲区
                prvCopyDataFromQueue( pxQueue, pvBuffer );

                // 取走一个队首项目，项目数减一
                pxQueue->uxMessagesWaiting = ( UBaseType_t ) ( uxMessagesWaiting - ( UBaseType_t ) 1 );

                // 取走项目后腾出了一个位置，检查是否有发送等待任务
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToSend ) ) == pdFALSE )
                {
                    // 唤醒优先级最高的发送等待者；返回非 pdFALSE 时，需要安排任务切换
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToSend ) ) != pdFALSE )
                    {
                        // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                        queueYIELD_IF_USING_PREEMPTION();
                    }
                }

                // 接收完成，发送等待任务也已处理，退出临界区
                taskEXIT_CRITICAL();

                // 本次接收成功
                return pdPASS;
            }
            else
            {
                // 队列为空，而且剩余等待时间为 0，立即返回接收失败
                if( xTicksToWait == ( TickType_t ) 0 )
                {
                    // 没有数据且不能继续等待，退出临界区后返回队列为空
                    taskEXIT_CRITICAL();

                    // 返回队列空错误
                    return errQUEUE_EMPTY;
                }
                // 第一次发现需要等待数据，还没有记录等待开始的时间
                else if( xEntryTimeSet == pdFALSE )
                {
                    // 记录本次接收开始等待时的 tick 计数和溢出次数
                    vTaskInternalSetTimeOutState( &xTimeOut );
                    // 只记录一次开始时间，避免每次重试都延长等待时间
                    xEntryTimeSet = pdTRUE;
                }
            }
        }
        // 本次检查结束，退出临界区，接下来准备等待接收数据
        taskEXIT_CRITICAL();

        // 挂起调度器，准备将当前任务加入接收等待列表
        vTaskSuspendAll();
        // 锁住事件列表；ISR 仍可收发，但唤醒等待任务的操作推迟到解锁时处理
        prvLockQueue( pxQueue );

        // 扣除已经等过的时间后还没超时，继续检查是否需要阻塞
        if( xTaskCheckForTimeOut( &xTimeOut, &xTicksToWait ) == pdFALSE )
        {
            // 锁住事件列表后队列仍空，当前任务需要等待数据
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
                // 把当前任务加入接收等待列表，最多再等剩余的 tick 数
                vTaskPlaceOnEventList( &( pxQueue->xTasksWaitingToReceive ), xTicksToWait );
                // 等待任务已加入列表，解锁并处理 ISR 推迟的唤醒操作
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
                // 队列已有数据，不必阻塞；解锁并处理推迟的唤醒操作
                prvUnlockQueue( pxQueue );
                // 恢复调度器后重试接收已有数据
                ( void ) xTaskResumeAll();
            }
        }
        else
        {
            // 等待时间已到，先解锁并处理推迟的唤醒操作，再检查队列是否有数据
            prvUnlockQueue( pxQueue );
            // 恢复调度器，再决定返回队列为空还是再次尝试接收
            ( void ) xTaskResumeAll();

            // 此时队列仍空，才返回 errQUEUE_EMPTY；如果已有数据，则再次尝试接收
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
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
 * 任务复制队首项目，但把它留在队列中；队列为空时按指定时间等待数据
 *
 * 参数：
 * xQueue          输入，源队列句柄
 * pvBuffer        输出，接收队首项目副本的缓冲区
 * xTicksToWait    输入，队列空时允许阻塞的最大 tick 数
 *
 * 返回值：
 * pdPASS          读取成功且项目仍留在队列
 * errQUEUE_EMPTY  等待期限内没有数据
 */
BaseType_t xQueuePeek( QueueHandle_t xQueue,
                       void * const pvBuffer,
                       TickType_t xTicksToWait )
{
    // 记录是否已经开始计时，避免每次重试都重新计算完整的等待时间
    BaseType_t xEntryTimeSet = pdFALSE;
    // 保存等待开始时的 tick 计数和溢出次数，用来计算还能等多久
    TimeOut_t xTimeOut;
    // 保存复制前的读位置，复制后恢复，让队首项目继续留在队列中
    int8_t * pcOriginalReadPosition;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 句柄必须有效；项目大小非零时，必须提供输出缓冲区
    configASSERT( ( pxQueue != NULL ) && !( ( ( pvBuffer ) == NULL ) && ( ( pxQueue )->uxItemSize != ( UBaseType_t ) 0U ) ) );

    // 没有数据时等待后重试，直到读取成功、不允许等待或等待时间已到
    for( ; ; )
    {
        // 进入临界区，一起保护项目数、读写位置和等待列表
        taskENTER_CRITICAL();
        {
            // 保存这次读取的项目数，用来判断队列是否有数据
            const UBaseType_t uxMessagesWaiting = pxQueue->uxMessagesWaiting;

            // 队列已有项目，可以复制队首，但不将它取走
            if( uxMessagesWaiting > ( UBaseType_t ) 0 )
            {
                // 记下复制前的读位置，复制后需要恢复
                pcOriginalReadPosition = pxQueue->u.xQueue.pcReadFrom;

                // 临时移动到下一个读取位置，将队首复制到输出缓冲区，不改变项目数
                prvCopyDataFromQueue( pxQueue, pvBuffer );

                // 恢复读位置，让之后的接收仍能读到同一个队首项目
                pxQueue->u.xQueue.pcReadFrom = pcOriginalReadPosition;

                // 队首项目还在，检查是否有其他任务正在等待接收
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToReceive ) ) == pdFALSE )
                {
                    // 唤醒一个接收等待者；返回非 pdFALSE 时，需要安排任务切换
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToReceive ) ) != pdFALSE )
                    {
                        // 启用抢占时请求让出处理器，让调度器安排接下来运行的任务
                        queueYIELD_IF_USING_PREEMPTION();
                    }
                }

                // 复制完成，读位置也已恢复，退出临界区
                taskEXIT_CRITICAL();

                // 本次读取成功，项目仍留在队列中
                return pdPASS;
            }
            else
            {
                // 队列为空，而且剩余等待时间为 0，立即返回读取失败
                if( xTicksToWait == ( TickType_t ) 0 )
                {
                    // 没有队首项目且不能继续等待，退出临界区后返回队列为空
                    taskEXIT_CRITICAL();

                    // 返回队列空错误
                    return errQUEUE_EMPTY;
                }
                // 第一次发现需要等待队首数据，还没有记录等待开始的时间
                else if( xEntryTimeSet == pdFALSE )
                {
                    // 记录本次读取开始等待时的 tick 计数和溢出次数
                    vTaskInternalSetTimeOutState( &xTimeOut );
                    // 标记已经开始计时，重试时不延长等待时间
                    xEntryTimeSet = pdTRUE;
                }
            }
        }
        // 本次检查结束，退出临界区，接下来准备等待队首数据
        taskEXIT_CRITICAL();

        // 挂起调度器，准备将当前任务加入接收等待列表
        vTaskSuspendAll();
        // 锁住事件列表，ISR 推迟的唤醒操作留到解锁时处理
        prvLockQueue( pxQueue );

        // 扣除已经等过的时间后还没超时，可以继续准备等待数据
        if( xTaskCheckForTimeOut( &xTimeOut, &xTicksToWait ) == pdFALSE )
        {
            // 锁住事件列表后仍无数据，当前任务需要阻塞等待
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
                // 把当前任务加入接收等待列表，最多再等剩余的 tick 数
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
                // 队列已有数据，不必阻塞；解锁并处理推迟的唤醒操作
                prvUnlockQueue( pxQueue );
                // 恢复调度器，再次尝试读取队首项目
                ( void ) xTaskResumeAll();
            }
        }
        else
        {
            // 等待时间已到，先解锁并处理推迟的唤醒操作，再检查数据是否已经到达
            prvUnlockQueue( pxQueue );
            // 恢复调度器，根据队列是否仍空决定返回失败还是再次尝试读取
            ( void ) xTaskResumeAll();

            // 此时队列仍空，才返回失败；已有数据时则再次尝试读取
            if( prvIsQueueEmpty( pxQueue ) != pdFALSE )
            {
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
 * 先把读指针移到下一个项目，再将该项目复制到输出缓冲区
 * 调用者必须已保护并发访问，并保证队列非空；本函数只移动读指针、复制数据，不改变项目数
 *
 * 参数：
 * pxQueue   输入输出，源队列控制块
 * pvBuffer  输出，接收项目副本的缓冲区
 *
 * 返回值：
 * 无返回值
 */
static void prvCopyDataFromQueue( Queue_t * const pxQueue,
                                  void * const pvBuffer )
{
    // 项目大小非零时，才需要移动读指针并复制数据
    if( pxQueue->uxItemSize != ( UBaseType_t ) 0 )
    {
        // 读指针向后移动一个项目，指向这次要复制的数据
        pxQueue->u.xQueue.pcReadFrom += pxQueue->uxItemSize;

        // 读指针到了缓冲区末尾之后，需要回到开头
        if( pxQueue->u.xQueue.pcReadFrom >= pxQueue->u.xQueue.pcTail )
        {
            // 将读指针移回数据区开头
            pxQueue->u.xQueue.pcReadFrom = pxQueue->pcHead;
        }

        // 将读指针所指项目的字节复制到输出缓冲区；是否减少项目数由调用者决定
        ( void ) memcpy( ( void * ) pvBuffer, ( void * ) pxQueue->u.xQueue.pcReadFrom, ( size_t ) pxQueue->uxItemSize );
    }
}
```
**⑧中断接口**
>**概述**：`FreeRTOS`提供`xQueueSendFromISR`和`xQueueReceiveFromISR`等接口，用于在**中断服务程序**中实现队列发送和接收
{%list%}
普通API可以在内部请求任务切换，而中断API通过pxHigherPriorityTaskWoken记录切换需求，由中断调用者判断是否请求切换
{%endlist%}
{%right%}
队列未锁定时，中断收发成功后可直接唤醒等待任务，锁定时仍可正常收发消息，但只累计对应事件，待解锁后统一处理任务唤醒
{%endright%}
{%warning%}
普通API在队列空或满时可以阻塞等待，断API不支持阻塞，必须立即尝试收发，无法完成时直接返回失败
{%endwarning%}
```c
/*
 * 函数功能：
 * 使用队首插入模式
 * 从中断复制一个数据项到队列，不能等待；支持前插、后插与单项覆盖
 *
 * 参数：
 * xQueue                     输入，队列对象句柄；内部共用接口也可能接收信号量或互斥锁句柄
 * pvItemToQueue              输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * pxHigherPriorityTaskWoken  输入输出，调用前通常初始化为 pdFALSE；唤醒更高优先级任务时置 pdTRUE，中断退出前据此请求切换
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSendToFrontFromISR( xQueue, pvItemToQueue, pxHigherPriorityTaskWoken ) \
    xQueueGenericSendFromISR( ( xQueue ), ( pvItemToQueue ), ( pxHigherPriorityTaskWoken ), queueSEND_TO_FRONT )

/*
 * 函数功能：
 * 使用队尾插入模式
 * 从中断复制一个数据项到队列，不能等待；支持前插、后插与单项覆盖
 *
 * 参数：
 * xQueue                     输入，队列对象句柄；内部共用接口也可能接收信号量或互斥锁句柄
 * pvItemToQueue              输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * pxHigherPriorityTaskWoken  输入输出，调用前通常初始化为 pdFALSE；唤醒更高优先级任务时置 pdTRUE，中断退出前据此请求切换
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSendToBackFromISR( xQueue, pvItemToQueue, pxHigherPriorityTaskWoken ) \
    xQueueGenericSendFromISR( ( xQueue ), ( pvItemToQueue ), ( pxHigherPriorityTaskWoken ), queueSEND_TO_BACK )

/*
 * 函数功能：
 * 从中断向长度为 1 的队列复制一个数据项，已有数据时直接覆盖；不阻塞
 *
 * 参数：
 * xQueue                     输入，队列对象句柄；内部共用接口也可能接收信号量或互斥锁句柄
 * pvItemToQueue              输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * pxHigherPriorityTaskWoken  输入输出，调用前通常初始化为 pdFALSE；唤醒更高优先级任务时置 pdTRUE，中断退出前据此请求切换
 *
 * 返回值：
 * pdPASS  单项队列写入成功，原有数据项已按需覆盖
 */
#define xQueueOverwriteFromISR( xQueue, pvItemToQueue, pxHigherPriorityTaskWoken ) \
    xQueueGenericSendFromISR( ( xQueue ), ( pvItemToQueue ), ( pxHigherPriorityTaskWoken ), queueOVERWRITE )

/*
 * 函数功能：
 * 使用队尾插入模式
 * 从中断复制一个数据项到队列，不能等待；支持前插、后插与单项覆盖
 *
 * 参数：
 * xQueue                     输入，队列对象句柄；内部共用接口也可能接收信号量或互斥锁句柄
 * pvItemToQueue              输入，要复制的数据项首地址；队列复制内容，若内容是指针则只复制指针值
 * pxHigherPriorityTaskWoken  输入输出，调用前通常初始化为 pdFALSE；唤醒更高优先级任务时置 pdTRUE，中断退出前据此请求切换
 *
 * 返回值：
 * pdPASS         一个数据项已成功入队
 * errQUEUE_FULL  没有取得写入位置，数据未入队
 */
#define xQueueSendFromISR( xQueue, pvItemToQueue, pxHigherPriorityTaskWoken ) \
    xQueueGenericSendFromISR( ( xQueue ), ( pvItemToQueue ), ( pxHigherPriorityTaskWoken ), queueSEND_TO_BACK )
```
```c
/*
 * 函数功能：
 * 在中断中立即尝试发送项目，不阻塞等待，并记录是否需要在中断退出时切换任务
 *
 * 参数：
 * xQueue                     输入，目标队列句柄
 * pvItemToQueue              输入，待复制项目地址
 * pxHigherPriorityTaskWoken  输入输出，可选；需要在 ISR 退出时切换任务，就置为 pdTRUE，不会清除原有的 pdTRUE
 * xCopyPosition              输入，选择从队首发送、从队尾发送或覆盖已有项目
 *
 * 返回值：
 * pdPASS                     写入成功
 * errQUEUE_FULL              队列没有可用空间
 */
BaseType_t xQueueGenericSendFromISR( QueueHandle_t xQueue,
                                     const void * const pvItemToQueue,
                                     BaseType_t * const pxHigherPriorityTaskWoken,
                                     const BaseType_t xCopyPosition )
{
    // 保存本次中断发送是否成功
    BaseType_t xReturn;
    // 保存进入 ISR 临界区前的状态，退出时恢复
    UBaseType_t uxSavedInterruptStatus;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 句柄必须有效；项目大小非零时，待复制数据的地址不能为 NULL
    configASSERT( ( pxQueue != NULL ) && !( ( pvItemToQueue == NULL ) && ( pxQueue->uxItemSize != ( UBaseType_t ) 0U ) ) );
    // 覆盖操作只适用于容量为 1 的队列
    configASSERT( ( pxQueue != NULL ) && !( ( xCopyPosition == queueOVERWRITE ) && ( pxQueue->uxLength != 1 ) ) );

    // 验证当前中断优先级允许调用 FreeRTOS 的 FromISR 系统调用
    portASSERT_IF_INTERRUPT_PRIORITY_INVALID();

    // 进入 ISR 临界区，保存原来的中断屏蔽状态，保护队列共享数据
    uxSavedInterruptStatus = ( UBaseType_t ) taskENTER_CRITICAL_FROM_ISR();
    {
        // 队列有空位或请求覆盖，ISR 可以立即写入项目
        if( ( pxQueue->uxMessagesWaiting < pxQueue->uxLength ) || ( xCopyPosition == queueOVERWRITE ) )
        {
            // 保存发送事件锁的当前状态，判断现在唤醒任务还是留到解锁时处理
            const int8_t cTxLock = pxQueue->cTxLock;

            // 保存写入前的项目数，用来判断覆盖是否需要通知队列集
            const UBaseType_t uxPreviousMessagesWaiting = pxQueue->uxMessagesWaiting;

            // 立即复制项目并更新计数；这里不使用释放互斥量时返回的任务切换标志
            ( void ) prvCopyDataToQueue( pxQueue, pvItemToQueue, xCopyPosition );

            // 发送事件锁为 queueUNLOCKED，可以立即唤醒等待任务或通知队列集
            if( cTxLock == queueUNLOCKED )
            {
                // configUSE_QUEUE_SETS == 1 时，已加入队列集的成员要通知队列集；为 0 时只唤醒本队列的等待任务
                #if ( configUSE_QUEUE_SETS == 1 )
                {
                    /* 若队列属于队列集则通知新增可读消息（覆盖已有消息除外），否则尝试唤醒等待接收的任务，并在需要切换任务时设置pxHigherPriorityTaskWoken为pdTRUE，此处略 */
                }
                // 未启用队列集，直接处理本队列的接收等待任务
                #else
                {
                    // 未启用队列集，检查本队列是否有接收等待任务
                    if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToReceive ) ) == pdFALSE )
                    {
                        // 唤醒一个接收等待者；返回非 pdFALSE 时，需要记下任务切换请求
                        if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToReceive ) ) != pdFALSE )
                        {
                            // 调用者提供了标志地址，才记下这次任务切换请求
                            if( pxHigherPriorityTaskWoken != NULL )
                            {
                                *pxHigherPriorityTaskWoken = pdTRUE;
                            }
                        }
                    }

                    // 未启用队列集时不需要写入前的项目数，保留变量引用以避免未使用警告
                    ( void ) uxPreviousMessagesWaiting;
                }
                #endif
            }
            else
            {
                // 事件列表已锁住，记下这次发送，解锁时再处理等待任务
                prvIncrementQueueTxLock( pxQueue, cTxLock );
            }

            xReturn = pdPASS;
        }
        else
        {
            xReturn = errQUEUE_FULL;
        }
    }
    // 退出 ISR 临界区，恢复进入前的中断屏蔽状态
    taskEXIT_CRITICAL_FROM_ISR( uxSavedInterruptStatus );

    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 在中断中立即尝试取走一个队列项目，不阻塞等待
 *
 * 参数：
 * xQueue                     输入，源队列句柄
 * pvBuffer                   输出，接收项目副本的缓冲区
 * pxHigherPriorityTaskWoken  输入输出，可选；腾出空间后需要切换任务，就置为 pdTRUE，不会清除原有的 pdTRUE
 *
 * 返回值：
 * pdPASS                     接收成功
 * errQUEUE_EMPTY             队列为空
 */
BaseType_t xQueueReceiveFromISR( QueueHandle_t xQueue,
                                 void * const pvBuffer,
                                 BaseType_t * const pxHigherPriorityTaskWoken )
{
    // 保存本次中断接收是否成功
    BaseType_t xReturn;
    // 保存进入 ISR 临界区前的状态，退出时恢复
    UBaseType_t uxSavedInterruptStatus;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 断言源队列句柄有效
    configASSERT( pxQueue );
    // 项目大小非零时必须提供接收缓冲区，只维护计数的对象可以不提供
    configASSERT( !( ( pvBuffer == NULL ) && ( pxQueue->uxItemSize != ( UBaseType_t ) 0U ) ) );

    // 验证当前中断优先级允许调用 FreeRTOS 的 FromISR 系统调用
    portASSERT_IF_INTERRUPT_PRIORITY_INVALID();

    // 进入 ISR 临界区，保存原来的中断屏蔽状态，保护队列共享数据
    uxSavedInterruptStatus = ( UBaseType_t ) taskENTER_CRITICAL_FROM_ISR();
    {
        // 保存这次读取的项目数，用来判断是否有数据并计算接收后的数量
        const UBaseType_t uxMessagesWaiting = pxQueue->uxMessagesWaiting;

        // 队列中有项目，ISR 可以立即复制并移除队首
        if( uxMessagesWaiting > ( UBaseType_t ) 0 )
        {
            // 保存接收事件锁的当前状态，判断现在唤醒任务还是留到解锁时处理
            const int8_t cRxLock = pxQueue->cRxLock;

            // 移动到下一个读取位置，将队首项目复制到 ISR 提供的缓冲区
            prvCopyDataFromQueue( pxQueue, pvBuffer );
            // 队首项目已被取走，项目数减一
            pxQueue->uxMessagesWaiting = ( UBaseType_t ) ( uxMessagesWaiting - ( UBaseType_t ) 1 );

            // 接收事件锁为 queueUNLOCKED，可以立即唤醒等待发送的任务
            if( cRxLock == queueUNLOCKED )
            {
                // 接收后腾出了一个位置，检查是否有发送等待任务
                if( listLIST_IS_EMPTY( &( pxQueue->xTasksWaitingToSend ) ) == pdFALSE )
                {
                    // 唤醒一个发送等待者；返回非 pdFALSE 时，需要记下 ISR 退出时的任务切换请求
                    if( xTaskRemoveFromEventList( &( pxQueue->xTasksWaitingToSend ) ) != pdFALSE )
                    {

                        // 调用者提供了标志地址，才记下这次任务切换请求
                        if( pxHigherPriorityTaskWoken != NULL )
                        {
                            *pxHigherPriorityTaskWoken = pdTRUE;
                        }
                    }
                }
            }
            else
            {
                // 事件列表已锁住，记下这次接收，解锁时再唤醒等待发送的任务
                prvIncrementQueueRxLock( pxQueue, cRxLock );
            }

            xReturn = pdPASS;
        }
        else
        {
            xReturn = pdFAIL;
        }
    }
    // 退出 ISR 临界区，恢复进入前的中断屏蔽状态
    taskEXIT_CRITICAL_FROM_ISR( uxSavedInterruptStatus );

    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 在中断中立即尝试复制队首项目，但把它留在队列中，不阻塞等待
 *
 * 参数：
 * xQueue          输入，源队列句柄
 * pvBuffer        输出，接收队首项目副本的缓冲区
 *
 * 返回值：
 * pdPASS          读取成功
 * errQUEUE_EMPTY  队列为空
 */
BaseType_t xQueuePeekFromISR( QueueHandle_t xQueue,
                              void * const pvBuffer )
{
    // 保存本次中断读取是否成功
    BaseType_t xReturn;
    // 保存进入 ISR 临界区前的状态，退出时恢复
    UBaseType_t uxSavedInterruptStatus;
    // 保存复制前的读位置，复制后恢复，让队首项目继续留在队列中
    int8_t * pcOriginalReadPosition;
    // 通过队列句柄访问内部控制块
    Queue_t * const pxQueue = xQueue;

    // 队列句柄必须有效；项目大小非零时，输出缓冲区不能为 NULL
    configASSERT( ( pxQueue != NULL ) && !( ( pvBuffer == NULL ) && ( pxQueue->uxItemSize != ( UBaseType_t ) 0U ) ) );
    // 项目大小必须非零，这个中断读取接口不用于只维护计数的信号量
    configASSERT( ( pxQueue != NULL ) && ( pxQueue->uxItemSize != 0 ) );

    // 验证当前中断优先级允许调用 FreeRTOS 的 FromISR 系统调用
    portASSERT_IF_INTERRUPT_PRIORITY_INVALID();

    // 进入 ISR 临界区，保存原来的中断屏蔽状态，保护本次数据复制和读位置恢复
    uxSavedInterruptStatus = ( UBaseType_t ) taskENTER_CRITICAL_FROM_ISR();
    {
        // 队列非空，可以临时移动读指针来复制队首项目
        if( pxQueue->uxMessagesWaiting > ( UBaseType_t ) 0 )
        {
            // 记下原来的读位置，复制后恢复，避免把队首取走
            pcOriginalReadPosition = pxQueue->u.xQueue.pcReadFrom;
            // 临时移动到下一个读取位置，将队首项目复制到输出缓冲区
            prvCopyDataFromQueue( pxQueue, pvBuffer );
            // 恢复原读位置，项目数一直没有改变
            pxQueue->u.xQueue.pcReadFrom = pcOriginalReadPosition;

            xReturn = pdPASS;
        }
        else
        {
            xReturn = pdFAIL;
        }
    }
    // 退出 ISR 临界区，恢复进入前的中断屏蔽状态
    taskEXIT_CRITICAL_FROM_ISR( uxSavedInterruptStatus );

    return xReturn;
}
```


