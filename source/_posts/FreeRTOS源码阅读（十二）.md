---
title: FreeRTOS源码阅读（十二）
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
date: 2026-10-14 16:43:29
keywords:
summary: FreeRTOS软件定时器机制
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（十二）
#### 软件定时器
**①引言**
>**概述**：`FreeRTOS`的软件定时器是一种基于系统`Tick`实现**定时回调**的软件计时机制，由`configUSE_TIMERS`宏控制
{%list%}
软件定时器通过命令队列接收控制请求，由定时器服务任务统一管理到期链表，并在定时器到期时执行相应的回调函数
{%endlist%}
{%right%}
软件定时器无需占用额外的硬件定时器资源，由统一的服务任务管理多个软件定时器，降低系统资源开销并简化定时功能开发
{%endright%}
{%warning%}
软件定时器精度受系统Tick和任务调度影响，回调函数共享同一服务任务，执行耗时过长会影响其他定时器的响应
{%endwarning%}
```c
/*
 * 软件定时器内部控制块
 * 保存到期排序节点、周期、回调、应用标识和状态属性
 */
typedef struct tmrTimerControl
{
    const char * pcTimerName;                                                // 供调试器和跟踪工具显示的名称
    ListItem_t xTimerListItem;                                               // 以到期 Tick 排序并反向关联控制块的链表节点
    TickType_t xTimerPeriodInTicks;                                          // 定时周期，单位为系统 Tick
    void * pvTimerID;                                                        // 应用保存和读取的不透明标识
    portTIMER_CALLBACK_ATTRIBUTE TimerCallbackFunction_t pxCallbackFunction; // 到期后由定时器服务任务执行的回调
    // `configUSE_TRACE_FACILITY` 定义为 1 时保存跟踪工具使用的编号
    #if ( configUSE_TRACE_FACILITY == 1 )
        UBaseType_t uxTimerNumber;                                           // 跟踪工具为该定时器保存的编号
    #endif
    uint8_t ucStatus;                                                        // 活动、静态分配和自动重装属性的位集合
} xTIMER;

/* 保留旧类型名 `xTIMER` 以兼容内核感知调试器，并为实现代码提供 `Timer_t` 别名 */
typedef xTIMER Timer_t;
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
