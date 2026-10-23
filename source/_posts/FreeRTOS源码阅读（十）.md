---
title: FreeRTOS源码阅读（十）
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
date: 2026-09-30 16:22:40
keywords:
summary: FreeRTOS事件组
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（十）
#### 事件组
**①引言**
>**概述**：`FreeRTOS`提供的一种**多事件同步机制**，使任务能够等待**任意一个或全部指定事件**，由`configUSE_EVENT_GROUPS`宏控制
{%list%}
每个事件组由EventGroup_t表示，主要成员为uxEventBits和xTasksWaitingForBits，用于记录当前事件位状态和管理阻塞任务
{%endlist%}
{%right%}
事件组支持多个任务同时等待任意或全部事件位，实现灵活的多事件同步，且无需为每个事件单独创建同步对象
{%endright%}
{%warning%}
事件组只能记录事件状态，无法传递数据或累计事件发生次数，且置位时需要遍历等待任务链表，可能产生较大的执行开销
{%endwarning%}
```c
/*
 * 事件组内部对象
 * 事件位保存当前事件状态，无序等待列表串联所有阻塞任务的事件列表项
 */
typedef struct EventGroupDef_t
{
    EventBits_t uxEventBits;            // 保存当前应用事件位集合
    List_t xTasksWaitingForBits;        // 串联等待本事件组的任务事件列表项

    /* 其余成员略 */
} EventGroup_t;
```
```c
/*
 * 函数功能：
 * 在调用者提供的静态缓冲区上构造并初始化事件组
 *
 * 参数：
 * pxEventGroupBuffer  输出存储，由调用者提供并在本函数中初始化的静态缓冲区
 *
 * 返回值：
 * 非 NULL  已初始化的事件组句柄
 * NULL     缓冲区指针为空且断言未终止执行
 */
EventGroupHandle_t xEventGroupCreateStatic( StaticEventGroup_t * pxEventGroupBuffer )
{
    // 指向待初始化的内部事件组对象
    EventGroup_t * pxEventBits;

    // 静态创建必须由调用者提供有效缓冲区
    configASSERT( pxEventGroupBuffer );

    // configASSERT_DEFINED 为 1 时编译尺寸校验，FreeRTOS.h 根据 configASSERT 是否已定义设置该标志
    #if ( configASSERT_DEFINED == 1 )
    {
        // 保存公开占位类型的字节数，volatile 要求保留对该局部对象的读写
        volatile size_t xSize = sizeof( StaticEventGroup_t );
        // 检查公开占位类型与内部结构的尺寸完全一致
        configASSERT( xSize == sizeof( EventGroup_t ) );
    }
    #endif

    // 该转换依赖公开占位类型与内部对象的尺寸、对齐契约，不分配新内存
    pxEventBits = ( EventGroup_t * ) pxEventGroupBuffer;

    // 只有转换后句柄有效才初始化内部状态
    if( pxEventBits != NULL )
    {
        // 新建事件组初始时不含任何已置位事件
        pxEventBits->uxEventBits = 0;

        // 初始化等待列表头，此时没有任务挂在该事件组上
        vListInitialise( &( pxEventBits->xTasksWaitingForBits ) );

        // configSUPPORT_DYNAMIC_ALLOCATION 为 1 时，静态创建也需写入分配来源以区分两类对象
        #if ( configSUPPORT_DYNAMIC_ALLOCATION == 1 )
        {
            // 标记该对象不能由 vEventGroupDelete() 交给堆分配器释放
            pxEventBits->ucStaticallyAllocated = pdTRUE;
        }
        #endif
    }
    return pxEventBits;
}
```
```c
/*
 * 函数功能：
 * 删除事件组，先解除所有等待任务的阻塞，再按分配方式决定是否释放对象内存
 * 调用者必须保证删除后不再使用该句柄
 *
 * 参数：
 * xEventGroup  输入，要删除的事件组句柄
 *
 * 返回值：
 * 无返回值
 */
void vEventGroupDelete( EventGroupHandle_t xEventGroup )
{
    // 转为内部对象以访问等待列表和分配标记
    EventGroup_t * pxEventBits = xEventGroup;
    // 指向要逐个排空的任务等待列表
    const List_t * pxTasksWaitingForBits;

    // 删除操作要求句柄指向存在的事件组
    configASSERT( pxEventBits );

    // 取得本事件组上当前阻塞的任务列表
    pxTasksWaitingForBits = &( pxEventBits->xTasksWaitingForBits );

    // 挂起调度，避免在排空列表期间切换到刚被唤醒的任务
    vTaskSuspendAll();
    {
        // 遍历到列表为空，确保没有任务留在将失效的事件组上
        while( listCURRENT_LIST_LENGTH( pxTasksWaitingForBits ) > ( UBaseType_t ) 0 )
        {
            // 非空长度下头项必须不是尾哨兵，用于检查列表一致性
            configASSERT( pxTasksWaitingForBits->xListEnd.pxNext != ( const ListItem_t * ) &( pxTasksWaitingForBits->xListEnd ) );
            // 解除头部任务的事件等待并使其 Ready，写入控制标志与零应用事件快照
            // 复用该标志可让等待 API 跳过超时重读分支，返回 0 而不再访问待删除对象
            vTaskRemoveFromUnorderedEventList( pxTasksWaitingForBits->xListEnd.pxNext, eventUNBLOCKED_DUE_TO_BIT_SET );
        }
    }
    // 恢复调度，tasks.c 可根据刚就绪任务的优先级立即发生切换
    ( void ) xTaskResumeAll();

    // configSUPPORT_DYNAMIC_ALLOCATION 为 1 且 configSUPPORT_STATIC_ALLOCATION 为 0 时仅支持动态创建，直接释放对象
    #if ( ( configSUPPORT_DYNAMIC_ALLOCATION == 1 ) && ( configSUPPORT_STATIC_ALLOCATION == 0 ) )
    {
        // 释放动态事件组对象占用的堆内存
        vPortFree( pxEventBits );
    }

    // configSUPPORT_DYNAMIC_ALLOCATION 和 configSUPPORT_STATIC_ALLOCATION 均为 1 时，两类创建方式并存，按来源选择是否释放
    #elif ( ( configSUPPORT_DYNAMIC_ALLOCATION == 1 ) && ( configSUPPORT_STATIC_ALLOCATION == 1 ) )
    {
        // 只释放由 xEventGroupCreate() 从堆中创建的对象
        if( pxEventBits->ucStaticallyAllocated == ( uint8_t ) pdFALSE )
        {
            vPortFree( pxEventBits );
        }
    }
    #endif
}
```
**②事件位等待**
>**概述**：`FreeRTOS`提供`xEventGroupWaitBits`用于**等待指定事件位**，条件未满足时可将当前任务加入**事件组等待列表**并进入**阻塞状态**
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
```c
/*
 * 函数功能：
 * 等待指定事件位满足任意位或全部位条件
 * 条件未满足且允许阻塞时，将当前任务加入事件组等待链表，并阻塞等待事件满足或超时
 *
 * 参数：
 * xEventGroup      输入，要等待的事件组句柄
 * uxBitsToWaitFor  输入，目标事件位掩码
 * xClearOnExit     输入，非 pdFALSE 表示条件满足时清除目标位
 * xWaitForAllBits  输入，pdFALSE 表示任意位，否则表示全部位
 * xTicksToWait     输入，等待 Tick 数，0 表示立即返回
 *                  INCLUDE_vTaskSuspend 为 1 时，portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * EventBits_t  条件满足时的清位前快照，或超时处理/非阻塞检查时的快照
 * 0            删除事件组，或返回快照中没有任何应用事件位置位
 */
EventBits_t xEventGroupWaitBits( EventGroupHandle_t xEventGroup,
                                    const EventBits_t uxBitsToWaitFor,
                                    const BaseType_t xClearOnExit,
                                    const BaseType_t xWaitForAllBits,
                                    TickType_t xTicksToWait )
{
    // 指向当前任务要等待的内部事件组对象
    EventGroup_t * pxEventBits = xEventGroup;
    // uxReturn 保存返回快照，uxControlBits 组装清位和全部位等待语义
    EventBits_t uxReturn, uxControlBits = 0;
    // xWaitConditionMet 保存条件判定结果，xAlreadyYielded 保存恢复调度是否已请求让出 CPU 的结果
    BaseType_t xWaitConditionMet, xAlreadyYielded;
    // 保存是否进入超时处理分支的结果，供跟踪钩子使用
    BaseType_t xTimeoutOccurred = pdFALSE;

    // 句柄必须指向已创建的事件组
    configASSERT( xEventGroup );
    // 应用掩码不得包含内核借用的高位控制字节
    configASSERT( ( uxBitsToWaitFor & eventEVENT_BITS_CONTROL_BYTES ) == 0 );
    // 至少必须等待一个事件位
    configASSERT( uxBitsToWaitFor != 0 );

    // INCLUDE_xTaskGetSchedulerState 为 1 时提供状态查询，configUSE_TIMERS 为 1 时定时器模块也需要该查询任一宏为 1 时编译状态断言，检查阻塞调用未发生在调度器已挂起期间
    #if ( ( INCLUDE_xTaskGetSchedulerState == 1 ) || ( configUSE_TIMERS == 1 ) )
    {
        // 调度器已挂起时不允许再请求非零时间的任务阻塞
        configASSERT( !( ( xTaskGetSchedulerState() == taskSCHEDULER_SUSPENDED ) && ( xTicksToWait != 0 ) ) );
    }
    #endif

    // 暂停调度，将条件检查与必要时的挂链操作作为连续过程
    vTaskSuspendAll();
    {
        // 只读取一次当前事件位，后续判定基于同一快照
        const EventBits_t uxCurrentEventBits = pxEventBits->uxEventBits;

        // 按调用者选择的任意/全部规则检查快照
        xWaitConditionMet = prvTestWaitCondition( uxCurrentEventBits, uxBitsToWaitFor, xWaitForAllBits );

        // 条件已满足时无需把当前任务移入阻塞链表
        if( xWaitConditionMet != pdFALSE )
        {
            // 返回条件判定时的完整事件位快照
            uxReturn = uxCurrentEventBits;

            // 用 0 标记本次未真正阻塞，后续跳过让出与唤醒值解码
            xTicksToWait = ( TickType_t ) 0;

            // 调用者要求自动清除时，在返回前消费所等待的事件位
            if( xClearOnExit != pdFALSE )
            {
                pxEventBits->uxEventBits &= ~uxBitsToWaitFor;
            }
        }
        // 条件未满足且等待时间为 0 时，立即返回而不改变任务状态
        else if( xTicksToWait == ( TickType_t ) 0 )
        {
            // 返回本次检查时看到的事件位
            uxReturn = uxCurrentEventBits;
            // 对 trace 而言，“零等待仍未满足”属于超时结果
            xTimeoutOccurred = pdTRUE;
        }
        else
        {
            // xClearOnExit 非 pdFALSE 时，本次阻塞等待需要记录自动清位选项
            if( xClearOnExit != pdFALSE )
            {
                uxControlBits |= eventCLEAR_EVENTS_ON_EXIT_BIT;
            }

            // xWaitForAllBits 非 pdFALSE 时，本次阻塞等待要求全部目标位均已置位
            if( xWaitForAllBits != pdFALSE )
            {
                uxControlBits |= eventWAIT_FOR_ALL_BITS;
            }

            // 登记“目标掩码 + 等待选项”，并由 tasks.c 将当前任务移出 Ready
            // 有限等待登记 Tick 超时；INCLUDE_vTaskSuspend 为 1 且等待时间为 portMAX_DELAY 时采用无限等待
            vTaskPlaceOnUnorderedEventList( &( pxEventBits->xTasksWaitingForBits ), ( uxBitsToWaitFor | uxControlBits ), xTicksToWait );

            // 占位初值仅用于避免编译器误判，唤醒后会被真实的列表项值覆盖
            uxReturn = 0;
        }
    }
    // 解除调度挂起，并获取恢复调度过程中是否已请求让出 CPU 的结果
    xAlreadyYielded = xTaskResumeAll();

    // 等待时间仍非 0 时，执行登记阻塞后的让出及等待结果读取流程
    if( xTicksToWait != ( TickType_t ) 0 )
    {
        // xTaskResumeAll() 尚未请求让出 CPU 时，由本 API 显式请求调度
        if( xAlreadyYielded == pdFALSE )
        {
            taskYIELD_WITHIN_API();
        }

        // 取回等待结束时的事件列表项值，并恢复该列表项供队列/信号量使用的优先级排序值
        uxReturn = uxTaskResetEventItemValue();

        // 未带 eventUNBLOCKED_DUE_TO_BIT_SET 时走超时处理分支，Tick 到期和已启用的 xTaskAbortDelay() 均可进入此处
        if( ( uxReturn & eventUNBLOCKED_DUE_TO_BIT_SET ) == ( EventBits_t ) 0 )
        {
            // 在临界区内重读事件位，避免读改过程与其他上下文的位更新交叉
            taskENTER_CRITICAL();
            {
                // 本分支返回重新运行后读到的快照，不使用登记等待时的旧值
                uxReturn = pxEventBits->uxEventBits;

                // 检查重新读取的快照是否已满足本次任意位/全部位条件，处理离开阻塞状态后发生置位的竞态
                if( prvTestWaitCondition( uxReturn, uxBitsToWaitFor, xWaitForAllBits ) != pdFALSE )
                {
                    // 若重读已满足条件，仍按调用者的退出清位选项执行
                    if( xClearOnExit != pdFALSE )
                    {
                        pxEventBits->uxEventBits &= ~uxBitsToWaitFor;
                    }
                }

                // 记录本次等待进入超时处理分支，主动中止等待也使用该跟踪结果
                xTimeoutOccurred = pdTRUE;
            }
            taskEXIT_CRITICAL();
        }

        // 屏蔽列表项中的内核控制位，公开 API 只暴露应用事件位
        uxReturn &= ~eventEVENT_BITS_CONTROL_BYTES;
    }

    // trace 宏被移除时仍显式使用该变量，避免未使用警告
    ( void ) xTimeoutOccurred;

    return uxReturn;
}
```
**③事件位置位**
>**概述**：`FreeRTOS`提供`xEventGroupSetBits`用于将**指定事件位**置为`1`，并检查**等待任务的事件条件**，将满足条件的任务**解除阻塞**
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
```c
/*
 * 函数功能：
 * 设置指定事件位，扫描所有等待任务，并将条件满足者从 Blocked 转为 Ready
 * 根据每个等待者编码的退出清位选项，在本轮扫描完成后统一清除已消费的位
 *
 * 参数：
 * xEventGroup 输入，目标事件组句柄
 * uxBitsToSet 输入，要置为 1 的应用事件位掩码
 *
 * 返回值：
 * EventBits_t  唤醒匹配任务并执行退出清位后的事件位快照
 */
EventBits_t xEventGroupSetBits( EventGroupHandle_t xEventGroup,
                                const EventBits_t uxBitsToSet )
{
    // 当前扫描的任务事件列表项
    ListItem_t * pxListItem;
    // 预先保存后继项，因为当前项可能在唤醒时被移出本列表
    ListItem_t * pxNext;
    // 用于判定等待列表遍历结束的哨兵指针
    ListItem_t const * pxListEnd;
    // 指向当前事件组的等待列表
    List_t const * pxList;
    // uxBitsToClear 累计本轮要清除的掩码，uxBitsWaitedFor 保存当前等待者的目标掩码
    // uxControlBits 保存解码后的等待选项，uxReturnBits 保存本次置位操作的最终快照
    EventBits_t uxBitsToClear = 0, uxBitsWaitedFor, uxControlBits, uxReturnBits;
    // 内部对象用于更新事件位并获取等待列表
    EventGroup_t * pxEventBits = xEventGroup;
    // 记录当前等待者是否被新事件位满足
    BaseType_t xMatchFound = pdFALSE;

    // 句柄必须指向有效的事件组
    configASSERT( xEventGroup );
    // 应用不得置位内核保留的高位控制字节
    configASSERT( ( uxBitsToSet & eventEVENT_BITS_CONTROL_BYTES ) == 0 );

    // 取出等待列表及尾哨兵，为线性扫描做准备
    pxList = &( pxEventBits->xTasksWaitingForBits );
    pxListEnd = listGET_END_MARKER( pxList );

    // 挂起调度器，使置位、遍历等待者和任务状态迁移保持连续
    vTaskSuspendAll();
    {
        // 从等待列表的第一个任务项开始遍历
        pxListItem = listGET_HEAD_ENTRY( pxList );

        // OR 运算保留旧事件，并将请求掩码中的位设为 1
        pxEventBits->uxEventBits |= uxBitsToSet;

        // 事件组列表不按优先级排序，因此必须检查每个等待者
        while( pxListItem != pxListEnd )
        {
            // 当前事件列表项可能被移出等待列表，先保存原列表中的下一项
            pxNext = listGET_NEXT( pxListItem );

            // 从 TCB 的事件列表项值取出等待掩码与控制位的合并编码
            uxBitsWaitedFor = listGET_LIST_ITEM_VALUE( pxListItem );

            // 为当前等待者重置匹配结果
            xMatchFound = pdFALSE;

            // 高位控制字节保存“全部位”和“退出清位”等内核语义
            uxControlBits = uxBitsWaitedFor & eventEVENT_BITS_CONTROL_BYTES;

            // 移除控制位后留下纯应用事件掩码
            uxBitsWaitedFor &= ~eventEVENT_BITS_CONTROL_BYTES;

            // 未要求 eventWAIT_FOR_ALL_BITS 时，任意一个目标位命中即可唤醒
            if( ( uxControlBits & eventWAIT_FOR_ALL_BITS ) == ( EventBits_t ) 0 )
            {
                // 按位与的结果非 0 表示当前事件集至少含有一个目标位
                if( ( uxBitsWaitedFor & pxEventBits->uxEventBits ) != ( EventBits_t ) 0 )
                {
                    xMatchFound = pdTRUE;
                }
            }

            // 要求全部位时，按位与结果必须完全等于目标掩码
            else if( ( uxBitsWaitedFor & pxEventBits->uxEventBits ) == uxBitsWaitedFor )
            {
                xMatchFound = pdTRUE;
            }

            // 当前等待者的任意位/全部位条件已匹配时，解除该任务的事件等待
            if( xMatchFound != pdFALSE )
            {
                // 若该等待者要求退出清位，累计其目标掩码，不在扫描中途立即清除
                if( ( uxControlBits & eventCLEAR_EVENTS_ON_EXIT_BIT ) != ( EventBits_t ) 0 )
                {
                    uxBitsToClear |= uxBitsWaitedFor;
                }

                // 保存满足时的事件快照和标志，并由 tasks.c 解除该任务的等待、将其转入 Ready
                // 单核将更高优先级任务的切换记入 xYieldPendings[0]；多核在启用抢占时通过 prvYieldForTask() 选择需让出的核心
                vTaskRemoveFromUnorderedEventList( pxListItem, pxEventBits->uxEventBits | eventUNBLOCKED_DUE_TO_BIT_SET );
            }

            // 使用事先保存的原列表后继继续遍历，避免访问已移动项的 pxNext
            pxListItem = pxNext;
        }

        // 所有等待者都看到同一份置位后快照之后，再统一清除被自动消费的位
        pxEventBits->uxEventBits &= ~uxBitsToClear;

        // 捕获清位后的最终状态，作为 API 返回值
        uxReturnBits = pxEventBits->uxEventBits;
    }
    // 解除本层调度挂起；仅在挂起计数归零后，tasks.c 才处理待切换请求和累计 Tick
    ( void ) xTaskResumeAll();

    return uxReturnBits;
}
```
```c

```


**①引言**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}

**①引言**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}

**①引言**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
