---
title: FreeRTOS源码阅读（七）
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
date: 2026-09-29 16:21:16
keywords:
summary: FreeRTOS任务通知
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（七）
#### 任务通知
**①引言**
>**概述**：`FreeRTOS`**任务通知**是一种直接基于`TCB`实现的**轻量级通信机制**，可通过`configUSE_TASK_NOTIFICATIONS`宏启用该功能
{%list%}
开启任务通知后，TCB中会出现两个成员ulNotifiedValue和ucNotifyState，分别用于保存任务通知值和任务通知状态
{%endlist%}
{%right%}
任务通知无需额外创建独立内核对象，因此能够减少内存占用和对象管理开销，同时通信路径更短，具有更高的执行效率
{%endright%}
{%warning%}
任务通知只能直接作用于指定任务，并且每次只能传递32位数据，在多消息缓存、多接收者和复杂数据传递场景下灵活性较低
{%endwarning%}
```c
/* 任务通知槽的状态：未等待通知、正在等待通知、已收到通知 */
#define taskNOT_WAITING_NOTIFICATION              ( ( uint8_t ) 0 )                  // 该槽处于未等待通知状态
#define taskWAITING_NOTIFICATION                  ( ( uint8_t ) 1 )                  // 任务正在等待该槽的通知
#define taskNOTIFICATION_RECEIVED                 ( ( uint8_t ) 2 )                  // 该槽已经收到尚未处理的通知
```
```c
/*
 * 任务控制块中与任务通知相关的成员
 */
typedef struct tskTaskControlBlock       
{
    // configUSE_TASK_NOTIFICATIONS 为 1 时，为任务创建通知值和通知状态数组
    #if ( configUSE_TASK_NOTIFICATIONS == 1 )
        volatile uint32_t ulNotifiedValue[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];  // 每个任务通知槽携带的 32 位通知值
        volatile uint8_t ucNotifyState[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];     // 各通知槽的通知状态
    #endif
} tskTCB;

typedef tskTCB TCB_t;
```
```c
#include "FreeRTOS.h"
#include "task.h"
#include <stdint.h>

/* 接收任务句柄 */
static TaskHandle_t xReceiverTaskHandle = NULL;

/* 用于调试器观察接收到的数据 */
volatile uint32_t ulReceivedData = 0;


/* 接收任务 */
static void vReceiverTask( void * pvParameters )
{
    uint32_t ulNotifyValue;

    ( void ) pvParameters;

    for( ;; )
    {
        /*
         * 等待任务通知
         *
         * 0x00000000UL：进入等待前不清除通知值
         * 0xFFFFFFFFUL：收到通知后清除全部通知值
         * &ulNotifyValue：保存收到的通知值
         * portMAX_DELAY：无限等待
         */
        if( xTaskNotifyWait(
                0x00000000UL,
                0xFFFFFFFFUL,
                &ulNotifyValue,
                portMAX_DELAY ) == pdTRUE )
        {
            /* 保存收到的数据，方便调试器观察 */
            ulReceivedData = ulNotifyValue;
        }
    }
}


/* 发送任务 */
static void vSenderTask( void * pvParameters )
{
    uint32_t ulSendValue = 0;

    ( void ) pvParameters;

    for( ;; )
    {
        /* 每隔 1 秒发送一次 */
        vTaskDelay( pdMS_TO_TICKS( 1000 ) );

        ulSendValue++;

        /*
         * 向 Receiver 发送通知
         * eSetValueWithOverwrite：
         * 直接使用 ulSendValue 覆盖目标任务的通知值
         */
        xTaskNotify(
            xReceiverTaskHandle,
            ulSendValue,
            eSetValueWithOverwrite
        );
    }
}


int main( void )
{
    BaseType_t xReturn;

    /*
     * 创建接收任务
     * 优先级设为 2
     */
    xReturn = xTaskCreate(
        vReceiverTask,
        "Receiver",
        256,
        NULL,
        2,
        &xReceiverTaskHandle
    );

    configASSERT( xReturn == pdPASS );

    /*
     * 创建发送任务
     * 优先级设为 1
     */
    xReturn = xTaskCreate(
        vSenderTask,
        "Sender",
        256,
        NULL,
        1,
        NULL
    );

    configASSERT( xReturn == pdPASS );

    /* 启动调度器 */
    vTaskStartScheduler();

    /* 正常情况下不会执行到这里 */
    for( ;; )
    {
    }
}
```
**②通知发送**
>**概述**：`FreeRTOS`提供`xTaskNotify`、`xTaskNotifyAndQuery`和`xTaskNotifyGive`等接口，本质上都是对`xTaskGenericNotify`的封装
{%list%}
xTaskGenericNotify会更新目标任务的通知值与通知状态，若目标任务正在等待通知，则将其解除阻塞并在必要时请求重新调度
{%endlist%}
{%right%}
eAction用于控制任务通知值的更新方式，可以通过eIncrement或eSetValueWithOverwrite实现轻量信号量和单值邮箱
{%endright%}
{%warning%}
eSetValueWithoutOverwrite遇到尚未处理的通知时会返回pdFAIL，因此发送方需要检查返回值，避免新数据未能写入
{%endwarning%}
```c

#define tskDEFAULT_INDEX_TO_NOTIFY    ( 0 )

/*
 * 函数功能：
 * 固定使用通知槽 0；不取回更新前通知值
 * 更新目标任务指定槽的通知值与待处理状态，并在需要时解除通知等待；不会复制外部数据
 *
 * 参数：
 * xTaskToNotify  输入，接收任务通知的目标任务句柄
 * ulValue        输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction        输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotify( xTaskToNotify, ulValue, eAction ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( ulValue ), ( eAction ), NULL )
/*
 * 函数功能：
 * 使用参数指定通知槽；不取回更新前通知值
 * 更新目标任务指定槽的通知值与待处理状态，并在需要时解除通知等待；不会复制外部数据
 *
 * 参数：
 * xTaskToNotify    输入，接收任务通知的目标任务句柄
 * uxIndexToNotify  输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 * ulValue          输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction          输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyIndexed( xTaskToNotify, uxIndexToNotify, ulValue, eAction ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( uxIndexToNotify ), ( ulValue ), ( eAction ), NULL )

/*
 * 函数功能：
 * 固定使用通知槽 0；通过输出参数取回更新前通知值
 * 更新目标任务指定槽的通知值与待处理状态，并在需要时解除通知等待；不会复制外部数据
 *
 * 参数：
 * xTaskToNotify           输入，接收任务通知的目标任务句柄
 * ulValue                 输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                 输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pulPreviousNotifyValue  输出，接收更新前的通知值
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyAndQuery( xTaskToNotify, ulValue, eAction, pulPreviousNotifyValue ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( ulValue ), ( eAction ), ( pulPreviousNotifyValue ) )
/*
 * 函数功能：
 * 使用参数指定通知槽；通过输出参数取回更新前通知值
 * 更新目标任务指定槽的通知值与待处理状态，并在需要时解除通知等待；不会复制外部数据
 *
 * 参数：
 * xTaskToNotify           输入，接收任务通知的目标任务句柄
 * uxIndexToNotify         输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 * ulValue                 输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                 输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pulPreviousNotifyValue  输出，接收更新前的通知值
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyAndQueryIndexed( xTaskToNotify, uxIndexToNotify, ulValue, eAction, pulPreviousNotifyValue ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( uxIndexToNotify ), ( ulValue ), ( eAction ), ( pulPreviousNotifyValue ) )

/*
 * 函数功能：
 * 递增通知槽 0的值并设置待处理状态，可解除目标通知等待
 *
 * 参数：
 * xTaskToNotify  输入，接收任务通知的目标任务句柄
 *
 * 返回值：
 * pdPASS  通知计数已递增并已设置通知状态
 */
#define xTaskNotifyGive( xTaskToNotify ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( 0 ), eIncrement, NULL )
/*
 * 函数功能：
 * 递增指定通知槽的值并设置待处理状态，可解除目标通知等待
 *
 * 参数：
 * xTaskToNotify    输入，接收任务通知的目标任务句柄
 * uxIndexToNotify  输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 *
 * 返回值：
 * pdPASS  通知计数已递增并已设置通知状态
 */
#define xTaskNotifyGiveIndexed( xTaskToNotify, uxIndexToNotify ) \
    xTaskGenericNotify( ( xTaskToNotify ), ( uxIndexToNotify ), ( 0 ), eIncrement, NULL )
```
```c
/*
 * 函数功能：
 * 从任务上下文向目标任务发送通知，按 eAction 更新通知值并解除通知等待
 *
 * 参数：
 * xTaskToNotify                 目标任务句柄
 * uxIndexToNotify               目标通知数组下标
 * ulValue                       按 eAction 解释的位集或新值
 * eAction                       通知值的更新方式
 * pulPreviousNotificationValue  可选输出参数，接收更新前的通知值
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
BaseType_t xTaskGenericNotify( TaskHandle_t xTaskToNotify,
                                UBaseType_t uxIndexToNotify,
                                uint32_t ulValue,
                                eNotifyAction eAction,
                                uint32_t * pulPreviousNotificationValue )
{
    // 指向被通知任务的控制块
    TCB_t * pxTCB;
    // 保存任务通知操作的结果
    BaseType_t xReturn = pdPASS;
    // 保留通知前状态，用于判定是否需要解除阻塞
    uint8_t ucOriginalNotifyState;

    // 验证通知下标小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
    configASSERT( uxIndexToNotify < configTASK_NOTIFICATION_ARRAY_ENTRIES );
    // 确认已提供要通知的任务句柄
    configASSERT( xTaskToNotify );

    // TaskHandle_t 在内核中直接对应 TCB 指针
    pxTCB = xTaskToNotify;

    // 保护通知值、通知状态和任务链表的联合更新
    taskENTER_CRITICAL();
    {
        // 若调用者需要，在修改前返回原通知值
        if( pulPreviousNotificationValue != NULL )
        {
            *pulPreviousNotificationValue = pxTCB->ulNotifiedValue[ uxIndexToNotify ];
        }

        // 保存发送通知前的通知状态
        ucOriginalNotifyState = pxTCB->ucNotifyState[ uxIndexToNotify ];

        // 将该通知槽标记为已收到通知
        pxTCB->ucNotifyState[ uxIndexToNotify ] = taskNOTIFICATION_RECEIVED;

        // eAction 决定 ulValue 是作为位掩码、新数值，还是完全不修改数值
        switch( eAction )
        {
            case eSetBits:
                // 按位或合并新旧通知值
                pxTCB->ulNotifiedValue[ uxIndexToNotify ] |= ulValue;
                break;

            case eIncrement:
                // 将通知值当作计数器递增
                ( pxTCB->ulNotifiedValue[ uxIndexToNotify ] )++;
                break;

            case eSetValueWithOverwrite:
                // 无条件用 ulValue 替换原值
                pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
                break;

            case eSetValueWithoutOverwrite:
                // 仅在没有待消费通知时写入，避免覆盖未处理数值
                if( ucOriginalNotifyState != taskNOTIFICATION_RECEIVED )
                {
                    // 没有待处理通知时，保存新的通知值
                    pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
                }
                else
                {
                    // 保留原值并向调用者报告不覆盖写入失败
                    xReturn = pdFAIL;
                }
                break;

            case eNoAction:
                // 只更新通知状态，不改变通知值
                break;

            default:
                // 通知动作不在支持的枚举范围内，用 tick 值为零的断言检查此路径
                configASSERT( xTickCount == ( TickType_t ) 0 );
                break;
        }

        // 只有目标正因等待通知而阻塞时才需要迁回就绪链表
        if( ucOriginalNotifyState == taskWAITING_NOTIFICATION )
        {
            // 将任务移出所在的延时链表或挂起链表
            listREMOVE_ITEM( &( pxTCB->xStateListItem ) );
            // 将任务加入对应优先级的就绪链表
            prvAddTaskToReadyList( pxTCB );

            // 通知等待不使用对象事件链表，确认事件项仍保持未挂接
            configASSERT( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) == NULL );

            // configUSE_TICKLESS_IDLE 不为 0 时，启用 Tickless Idle 时，通知唤醒需重算下一次唤醒时间
            #if ( configUSE_TICKLESS_IDLE != 0 )
            {
                // 更新下一任务的唤醒时刻
                prvResetNextTaskUnblockTime();
            }
            #endif

            // 启用抢占时，检查是否需要切换任务
            taskYIELD_ANY_CORE_IF_USING_PREEMPTION( pxTCB );
        }
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回通知发送结果
    return xReturn;
}
```
**③通知接收**
>**概述**：`FreeRTOS`提供`xTaskNotifyWait`和`ulTaskNotifyTake`等接口，分别对应**普通任务通知接收**和**计数型任务通知接收**
{%list%}
xTaskNotifyWait等的底层实现是xTaskGenericNotifyWait，ulTaskNotifyTake等的底层实现是ulTaskGenericNotifyTake
{%endlist%}
{%right%}
xTaskGenericNotifyWait基于通知状态判断是否需要阻塞，ulTaskGenericNotifyTake基于通知值是否为零判断是否需要阻塞
{%endright%}
>需要阻塞时，两者都会将对应**任务通知状态**修改为`taskWAITING_NOTIFICATION`，随后将任务加入**延时列表**并触发**任务调度**

