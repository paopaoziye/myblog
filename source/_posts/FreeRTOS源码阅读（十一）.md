---
title: FreeRTOS源码阅读（十一）
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
date: 2026-10-14 16:39:43
keywords:
summary: FreeRTOS流缓冲与消息缓冲机制
---
# RTOS
## FreeRTOS源码阅读
### FreeRTOS源码阅读（十一）
#### 流缓冲与消息缓冲
**①引言**
>**概述**：流缓冲与消息缓冲是一种**任务间及任务与中断间**传递数据的**轻量级通信机制**，由`configUSE_STREAM_BUFFERS`控制
{%list%}
流缓冲和消息缓冲均通过环形缓冲区存储数据，前者支持连续字节流的部分读写，后者通过消息长度字段指示每个消息的边界
{%endlist%}
>流缓冲与消息缓冲的控制结构均为`StreamBufferDef_t`，通过记录**等待收发的任务句柄**利用**任务通知机制**实现任务的阻塞与唤醒
{%right%}
流缓冲区和消息缓冲区采用环形缓冲区与任务通知机制，支持连续字节流或变长消息传输，内存占用较小且通信效率较高
{%endright%}
{%warning%}
流缓冲区和消息缓冲区默认仅支持单写入者和单读取者，多任务并发访问需要额外同步保护，且数据传输仍需进行内存复制
{%endwarning%}
```c
/*
 * 流、消息和批处理流缓冲区共用的环形控制结构
 * 单写者维护头下标，单读者维护尾下标；保留一个槽位区分空与满
 */
typedef struct StreamBufferDef_t
{
    volatile size_t xTail;                                                // 接收端下一次读取的位置
    volatile size_t xHead;                                                // 发送端下一次写入的位置
    size_t xLength;                                                       // 环形数据区的总长度
    size_t xTriggerLevelBytes;                                            // 接收任务的数据量触发阈值
    volatile TaskHandle_t xTaskWaitingToReceive;                          // 等待接收数据的任务句柄
    volatile TaskHandle_t xTaskWaitingToSend;                             // 等待发送空间的任务句柄
    uint8_t * pucBuffer;                                                  // 实际保存长度字段与负载的字节数组
    uint8_t ucFlags;                                                      // 组合保存缓冲区模式与内存所有权

    // configUSE_TRACE_FACILITY 定义为 1 时添加实例跟踪编号；未定义时 FreeRTOS.h 默认设为 0
    #if ( configUSE_TRACE_FACILITY == 1 )
        UBaseType_t uxStreamBufferNumber;                                 // 供跟踪工具标识缓冲区的编号
    #endif

    // configUSE_SB_COMPLETED_CALLBACK 定义为 1 时在每个实例保存收发完成回调
    #if ( configUSE_SB_COMPLETED_CALLBACK == 1 )
        StreamBufferCallbackFunction_t pxSendCompletedCallback;           // 发送达到触发条件时的实例完成回调
        StreamBufferCallbackFunction_t pxReceiveCompletedCallback;        // 成功接收负载后的实例完成回调
    #endif
    UBaseType_t uxNotificationIndex;                                      // 阻塞收发所使用的任务通知数组下标
} StreamBuffer_t;
```
**②引言**
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
