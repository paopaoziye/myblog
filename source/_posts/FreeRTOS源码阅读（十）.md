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
>**概述**：`FreeRTOS`提供的一种**多事件同步机制**，通过**事件位集合**记录多个事件的状态，使任务能够等待**任意一个或全部指定事件**
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

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

    // configUSE_TRACE_FACILITY 为 1 时启用跟踪功能并保留事件组编号字段
    #if ( configUSE_TRACE_FACILITY == 1 )
        UBaseType_t uxEventGroupNumber; // 供跟踪工具识别事件组
    #endif

    // configSUPPORT_STATIC_ALLOCATION 和 configSUPPORT_DYNAMIC_ALLOCATION 分别控制静态和动态创建
    // 两者均为 1 时保留分配来源字段，供删除时判定是否释放内存
    #if ( ( configSUPPORT_STATIC_ALLOCATION == 1 ) && ( configSUPPORT_DYNAMIC_ALLOCATION == 1 ) )
        uint8_t ucStaticallyAllocated; // 记录事件组存储的分配来源
    #endif
} EventGroup_t;
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