>注意任务因等待通知阻塞时，只需要将`xStateListItem`加入延时列表，不需要将`xEventListItem`挂载到对应事件列表
{%warning%}
xTaskNotifyWait的ulBitsToClearOnEntry仅在无待处理通知且准备阻塞时执行，ulBitsToClearOnExit仅在成功收到通知后执行
{%endwarning%}
{%wrong%}
任务通知的发送与接收接口需要根据通知语义配套使用，不能随意混用，否则可能出现通知已发送，但接收方无法正确处理的情况
{%endwrong%}
>如发送方使用`xTaskNotify`且使用`eNoAction`，而接收方使用`ulTaskNotifyTake`，会出现**任务已被唤醒**但通知计数仍为`0`的情况
```c
/*
 * 函数功能：
 * 固定使用通知槽 0
 * 等待当前任务指定槽的通知，按掩码清除入口或出口通知位；有待处理通知时入口清位不会执行
 *
 * 参数：
 * ulBitsToClearOnEntry  输入，开始等待且没有待处理通知时清除的通知位掩码
 * ulBitsToClearOnExit   输入，成功取得通知后清除的通知位掩码
 * pulNotificationValue  输出，可选地接收出口清位之前的通知值
 * xTicksToWait          输入，最长等待节拍数；0 表示立即尝试，portMAX_DELAY 的无限等待语义依接口与配置成立
 *
 * 返回值：
 * pdTRUE   收到了指定槽的通知
 * pdFALSE  等待结束时没有收到通知
 */
#define xTaskNotifyWait( ulBitsToClearOnEntry, ulBitsToClearOnExit, pulNotificationValue, xTicksToWait ) \
    xTaskGenericNotifyWait( tskDEFAULT_INDEX_TO_NOTIFY, ( ulBitsToClearOnEntry ), ( ulBitsToClearOnExit ), ( pulNotificationValue ), ( xTicksToWait ) )
/*
 * 函数功能：
 * 使用调用参数指定的通知槽
 * 等待当前任务指定槽的通知，按掩码清除入口或出口通知位；有待处理通知时入口清位不会执行
 *
 * 参数：
 * uxIndexToWaitOn       输入，当前任务等待的通知槽索引
 * ulBitsToClearOnEntry  输入，开始等待且没有待处理通知时清除的通知位掩码
 * ulBitsToClearOnExit   输入，成功取得通知后清除的通知位掩码
 * pulNotificationValue  输出，可选地接收出口清位之前的通知值
 * xTicksToWait          输入，最长等待节拍数；0 表示立即尝试，portMAX_DELAY 的无限等待语义依接口与配置成立
 *
 * 返回值：
 * pdTRUE   收到了指定槽的通知
 * pdFALSE  等待结束时没有收到通知
 */
#define xTaskNotifyWaitIndexed( uxIndexToWaitOn, ulBitsToClearOnEntry, ulBitsToClearOnExit, pulNotificationValue, xTicksToWait ) \
    xTaskGenericNotifyWait( ( uxIndexToWaitOn ), ( ulBitsToClearOnEntry ), ( ulBitsToClearOnExit ), ( pulNotificationValue ), ( xTicksToWait ) )
/*
 * 函数功能：
 * 固定使用通知槽 0
 * 等待当前任务指定通知槽的值非零，退出时按参数选择清零或减一
 *
 * 参数：
 * xClearCountOnExit  输入，pdTRUE 时把通知计数清零，pdFALSE 时只减一
 * xTicksToWait       输入，最长等待 tick 数；0 表示立即尝试，INCLUDE_vTaskSuspend 为 1 时 portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * 大于 0  清零或减一之前的通知计数
 * 0       等待结束时通知计数仍为零
 */
#define ulTaskNotifyTake( xClearCountOnExit, xTicksToWait ) \
    ulTaskGenericNotifyTake( ( tskDEFAULT_INDEX_TO_NOTIFY ), ( xClearCountOnExit ), ( xTicksToWait ) )
/*
 * 函数功能：
 * 使用调用参数指定的通知槽
 * 等待当前任务指定通知槽的值非零，退出时按参数选择清零或减一
 *
 * 参数：
 * uxIndexToWaitOn    输入，当前任务等待的通知槽索引
 * xClearCountOnExit  输入，pdTRUE 时把通知计数清零，pdFALSE 时只减一
 * xTicksToWait       输入，最长等待 tick 数；0 表示立即尝试，INCLUDE_vTaskSuspend 为 1 时 portMAX_DELAY 表示无限等待
 *
 * 返回值：
 * 大于 0  清零或减一之前的通知计数
 * 0       等待结束时通知计数仍为零
 */
#define ulTaskNotifyTakeIndexed( uxIndexToWaitOn, xClearCountOnExit, xTicksToWait ) \
    ulTaskGenericNotifyTake( ( uxIndexToWaitOn ), ( xClearCountOnExit ), ( xTicksToWait ) )
```
```c
/*
 * 函数功能：
 * 等待当前任务的指定通知，并按入参掩码在进入和退出时清除通知值位
 *
 * 参数：
 * uxIndexToWaitOn       要等待的通知数组下标
 * ulBitsToClearOnEntry  确认尚无待取通知后先清除的位
 * ulBitsToClearOnExit   成功取得通知后清除的位
 * pulNotificationValue  可选输出参数，接收退出前的通知值
 * xTicksToWait          最长等待 tick 数
 *
 * 返回值：
 * pdTRUE   本次调用取得通知
 * pdFALSE  等待超时或未收到通知
 */
BaseType_t xTaskGenericNotifyWait( UBaseType_t uxIndexToWaitOn,
                                    uint32_t ulBitsToClearOnEntry,
                                    uint32_t ulBitsToClearOnExit,
                                    uint32_t * pulNotificationValue,
                                    TickType_t xTicksToWait )
{
    // xReturn 保存等待结果，xAlreadyYielded 保存恢复调度器的切换结果，xShouldBlock 标记是否需要阻塞
    BaseType_t xReturn, xAlreadyYielded, xShouldBlock = pdFALSE;

    // 通知下标必须落在当前 TCB 的通知数组范围内
    configASSERT( uxIndexToWaitOn < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 没有待取通知且等待时间非零时，才进入阻塞准备流程
    if( ( pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] != taskNOTIFICATION_RECEIVED ) && ( xTicksToWait > ( TickType_t ) 0 ) )
    {
        // 挂起调度器，保护后面的阻塞操作
        vTaskSuspendAll();
        {
            // 进入临界区，复查通知状态并设置等待状态
            taskENTER_CRITICAL();
            {
                // 再次检查是否有待取通知，因为vTaskSuspendAll()只是暂停任务调度，并不会屏蔽中断
                // vTaskSuspendAll() 和 taskENTER_CRITICAL() 期间仍可能有 ISR 发送通知，需避免覆盖通知状态导致错误阻塞
                if( pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] != taskNOTIFICATION_RECEIVED )
                {
                    // 清除入口掩码指定的通知值位
                    pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] &= ~ulBitsToClearOnEntry;

                    // 将当前通知槽标记为等待通知
                    pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] = taskWAITING_NOTIFICATION;

                    // 记录本次确实需要迁入延时链表
                    xShouldBlock = pdTRUE;
                }
            }
            // 退出临界区，结束本次共享状态保护
            taskEXIT_CRITICAL();

            // 只有复查后仍无通知时才把当前任务加入延时链表
            if( xShouldBlock == pdTRUE )
            {
                // 将当前任务移入相应的等待链表
                prvAddCurrentTaskToDelayedList( xTicksToWait, pdTRUE );
            }
        }
        // 恢复调度器，并保存任务切换结果
        xAlreadyYielded = xTaskResumeAll();

        // 本次需要阻塞，且恢复调度器未请求切换任务时
        if( ( xShouldBlock == pdTRUE ) && ( xAlreadyYielded == pdFALSE ) )
        {
            // 让当前任务让出处理器，供调度器选择其他就绪任务
            taskYIELD_WITHIN_API();
        }
    }

    // 无论通知已到达、无需等待，还是阻塞后收到通知或等待超时，最终都会执行以下代码
    // 原子地读取通知值、判定超时与否并清理退出位
    taskENTER_CRITICAL();
    {
        // 调用者是否提供了接收通知值的输出指针
        if( pulNotificationValue != NULL )
        {
            // 输出清除退出位之前的完整通知值，即使本次因超时返回
            *pulNotificationValue = pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ];
        }

        // 退出等待时，仍未收到通知
        if( pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] != taskNOTIFICATION_RECEIVED )
        {
            // 本次没有取得通知，返回失败
            xReturn = pdFALSE;
        }
        else
        {
            // 清除退出掩码指定的通知值位
            pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] &= ~ulBitsToClearOnExit;
            // 本次已经取得通知，返回成功
            xReturn = pdTRUE;
        }

        // 结束本次等待周期
        pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] = taskNOT_WAITING_NOTIFICATION;
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回本次等待是否取得通知
    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 按计数信号量语义取得当前任务的通知值，必要时阻塞等待通知
 *
 * 参数：
 * uxIndexToWaitOn    要等待的通知数组下标
 * xClearCountOnExit  非零时取走全部计数，否则只减一
 * xTicksToWait       通知值为零时的最长等待 tick 数
 *
 * 返回值：
 * 退出时观察到的通知计数，超时未收到时为 0
 */
uint32_t ulTaskGenericNotifyTake( UBaseType_t uxIndexToWaitOn,
                                    BaseType_t xClearCountOnExit,
                                    TickType_t xTicksToWait )
{
    // 保存本次取走前的通知计数
    uint32_t ulReturn;
    // xAlreadyYielded 保存恢复调度器的切换结果，xShouldBlock 标记本次是否需要阻塞
    BaseType_t xAlreadyYielded, xShouldBlock = pdFALSE;

    // 通知下标必须落在 TCB 的通知数组内
    configASSERT( uxIndexToWaitOn < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 仅当计数仍为零且调用者允许等待时，才准备把当前任务阻塞
    if( ( pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] == 0U ) && ( xTicksToWait > ( TickType_t ) 0 ) )
    {
        // 挂起调度器，保护当前任务进入阻塞态的链表操作
        vTaskSuspendAll();
        {
            // 进入临界区，复查通知计数并设置等待状态
            taskENTER_CRITICAL();
            {
                // 复查后，通知计数仍为零时
                if( pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] == 0U )
                {
                    // 将当前通知槽标记为等待通知
                    pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] = taskWAITING_NOTIFICATION;

                    // 记住二次检查仍需阻塞
                    xShouldBlock = pdTRUE;
                }
            }
            // 退出临界区，结束本次共享状态保护
            taskEXIT_CRITICAL();

            // 只有没有在临界区内观察到新通知时才挂入延时链表
            if( xShouldBlock == pdTRUE )
            {
                // 将当前任务移入相应的等待链表
                prvAddCurrentTaskToDelayedList( xTicksToWait, pdTRUE );
            }
        }
        // 恢复调度器，并保存任务切换结果
        xAlreadyYielded = xTaskResumeAll();

        // 本次需要阻塞，且恢复调度器未请求切换任务时
        if( ( xShouldBlock == pdTRUE ) && ( xAlreadyYielded == pdFALSE ) )
        {
            // 让当前任务让出处理器，供调度器选择其他就绪任务
            taskYIELD_WITHIN_API();
        }
    }

    // 无论通知计数已非零、无需等待，还是阻塞后收到通知或等待超时，最终都会执行以下代码
    // 进入临界区，读取并更新通知计数
    taskENTER_CRITICAL();
    {
        // 保留消费前数值作为 API 返回值
        ulReturn = pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ];

        // 当前通知值是否含有可消费的计数
        if( ulReturn != 0U )
        {
            // 调用者要求取走全部通知计数时
            if( xClearCountOnExit != pdFALSE )
            {
                // 一次取走全部通知计数，将计数清零
                pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] = ( uint32_t ) 0U;
            }
            else
            {
                // 只取走一次通知计数，其余计数保留
                pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] = ulReturn - ( uint32_t ) 1;
            }
        }

        // 无论收到通知还是超时，退出时都恢复为未等待状态
        pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] = taskNOT_WAITING_NOTIFICATION;
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回取走前观察到的通知计数
    return ulReturn;
}
```
**④中断接口**
>**概述**：`FreeRTOS`提供`xTaskNotifyFromISR`和`vTaskNotifyGiveFromISR`等接口，用于在**中断服务程序**中向指定任务**发送通知**
{%list%}
相关接口的底层实现是xTaskGenericNotifyFromISR和vTaskGenericNotifyGiveFromISR，详细如下所示
{%endlist%}
{%right%}
中断API通过pxHigherPriorityTaskWoken反馈是否需要任务切换，需要调用者根据该标志手动调用portYIELD_FROM_ISR请求调度
{%endright%}
{%warning%}
触发唤醒时，若调度器正在运行，中断API直接将xStateListItem加入就绪列表，反之将xEventListItem加入xPendingReadyList
{%endwarning%}
{%wrong%}
调度器挂起期间，中断可能与任务同时修改状态列表，故FreeRTOS通过xPendingReadyList暂存唤醒请求，待恢复调度后统一处理
{%endwrong%}
```c
/*
 * 函数功能：
 * 固定使用通知槽 0；不取回更新前通知值
 * 在中断中更新指定通知槽，并报告是否唤醒更高优先级任务
 *
 * 参数：
 * xTaskToNotify              输入，接收任务通知的目标任务句柄
 * ulValue                    输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                    输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pxHigherPriorityTaskWoken  输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyFromISR( xTaskToNotify, ulValue, eAction, pxHigherPriorityTaskWoken ) \
    xTaskGenericNotifyFromISR( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( ulValue ), ( eAction ), NULL, ( pxHigherPriorityTaskWoken ) )
/*
 * 函数功能：
 * 使用参数指定通知槽；不取回更新前通知值
 * 在中断中更新指定通知槽，并报告是否唤醒更高优先级任务
 *
 * 参数：
 * xTaskToNotify              输入，接收任务通知的目标任务句柄
 * uxIndexToNotify            输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 * ulValue                    输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                    输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pxHigherPriorityTaskWoken  输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyIndexedFromISR( xTaskToNotify, uxIndexToNotify, ulValue, eAction, pxHigherPriorityTaskWoken ) \
    xTaskGenericNotifyFromISR( ( xTaskToNotify ), ( uxIndexToNotify ), ( ulValue ), ( eAction ), NULL, ( pxHigherPriorityTaskWoken ) )

/*
 * 函数功能：
 * 使用参数指定通知槽；通过输出参数取回更新前通知值
 * 在中断中更新指定通知槽，可取回更新前的值并报告是否唤醒更高优先级任务
 *
 * 参数：
 * xTaskToNotify                 输入，接收任务通知的目标任务句柄
 * uxIndexToNotify               输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 * ulValue                       输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                       输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pulPreviousNotificationValue  输出，可选地接收更新前的通知值，NULL 表示不读取旧值
 * pxHigherPriorityTaskWoken     输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyAndQueryIndexedFromISR( xTaskToNotify, uxIndexToNotify, ulValue, eAction, pulPreviousNotificationValue, pxHigherPriorityTaskWoken ) \
    xTaskGenericNotifyFromISR( ( xTaskToNotify ), ( uxIndexToNotify ), ( ulValue ), ( eAction ), ( pulPreviousNotificationValue ), ( pxHigherPriorityTaskWoken ) )
/*
 * 函数功能：
 * 固定使用通知槽 0；通过输出参数取回更新前通知值
 * 在中断中更新指定通知槽，可取回更新前的值并报告是否唤醒更高优先级任务
 *
 * 参数：
 * xTaskToNotify                 输入，接收任务通知的目标任务句柄
 * ulValue                       输入，通知数值或位掩码，具体解释由 eAction 决定
 * eAction                       输入，通知值的处理方式：仅唤醒、置位、递增或覆盖写入等
 * pulPreviousNotificationValue  输出，可选地接收更新前的通知值，NULL 表示不读取旧值
 * pxHigherPriorityTaskWoken     输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
#define xTaskNotifyAndQueryFromISR( xTaskToNotify, ulValue, eAction, pulPreviousNotificationValue, pxHigherPriorityTaskWoken ) \
    xTaskGenericNotifyFromISR( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( ulValue ), ( eAction ), ( pulPreviousNotificationValue ), ( pxHigherPriorityTaskWoken ) )
/*
 * 函数功能：
 * 使用通知槽 0
 * 从中断将目标通知槽计数加一，并在必要时解除该任务的通知等待
 *
 * 参数：
 * xTaskToNotify              输入，接收任务通知的目标任务句柄
 * pxHigherPriorityTaskWoken  输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * 无返回值
 */
#define vTaskNotifyGiveFromISR( xTaskToNotify, pxHigherPriorityTaskWoken ) \
    vTaskGenericNotifyGiveFromISR( ( xTaskToNotify ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( pxHigherPriorityTaskWoken ) )
/*
 * 函数功能：
 * 使用指定通知槽
 * 从中断将目标通知槽计数加一，并在必要时解除该任务的通知等待
 *
 * 参数：
 * xTaskToNotify              输入，接收任务通知的目标任务句柄
 * uxIndexToNotify            输入，目标通知槽索引，必须小于 configTASK_NOTIFICATION_ARRAY_ENTRIES
 * pxHigherPriorityTaskWoken  输出，收集中断退出时的切换请求；中断开始时初始化为 pdFALSE，需要切换时置 pdTRUE
 *
 * 返回值：
 * 无返回值
 */
#define vTaskNotifyGiveIndexedFromISR( xTaskToNotify, uxIndexToNotify, pxHigherPriorityTaskWoken ) \
    vTaskGenericNotifyGiveFromISR( ( xTaskToNotify ), ( uxIndexToNotify ), ( pxHigherPriorityTaskWoken ) )
```
```c
/*
 * 函数功能：
 * 从 ISR 向目标任务发送通知，更新通知值并报告是否需要让出
 *
 * 参数：
 * xTaskToNotify                 目标任务句柄
 * uxIndexToNotify               目标通知数组下标
 * ulValue                       按 eAction 解释的位集或新值
 * eAction                       通知值的更新方式
 * pulPreviousNotificationValue  可选输出参数，接收更新前的通知值
 * pxHigherPriorityTaskWoken     可选输出参数，需请求 ISR 退出后调度时置 pdTRUE
 *
 * 返回值：
 * pdPASS  通知发送成功
 * pdFAIL  eSetValueWithoutOverwrite 遇到尚未处理的通知
 */
BaseType_t xTaskGenericNotifyFromISR( TaskHandle_t xTaskToNotify,
                                        UBaseType_t uxIndexToNotify,
                                        uint32_t ulValue,
                                        eNotifyAction eAction,
                                        uint32_t * pulPreviousNotificationValue,
                                        BaseType_t * pxHigherPriorityTaskWoken )
{
    // 目标任务控制块
    TCB_t * pxTCB;
    // 通知前状态，决定是否要将任务解阻塞
    uint8_t ucOriginalNotifyState;
    // 保存中断上下文任务通知操作的结果
    BaseType_t xReturn = pdPASS;
    // ISR 临界区入口返回的中断屏蔽状态
    UBaseType_t uxSavedInterruptStatus;

    // 目标句柄必须有效且通知下标必须位于配置数组范围内
    configASSERT( xTaskToNotify );
    // 确认通知下标在配置的通知数组范围内
    configASSERT( uxIndexToNotify < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 验证当前 ISR 优先级允许调用 FreeRTOS FromISR API
    portASSERT_IF_INTERRUPT_PRIORITY_INVALID();

    // TaskHandle_t 直接对应目标 TCB
    pxTCB = xTaskToNotify;

    // 在 ISR 临界区内原子更新通知状态、通知值和调度链表
    uxSavedInterruptStatus = ( UBaseType_t ) taskENTER_CRITICAL_FROM_ISR();
    {
        // 调用者是否要求取得更新前的通知值
        if( pulPreviousNotificationValue != NULL )
        {
            // 在修改前把原通知值回填给调用者
            *pulPreviousNotificationValue = pxTCB->ulNotifiedValue[ uxIndexToNotify ];
        }

        // 保存发送通知前的通知状态
        ucOriginalNotifyState = pxTCB->ucNotifyState[ uxIndexToNotify ];
        // 将该通知槽标记为已收到通知
        pxTCB->ucNotifyState[ uxIndexToNotify ] = taskNOTIFICATION_RECEIVED;

        // 与任务上下文 API 使用相同的通知值更新语义
        switch( eAction )
        {
            case eSetBits:
                // 按位或合并新旧通知值
                pxTCB->ulNotifiedValue[ uxIndexToNotify ] |= ulValue;
                break;

            case eIncrement:
                // 将通知值作为无符号计数器递增
                ( pxTCB->ulNotifiedValue[ uxIndexToNotify ] )++;
                break;

            case eSetValueWithOverwrite:
                // 不考虑旧状态，直接用 ulValue 覆盖通知值
                pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
                break;

            case eSetValueWithoutOverwrite:

                // 仅当没有尚待消费的通知时允许不覆盖写入
                if( ucOriginalNotifyState != taskNOTIFICATION_RECEIVED )
                {
                    // 没有待处理通知时，保存新的通知值
                    pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
                }
                else
                {
                    // 保留旧值并报告写入冲突
                    xReturn = pdFAIL;
                }
                break;

            case eNoAction:
                // 只更新通知状态，不改变通知值
                break;

            default:
                // 通知动作不在支持的枚举范围内，用 tick 值为零的断言检查此路径
                configASSERT( xTickCount == ( TickType_t ) 0 );
                break;
        }

        // 目标正在等待本通知时，将其转移到可调度路径
        if( ucOriginalNotifyState == taskWAITING_NOTIFICATION )
        {
            // 任务通知无需创建独立的内核对象，因此任务因等待通知而阻塞时，只需要通过xStateListItem进入延时列表
            // 这里需要断言 EventListItem 没有被挂载到任何事件列表中
            configASSERT( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) == NULL );

            // 调度器可运行时直接改动延时与就绪链表
            if( uxSchedulerSuspended == ( UBaseType_t ) 0U )
            {
                // 将任务移出所在的延时链表或挂起链表
                listREMOVE_ITEM( &( pxTCB->xStateListItem ) );
                // 将任务加入对应优先级的就绪链表
                prvAddTaskToReadyList( pxTCB );

                // configUSE_TICKLESS_IDLE 不为 0 时，启用 Tickless Idle 时，ISR 提前唤醒任务后重算下次唤醒时间
                #if ( configUSE_TICKLESS_IDLE != 0 )
                {
                    // 更新下一任务的唤醒时刻
                    prvResetNextTaskUnblockTime();
                }
                #endif
            }
            else
            {
                // 调度器挂起时不改延时链表，先放入待就绪链表
                listINSERT_END( &( xPendingReadyList ), &( pxTCB->xEventListItem ) );
            }

            // configNUMBER_OF_CORES 为 1 时，单核直接比较优先级；多核按目标核心的调度状态判断是否让出
            #if ( configNUMBER_OF_CORES == 1 )
            {
                // 单核下新就绪任务更高优先级时请求 ISR 退出后切换
                if( pxTCB->uxPriority > pxCurrentTCB->uxPriority )
                {
                    // 调用者提供输出指针时，报告 ISR 退出后需要切换到高优先级任务
                    if( pxHigherPriorityTaskWoken != NULL )
                    {
                        *pxHigherPriorityTaskWoken = pdTRUE;
                    }

                    // 记录当前核心有待处理的任务切换请求
                    xYieldPendings[ 0 ] = pdTRUE;
                }
            }
            #else
            {
                // configUSE_PREEMPTION 为 1 时，多核开启抢占时，通知唤醒可请求另一核心切换任务
                #if ( configUSE_PREEMPTION == 1 )
                {
                    // 检查是否需要让其他任务为该任务让出核心
                    prvYieldForTask( pxTCB );

                    // 当前核心有待处理的任务切换请求时
                    if( xYieldPendings[ portGET_CORE_ID() ] == pdTRUE )
                    {
                        // 调用者是否提供了高优先级任务唤醒标志
                        if( pxHigherPriorityTaskWoken != NULL )
                        {
                            *pxHigherPriorityTaskWoken = pdTRUE;
                        }
                    }
                }
                #endif
            }
            #endif
        }
    }
    // 恢复进入临界区前的中断屏蔽状态
    taskEXIT_CRITICAL_FROM_ISR( uxSavedInterruptStatus );

    // 返回中断通知发送结果
    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 从 ISR 按计数信号量语义递增目标通知值并解除通知等待
 *
 * 参数：
 * xTaskToNotify              目标任务句柄
 * uxIndexToNotify            目标通知数组下标
 * pxHigherPriorityTaskWoken  可选输出参数，需请求 ISR 退出后调度时置 pdTRUE
 *
 * 返回值：
 * 无返回值
 */
void vTaskGenericNotifyGiveFromISR( TaskHandle_t xTaskToNotify,
                                    UBaseType_t uxIndexToNotify,
                                    BaseType_t * pxHigherPriorityTaskWoken )
{
    // 保存被通知任务的 TCB
    TCB_t * pxTCB;
    // 保存递增前的通知状态，用于判断目标是否正在等待
    uint8_t ucOriginalNotifyState;
    // 保存进入 ISR 临界区前的中断屏蔽状态
    UBaseType_t uxSavedInterruptStatus;

    // 验证目标任务、通知下标和当前 ISR API 调用优先级
    configASSERT( xTaskToNotify );
    // 确认通知下标在配置的通知数组范围内
    configASSERT( uxIndexToNotify < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 检查当前中断优先级是否允许调用内核接口
    portASSERT_IF_INTERRUPT_PRIORITY_INVALID();

    // TaskHandle_t 直接对应目标 TCB
    pxTCB = xTaskToNotify;

    // 在 ISR 临界区内联合更新通知和调度链表
    uxSavedInterruptStatus = ( UBaseType_t ) taskENTER_CRITICAL_FROM_ISR();
    {
        // 保存递增通知计数前的通知状态
        ucOriginalNotifyState = pxTCB->ucNotifyState[ uxIndexToNotify ];
        // 将该通知槽标记为已收到通知
        pxTCB->ucNotifyState[ uxIndexToNotify ] = taskNOTIFICATION_RECEIVED;

        // give 语义等价于把通知值作为计数器加一
        ( pxTCB->ulNotifiedValue[ uxIndexToNotify ] )++;

        // 目标正等待该通知时才需要解除阻塞
        if( ucOriginalNotifyState == taskWAITING_NOTIFICATION )
        {
            // 通知等待不挂入对象事件链表
            configASSERT( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) == NULL );

            // 调度器运行时直接从延时链表迁到就绪链表
            if( uxSchedulerSuspended == ( UBaseType_t ) 0U )
            {
                // 将任务移出所在的延时链表或挂起链表
                listREMOVE_ITEM( &( pxTCB->xStateListItem ) );
                // 将任务加入对应优先级的就绪链表
                prvAddTaskToReadyList( pxTCB );

                // configUSE_TICKLESS_IDLE 不为 0 时，启用 Tickless Idle 时，通知唤醒后更新最近任务解阻塞时间
                #if ( configUSE_TICKLESS_IDLE != 0 )
                {
                    // 更新下一任务的唤醒时刻
                    prvResetNextTaskUnblockTime();
                }
                #endif
            }
            else
            {
                // 调度器挂起时不能改动就绪/延时链表，先登记到待就绪链表
                listINSERT_END( &( xPendingReadyList ), &( pxTCB->xEventListItem ) );
            }

            // configNUMBER_OF_CORES 为 1 时，单核直接比较优先级；多核按目标核心的调度状态判断是否让出
            #if ( configNUMBER_OF_CORES == 1 )
            {
                // 单核下更高优先级目标就绪时请求 ISR 退出后切换
                if( pxTCB->uxPriority > pxCurrentTCB->uxPriority )
                {
                    // 按需通过输出参数通知调用者
                    if( pxHigherPriorityTaskWoken != NULL )
                    {
                        *pxHigherPriorityTaskWoken = pdTRUE;
                    }

                    // 记录当前核心有待处理的任务切换请求
                    xYieldPendings[ 0 ] = pdTRUE;
                }
            }
            #else
            {
                // configUSE_PREEMPTION 为 1 时，多核开启抢占时，通知唤醒可请求另一核心切换任务
                #if ( configUSE_PREEMPTION == 1 )
                {
                    // 检查是否需要让其他任务为该任务让出核心
                    prvYieldForTask( pxTCB );

                    // 当前核心有待处理的任务切换请求时
                    if( xYieldPendings[ portGET_CORE_ID() ] == pdTRUE )
                    {
                        // 调用者是否提供了高优先级任务唤醒标志
                        if( pxHigherPriorityTaskWoken != NULL )
                        {
                            *pxHigherPriorityTaskWoken = pdTRUE;
                        }
                    }
                }
                #endif
            }
            #endif
        }
    }
    // 恢复进入临界区前的中断屏蔽状态
    taskEXIT_CRITICAL_FROM_ISR( uxSavedInterruptStatus );
}
```
**⑤状态清除**
>**概述**：`FreeRTOS`提供`xTaskNotifyStateClear`和`ulTaskNotifyValueClear`等接口，分别用于清除待处理**通知状态**和**通知值指定位**
{%list%}
相关接口的底层实现是xTaskGenericNotifyStateClear和ulTaskGenericNotifyValueClear，详细如下所示
{%endlist%}
{%right%}
两个接口无需等待通知即可独立清除通知状态或通知值，适用于丢弃过期通知、清理事件标志及重置通知槽等场景
{%endright%}
{%warning%}
通知状态与通知值相互独立，清除通知状态不会清除通知值，清除通知值也不会改变通知状态，两者不能混为一谈
{%endwarning%}
```c
/*
 * 函数功能：
 * 固定使用通知槽 0
 * 清除指定槽的待处理通知状态，保留通知数值
 *
 * 参数：
 * xTask  输入，要操作或查询的任务句柄，NULL 表示当前任务
 *
 * 返回值：
 * pdTRUE   此前存在待处理通知，现已清除该状态
 * pdFALSE  此前没有待处理通知
 */
#define xTaskNotifyStateClear( xTask ) \
    xTaskGenericNotifyStateClear( ( xTask ), ( tskDEFAULT_INDEX_TO_NOTIFY ) )
/*
 * 函数功能：
 * 使用调用参数指定的通知槽
 * 清除指定槽的待处理通知状态，保留通知数值
 *
 * 参数：
 * xTask           输入，要操作或查询的任务句柄，NULL 表示当前任务
 * uxIndexToClear  输入，需要清理通知状态或通知数值的槽索引
 *
 * 返回值：
 * pdTRUE   此前存在待处理通知，现已清除该状态
 * pdFALSE  此前没有待处理通知
 */
#define xTaskNotifyStateClearIndexed( xTask, uxIndexToClear ) \
    xTaskGenericNotifyStateClear( ( xTask ), ( uxIndexToClear ) )
/*
 * 函数功能：
 * 固定使用通知槽 0
 * 按 ulBitsToClear 掩码清除指定槽通知值中的位
 *
 * 参数：
 * xTask          输入，要操作或查询的任务句柄，NULL 表示当前任务
 * ulBitsToClear  输入，要求清零的位掩码
 *
 * 返回值：
 * 通知值  按掩码清位之前的通知数值
 */
#define ulTaskNotifyValueClear( xTask, ulBitsToClear ) \
    ulTaskGenericNotifyValueClear( ( xTask ), ( tskDEFAULT_INDEX_TO_NOTIFY ), ( ulBitsToClear ) )
/*
 * 函数功能：
 * 使用调用参数指定的通知槽
 * 按 ulBitsToClear 掩码清除指定槽通知值中的位
 *
 * 参数：
 * xTask           输入，要操作或查询的任务句柄，NULL 表示当前任务
 * uxIndexToClear  输入，需要清理通知状态或通知数值的槽索引
 * ulBitsToClear   输入，要求清零的位掩码
 *
 * 返回值：
 * 通知值  按掩码清位之前的通知数值
 */
#define ulTaskNotifyValueClearIndexed( xTask, uxIndexToClear, ulBitsToClear ) \
    ulTaskGenericNotifyValueClear( ( xTask ), ( uxIndexToClear ), ( ulBitsToClear ) )
```
```c
/*
 * 函数功能：
 * 将已接收的通知状态重置为未等待，不改变通知值
 *
 * 参数：
 * xTask           目标任务句柄，为 NULL 时表示当前任务
 * uxIndexToClear  目标通知数组下标
 *
 * 返回值：
 * pdPASS  原状态为已接收并已清除
 * pdFAIL  原状态不是已接收
 */
BaseType_t xTaskGenericNotifyStateClear( TaskHandle_t xTask,
                                            UBaseType_t uxIndexToClear )
{
    // 指向要清理通知状态的任务
    TCB_t * pxTCB;
    // 报告原状态是否允许本次清理
    BaseType_t xReturn;

    // 目标下标必须位于通知数组范围内
    configASSERT( uxIndexToClear < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 获取要修改的任务，传入 NULL 时使用当前任务
    pxTCB = prvGetTCBFromHandle( xTask );
    // 确认任务控制块非空
    configASSERT( pxTCB != NULL );

    // 通知发送可与此 API 并发，因此在临界区内检查并改状态
    taskENTER_CRITICAL();
    {
        // 只有尚待消费的已接收状态允许被显式清除
        if( pxTCB->ucNotifyState[ uxIndexToClear ] == taskNOTIFICATION_RECEIVED )
        {
            // 清除状态但保留 ulNotifiedValue，调用者可另行读取或清位
            pxTCB->ucNotifyState[ uxIndexToClear ] = taskNOT_WAITING_NOTIFICATION;
            // 通知状态已经清除，返回成功
            xReturn = pdPASS;
        }
        else
        {
            // 原状态不是已收到通知，返回未清除
            xReturn = pdFAIL;
        }
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回是否清除了已收到通知的状态
    return xReturn;
}
```
```c
/*
 * 函数功能：
 * 返回通知值快照并原子清除指定位
 *
 * 参数：
 * xTask           目标任务句柄，为 NULL 时表示当前任务
 * uxIndexToClear  目标通知数组下标
 * ulBitsToClear   要清除的通知值位掩码
 *
 * 返回值：
 * 清位前的通知值
 */
uint32_t ulTaskGenericNotifyValueClear( TaskHandle_t xTask,
                                        UBaseType_t uxIndexToClear,
                                        uint32_t ulBitsToClear )
{
    // 指向要清除通知值位的任务
    TCB_t * pxTCB;
    // 保留修改前的完整通知值
    uint32_t ulReturn;

    // 目标下标必须位于通知数组范围内
    configASSERT( uxIndexToClear < configTASK_NOTIFICATION_ARRAY_ENTRIES );

    // 获取要查询的任务，传入 NULL 时使用当前任务
    pxTCB = prvGetTCBFromHandle( xTask );
    // 确认任务控制块非空
    configASSERT( pxTCB != NULL );

    // 原子地快照通知值并清除指定位
    taskENTER_CRITICAL();
    {
        // 保存清位前的通知值，供函数返回
        ulReturn = pxTCB->ulNotifiedValue[ uxIndexToClear ];
        // 清除掩码指定的通知值位，保留其他位
        pxTCB->ulNotifiedValue[ uxIndexToClear ] &= ~ulBitsToClear;
    }
    // 退出临界区，结束本次共享状态保护
    taskEXIT_CRITICAL();

    // 返回清位前的通知值
    return ulReturn;
}
```