---
title: Freertos入门（三）
seo_title: seo名称
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
tag:
  - 操作系统
categories: 工作流
keywords: 文章关键词
updated: ''
img: /medias/featureimages/38.webp
date:
summary: 任务间通信
---
# Freertos
## Freertos入门（三）
### 1.消息队列
#### 1.1引言
**①简介**
>**概述**：可以在**任务/中断和任务/中断之间**传递消息，存储**有限的**、**大小固定**的数据项目，通常采用**先进先出**
{%list%}
采用值传递，即队列中存储的是原数据的拷贝
{%endlist%}
{%right%}
当数据较大时，可以通过传递消息缓冲区的地址指针做到引用传递
{%endright%}
{%warning%}
队列不是属于某个特别指定的任务的，只要有队列的句柄，任何任务和中断都可以读写队列
{%endwarning%}
**②工作原理**
>**概述**：描述队列的结构体`Queue_t`如下，队列主要由**消息缓冲区（本质为环形数组）**、**读列表**和**写列表**组成
{%list%}
当任务试图从队列中读取/写入消息，而缓冲区为空/满时，可以选择阻塞并进入对应列表，直到缓冲区有数据/空位
{%endlist%}
{%right%}
阻塞列表按照任务的优先级顺序从大到小排列，优先级相同则先到先得
{%endright%}
```c
typedef struct QueueDefinition 
{
  /* 分别指向队列存储区域的头部即读取位置和下一个写入位置 */
  int8_t * pcHead;                    
  int8_t * pcWriteTo;             
  /* 信号量本质上为特殊的队列，为信号量时采用xSemaphore */
  union                           
  {
    QueuePointers_t xQueue;     
    SemaphoreData_t xSemaphore;
  } u;
  /* 等待发送/传递消息而阻塞的任务列表，按照优先级顺序排列 */
  List_t xTasksWaitingToSend;            
  List_t xTasksWaitingToReceive;         
  /* 记录当前队列中的消息数量、最大长度和每个项目的大小 */
  volatile UBaseType_t uxMessagesWaiting; 
  UBaseType_t uxLength;                   
  UBaseType_t uxItemSize;                 
  /* 记录队列被锁定时，被读取/写入的数量 */
  volatile int8_t cRxLock;               
  volatile int8_t cTxLock;         
  /* 条件编译成员，略 */
} xQUEUE;

typedef xQUEUE Queue_t;

typedef struct QueuePointers
{
  /* 指向队列存储区域的末尾和上次读取位置 */
  int8_t * pcTail;
  int8_t * pcReadFrom;
} QueuePointers_t;

typedef struct SemaphoreData
{
  /* 存储持有互斥量的任务句柄和互斥量被获取的次数 */
  TaskHandle_t xMutexHolder;
  UBaseType_t uxRecursiveCallCount;
} SemaphoreData_t;
```
#### 1.2常用API
**①创建/删除队列**
>**概述**：常用`xQueueCreate()`创建队列，接口如下，需要设定**队列的长度**以及**数据项大小**
{%list%}
创建成功返回队列句柄，创建失败则返回NULL
{%endlist%}
{%warning%}
如果采用xQueueCreateStatic()，还需要传递作为消息缓冲区的数组和StaticQueue_t
{%endwarning%}
```c
/* 创建队列 */
QueueHandle_t xQueueCreate(
              UBaseType_t uxQueueLength,       //队列长度，即有多少个数据项
              UBaseType_t uxItemSize           //每个数据项的大小，以字节为单位
);
QueueHandle_t xQueueCreateStatic(
              UBaseType_t uxQueueLength,       //队列长度，即有多少个数据项
              UBaseType_t uxItemSize,          //每个数据项的大小，以字节为单位
              uint8_t *pucQueueStorageBuffer,  //队列所需的数组，必须指向一个uint8_t数组
              StaticQueue_t *pxQueueBuffer     //StaticQueue_t结构体，用来保存队列的数据结构
);
/* 删除队列 */
void          vQueueDelete( 
              QueueHandle_t xQueue             //队列句柄，指向要删除的队列
);
```
**②写/读队列**
>**概述**：常用`xQueueSend()`和`xQueueReceive()`，需要传递**队列句柄**、**数据/接收指针**和**阻塞时长**
{%list%}
写入/读取成功返回pdPASS，反之返回errQUEUE_FULL/errQUEUE_EMPTY
{%endlist%}
{%right%}
将阻塞时间设置为portMAX_DELAY，任务会一直阻塞直到有空间可写
{%endright%}
{%warning%}
如果需要在中断中读写队列，需要使用带FromISR的对应API，该API不会阻塞
{%endwarning%}
>`pxHigherPriorityTaskWoken`检查是否有**更高优先级的任务**被唤醒，有则需要进行**任务调度**

```c
/* 将数据写入到队列尾 */
BaseType_t xQueueSend(
           QueueHandle_t    xQueue,           //队列句柄，指向要写的队列
           const void       *pvItemToQueue,   //数据指针，指向要写入的数据
           TickType_t       xTicksToWait      //阻塞时长，单位为Tick Count
);
/* 将数据写入到队列头，会覆盖头部数据 */
BaseType_t xQueueSendToFront(
           QueueHandle_t    xQueue,           //队列句柄，指向要写的队列
           const void       *pvItemToQueue,   //数据指针，指向要写入的数据
           TickType_t       xTicksToWait      //阻塞时长，单位为Tick Count
);
/* 从队列头读取数据 */
BaseType_t xQueueReceive(
           QueueHandle_t    xQueue,           //队列句柄，指向要写的队列
           void *const      pvBuffer,         //接收指针，读出的数据会被存入该地址
           TickType_t       xTicksToWait      //阻塞时长，单位为Tick Count
);
/* 同上，但是在中断中使用 */
BaseType_t xQueueSendFromISR(
           QueueHandle_t    xQueue,
           const void       *pvItemToQueue,
           BaseType_t       *pxHigherPriorityTaskWoken
);
BaseType_t xQueueSendToBackFromISR(
           QueueHandle_t    xQueue,
           const void       *pvItemToQueue,
           BaseType_t       *pxHigherPriorityTaskWoken
);
BaseType_t xQueueReceiveFromISR(
           QueueHandle_t    xQueue,
           void             *pvBuffer,
           BaseType_t       *pxHigherPriorityTaskWoken
);
```
```c
void vMyISR(void)
{
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  uint8_t data;
  // 从队列中接收数据
  xQueueReceiveFromISR(myQueue, &data, &xHigherPriorityTaskWoken);
  // 如果xHigherPriorityTaskWoken变为true表示有更高优先级的任务被唤醒，需要进行任务调度
  portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}

```
**③队列集**
>**概述**：本质上是**队列项为队列句柄**的队列，将**队列**`A`、`B`加入**队列集**`S`，读取`S`就可以同时读取`A`、`B`的数据
{%list%}
若队列集S包含队列A、B，写队列A/B时，会顺便将A/B的句柄写入S
{%endlist%}
{%right%}
读取S时，会获取对应队列句柄，随后我们从对应队列读取数据
{%endright%}
{%warning%}
队列集的长度应该为添加的队列长度之和，只能从队列集中读取数据，不能向队列集写数据
{%endwarning%}
```c
/* 创建队列集 */
QueueSetHandle_t xQueueCreateSet( 
                 const UBaseType_t uxEventQueueLength       //队列集的长度
)
/* 将队列加入队列集合 */
BaseType_t       xQueueAddToSet(
                 QueueSetMemberHandle_t xQueueOrSemaphore,  //队列句柄，指向添加的队列
                 QueueSetHandle_t xQueueSet                 //队列集句柄，指向要添加的队列集
);
/* 读队列集 */
QueueSetMemberHandle_t xQueueSelectFromSet(
                 QueueSetHandle_t xQueueSet,               //队列集句柄，指向要读取的队列集
                 TickType_t const xTicksToWait             //阻塞时长，单位为Tick Count
);
```
**④其他API**
>**概述**：一些辅助API，如查看**可用数据**、**可用空间**等
```c
/* 队列复位 */
BaseType_t xQueueReset(
           QueueHandle_t    pxQueue,          //队列句柄，指向要复位的队列
);
/* 返回队列中可用数据的个数 */
UBaseType_t uxQueueMessagesWaiting( 
            const QueueHandle_t xQueue        //队列句柄，指向要查询的队列
);
/* 返回队列中可用空间的个数 */
UBaseType_t uxQueueSpacesAvailable( 
            const QueueHandle_t xQueue        //队列句柄，指向要查询的队列
);
/* 给队列上/解锁 */
void        prvLockQueue( 
            Queue_t * const pxQueue           //队列句柄，指向要上锁的队列
);
void        prvUnlockQueue( 
            Queue_t * const pxQueue           //队列句柄，指向要解锁的队列
);
```
**⑤示例**
>**概述**：**示例程序**如下，`vTask3`通过队列集读取`vTask1`和`vTask2`发送的数据
```c
#include <stdio.h>
#include "FreeRTOS.h"
#include "task.h"
#include "queue.h"

// 定义队列的长度和数据类型
#define QUEUE_LENGTH 5
#define ITEM_SIZE sizeof(int)

// 队列和队列集的句柄
QueueHandle_t xQueue1, xQueue2, xQueueSet;

// 任务函数
void vTask1(void *pvParameters) {
  int value = 0;

  while (1) {
    // 将数据发送到队列1
    if (xQueueSend(xQueue1, &value, portMAX_DELAY) == pdPASS) {
      printf("Task 1 sent %d to Queue 1\n", value);
      value++;
    }
    vTaskDelay(pdMS_TO_TICKS(1000)); // 延时1秒
  }
}
void vTask2(void *pvParameters) {
  int value = 100;

  while (1) {
  // 将数据发送到队列2
  if (xQueueSend(xQueue2, &value, portMAX_DELAY) == pdPASS) {
    printf("Task 2 sent %d to Queue 2\n", value);
    value--;
  }
  vTaskDelay(pdMS_TO_TICKS(1000)); // 延时1秒
  }
}

void vTask3(void *pvParameters) {
  int receive_val = 0;
  while(1) {
    //从队列集中获取队列句柄
    QueueHandle_t xQueue = NULL;
    xQueue = xQueueSelectFromSet(xQueueSet, portMAX_DELAY);
    //根据队列句柄从不同的队列中获取数据
    if (xQueue == xQueue1) {
      if (xQueueReceive(xQueue1, &receive_val, 0) == pdPASS) {
        printf("Received data %d from Task 1\n", receive_val);
      }
    } 
    else if (xQueue == xQueue2) {
      if (xQueueReceive(xQueue2, &receive_val, 0) == pdPASS) {
        printf("Received data %d from Task 2\n", receive_val);
      }
    }
  }
}

int main(void) {
  // 创建队列
  xQueue1 = xQueueCreate(QUEUE_LENGTH, ITEM_SIZE);
  xQueue2 = xQueueCreate(QUEUE_LENGTH, ITEM_SIZE);
  
  // 创建队列集
  xQueueSet = xQueueCreateSet(QUEUE_LENGTH * 2);

  // 将队列添加到队列集中
  xQueueAddToSet(xQueue1, xQueueSet);
  xQueueAddToSet(xQueue2, xQueueSet);

  // 创建任务
  xTaskCreate(vTask1, "Task 1", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  xTaskCreate(vTask2, "Task 2", configMINIMAL_STACK_SIZE, NULL, 2, NULL);
  xTaskCreate(vTask3, "Task 3", configMINIMAL_STACK_SIZE, NULL, 1, NULL);

  // 启动调度器
  vTaskStartScheduler();

  // 程序不应该运行到这里
  for (;;);
  return 0;
}
```
### 2.信号量
#### 2.1引言
**①简介**
>**概述**：一般用于**资源管理**和**任务同步**，可分为**计数型信号量**和**互斥信号量**
{%list%}
资源管理场景下信号量相当于一个上锁机制，任务同步场景下信号量相当于一个通知
{%endlist%}
{%right%}
在中断服务函数中不做具体的处理，而是释放信号量唤醒对应的处理任务，从而简化中断处理函数
{%endright%}

**②计数型信号量**
>**概述**：有一个**最大值**`Max`和**初始值**`Init`，当其被**释放**时信号量的值**加一**，被**获取**时**减一**
{%list%}
只有当信号量的值大于0才能被获取，小于最大值才能被释放，当Max为1，Init为0时，也称为二值信号量
{%endlist%}
{%right%}
计数型信号量本质上是一个有Max个队列项且队列项长度为0的特殊队列，释放/获取信号量就是写/读该队列
{%endright%}
>所以当**多个任务**阻塞在**同一个信号量**上时，**优先级最高**的任务优先**获取信号量**
{%warning%}
⼆值信号量可能导致优先级反转，即高优先级任务试图获取一个被低优先级任务占有的信号量时无法正常投入运行
{%endwarning%}
**③互斥信号量**
>**概述**：拥有**优先级继承**的二值信号量，可以有效解决**优先级反转**的问题
{%list%}
当高优先级任务试图获取一个被低优先级任务占用的互斥信号量时，将低优先级任务提升到和自己相同的优先级
{%endlist%}
>当低优先级任务**释放互斥信号量**后，**恢复**到自己的优先级
{%right%}
二值信号量更适用于同步场景，互斥信号量更适用于互斥场景
{%endright%}
{%warning%}
优先级继承并不能完全的消除优先级翻转，硬实时应⽤应该在设计之初就要避免优先级翻转的发⽣
{%endwarning%}
{%wrong%}
由于其优先级继承机制且可能导致阻塞，互斥信号量不能⽤于中断服务函数中
{%endwrong%}

#### 2.2常用API
**①创建与删除**
>**概述**：各种信号量的**创建API**不同，创建成功/失败返回其**句柄**/`NULL`，**删除API**均为`vSemaphoreDelete()`
```c
/* 二值信号量，被创建时初始值为0 */
SemaphoreHandle_t xSemaphoreCreateBinary( void );
SemaphoreHandle_t xSemaphoreCreateBinaryStatic(
                  StaticSemaphore_t *pxSemaphoreBuffer   //传递的StaticSemaphore_t
);
/* 计数型信号量 */
SemaphoreHandle_t xSemaphoreCreateCounting(
                  UBaseType_t uxMaxCount,                //计数型信号量的最大值Max
                  UBaseType_t uxInitialCount             //计数型信号量的初始值Init
);
SemaphoreHandle_t xSemaphoreCreateCountingStatic(
                  UBaseType_t uxMaxCount,                //计数型信号量的最大值Max
                  UBaseType_t uxInitialCount,            //计数型信号量的初始值Init
                  StaticSemaphore_t *pxSemaphoreBuffer   //传递的StaticSemaphore_t
);
/* 互斥信号量 */
SemaphoreHandle_t xSemaphoreCreateMutex( void );
SemaphoreHandle_t xSemaphoreCreateMutexStatic( 
                  StaticSemaphore_t *pxMutexBuffer       //传递的StaticSemaphore_t
);
/* 信号量删除 */
void vSemaphoreDelete( SemaphoreHandle_t xSemaphore );
```
**②获取与释放**
>**概述**：不同信号量的**释放与获取API**均为`xSemaphoreGive()`和`xSemaphoreTake()`
```c
/* 任务中的释放与获取 */
BaseType_t xSemaphoreGive( 
           SemaphoreHandle_t xSemaphore                  //释放的信号量
);
BaseType_t xSemaphoreTake(
           SemaphoreHandle_t xSemaphore,                 //试图获取的信号量
           TickType_t xTicksToWait                       //无法获取时，阻塞的时长
);
/* 中断中的释放与获取 */
BaseType_t xSemaphoreGiveFromISR(
           SemaphoreHandle_t xSemaphore,                 //释放的信号量
           BaseType_t *pxHigherPriorityTaskWoken
);
BaseType_t xSemaphoreTakeFromISR(
           SemaphoreHandle_t xSemaphore,                 //试图获取的信号量
           BaseType_t *pxHigherPriorityTaskWoken
);
```
**③示例程序**
>**概述**：`vTask1`不断**获取信号量**，当**中断**触发后**释放该信号量**唤醒`vTask1`
```c
#include <stdio.h>
#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"
// 定义信号量
SemaphoreHandle_t xBinarySemaphore;
// 任务函数
void vTask1(void *pvParameters) {
  while (1) {
    // 等待获取信号量
    if (xSemaphoreTake(xBinarySemaphore, portMAX_DELAY) == pdTRUE) {
      // 获取到信号量后执行的操作
      printf("Task got the semaphore!\n");
      // 模拟处理时间
      vTaskDelay(pdMS_TO_TICKS(1000));
    }
  }
}
// 中断处理函数
void vKeyPressInterruptHandler(void) {
  // 释放信号量
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(xBinarySemaphore, &xHigherPriorityTaskWoken);

  // 如果释放信号量后唤醒了高优先级任务，则请求上下文切换
  portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}
// 主函数
int main(void) {
  // 创建二进制信号量
  xBinarySemaphore = xSemaphoreCreateBinary();
  // 创建任务
  xTaskCreate(vTask1, "Task", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  // 启动调度器
  vTaskStartScheduler();
  // 程序不应运行到这里
  for (;;);
  return 0;
}
```
### 3.事件组和任务通知
#### 3.1引言
**①事件组**
>**概述**：用于某个任务和**多个任务**进行同步，由结构`EventGroup_t`表示，代码如下
{%list%}
所有事件都存储在uxEventBits中，每个事件对应一个位，事件发生时该位置一
{%endlist%}
>`configUSE_16_BIT_TICKS`宏为`1`时，`uxEventBits`为**16位**，可以存储**8个事件**，反之为**32位**，可以存储**24个事件**
{%right%}
其中的高8位留给内核使用
{%endright%}
```c
typedef struct EventGroupDef_t
{
  EventBits_t uxEventBits;      //本质上是一个整数，其中有n位每位代表一个事件
  List_t xTasksWaitingForBits;  //等待事件的任务列表
  /* 条件编译成员，略 */
} EventGroup_t;
```
**②任务通知**
>**概述**：直接发送数据一个**具体的任务**，需要将宏`configUSE_TASK_NOTIFICATIONS`设置为`1`
{%list%}
使用任务通知时，任务结构体TCB_t中有对应成员，用于接收任务通知
{%endlist%}
>`ulNotifiedValue`表示**通知值**，`ucNotifyState`表示**通知状态**
{%right%}
使用任务通知来发送数据给某个任务时，效率更高，且无需创建对应的结构体，节省内存
{%endright%}
>根据**通知值**的使用方法不同，任务通知可以起到**不同的作用**
{%warning%}
不能使用任务通知发送数据给ISR，因为ISR没有TCB_t，但是ISR可以使用任务通知发数据给任务
{%endwarning%}
```c
typedef struct tskTaskControlBlock
{
  ......
  /* configTASK_NOTIFICATION_ARRAY_ENTRIES = 1 */
  volatile uint32_t ulNotifiedValue[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];
  volatile uint8_t ucNotifyState[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];
  ......
} tskTCB;
```
```c
/* 通知状态 */
#define taskNOT_WAITING_NOTIFICATION              ( ( uint8_t ) 0 )   //没有等待通知
#define taskWAITING_NOTIFICATION                  ( ( uint8_t ) 1 )   //正在等待通知
#define taskNOTIFICATION_RECEIVED                 ( ( uint8_t ) 2 )   //接收到了通知
```
#### 3.2事件组常用API
**①创建与删除**
>**概述**：在使用事件组时，需要先**创建事件组**，使用完毕后**删除事件组**以回收内存
```c
/* 创建事件组 */
EventGroupHandle_t xEventGroupCreate( void );
EventGroupHandle_t xEventGroupCreateStatic( 
                   StaticEventGroup_t * pxEventGroupBuffer   //保存事件组句柄的静态变量
);
/* 删除事件组 */
void               vEventGroupDelete( 
                   EventGroupHandle_t xEventGroup            //事件组句柄，指向要删除的事件组
)
```
**②设置事件**
>**概述**：设置事件组的**某些位**，将**某些事件位置1时**可能会**唤醒**对应的任务
{%list%}
uxBitsToSet的哪些位为1，事件组的对应位会被设置，如0x15表示设置bit4、bit2和bit0
{%endlist%}
{%right%}
中断情景下的函数不是直接去设置事件组，而是给后台任务daemon task发送队列数据，由这个任务来设置事件组
{%endright%}
>事件组可能导致**多个任务被唤醒**，导致**不确定性**
```c
/* 任务中设置事件组 */
EventBits_t        xEventGroupSetBits( 
                   EventGroupHandle_t xEventGroup,           //事件组句柄，指向要设置的事件组
                   const EventBits_t uxBitsToSet             //需要将哪些位置为1
);
EventBits_t        xEventGroupClearBits( 
                   EventGroupHandle_t xEventGroup,           //事件组句柄，指向要设置的事件组
                   const EventBits_t uxBitsToSet             //需要清除哪些位
);
/* 中断中设置事件组 */
BaseType_t         xEventGroupSetBitsFromISR( 
                   EventGroupHandle_t xEventGroup,
									 const EventBits_t uxBitsToSet,
									 BaseType_t * pxHigherPriorityTaskWoken
);
BaseType_t         xEventGroupClearBitsFromISR( 
                   EventGroupHandle_t xEventGroup,
									 const EventBits_t uxBitsToSet,
									 BaseType_t * pxHigherPriorityTaskWoken
);
```
**③等待事件**
>**概述**：任务**等待某些事件**，在这些**事件发生之前**，可以选择**阻塞**
{%warning%}
在等待到某些事件后再使用xEventGroupClearBits()清除对应位，但是在这期间事件组可能会被其他任务和中断修改
{%endwarning%}
{%right%}
设置xClearOnExit为pdTRUE，对事件组的测试、清零都在xEventGroupWaitBits()函数内部完成，是一个原子操作
{%endright%}
>`xEventGroupSync()`同理，对事件组的**测试与设置**是一个**原子操作**
```c
/* 等待某些事件，可以选择等待某些事件中的一个，且在等待到对应时间后清除对应事件位 */
EventBits_t        xEventGroupWaitBits(
                   EventGroupHandle_t xEventGroup,          //事件组句柄，指向要等待的事件组
                   const EventBits_t uxBitsToWaitFor,       //等待哪些位（事件）
                   const BaseType_t xClearOnExit,           //等待到后是否需要清除对应位
                   const BaseType_t xWaitForAllBits,        //若为pdTRUE，则需要对应位全部为1，若为pdFALSE，对应位有一个为1即可
                   TickType_t xTicksToWait                  //如果期待的事件未发生，阻塞多久
);
/* 等待某些事件，并在对应事件发生后设置事件组 */
EventBits_t        xEventGroupSync(
                   EventGroupHandle_t xEventGroup,          //事件组句柄，指向要等待的事件组
                   const EventBits_t uxBitsToSet,           //需要将哪些位置为1
                   const EventBits_t uxBitsToWaitFor,       //等待哪些位（事件），这些事件必须全都发生
                   TickType_t xTicksToWait                  //如果期待的事件未发生，阻塞多久
);
```
**④示例**
>**概述**：`vTask1`设置`bit0`，`vTask2`等待`bit0`并设置`bit1`，`vTask3`等待`bit1`
```c
#include <stdio.h>
#include "FreeRTOS.h"
#include "task.h"
#include "event_groups.h"
// 创建事件组句柄
EventGroupHandle_t xEventGroup;
// 事件标志位
#define BIT_0 (1 << 0)
#define BIT_1 (1 << 1)
// 任务1：设置 BIT0
void vTask1(void *pvParameters) {
  while (1) {
    // 设置 BIT0
    printf("Task 1: Setting BIT_0\n");
    xEventGroupSetBits(xEventGroup, BIT_0);
    
    // 模拟处理时间
    vTaskDelay(pdMS_TO_TICKS(1000)); 
  }
}
// 任务2：等待 BIT0 并设置 BIT1
void vTask2(void *pvParameters) {
  while (1) {
    // 等待 BIT0 被设置，并设置 BIT_1
    xEventGroupSync(xEventGroup, BIT_1, BIT_0, portMAX_DELAY);
    printf("Task 2: BIT_0 received, setting BIT_1\n");
  }
}
// 任务3：等待 BIT1
void vTask3(void *pvParameters) {
  while (1) {
    // 等待 BIT1 被设置
    xEventGroupWaitBits(xEventGroup, BIT_1, pdTRUE, pdFALSE, portMAX_DELAY);
    printf("Task 3: BIT_1 received\n");
  }
}
// 主函数
int main(void) {
  // 创建事件组
  xEventGroup = xEventGroupCreate();
  // 创建任务
  xTaskCreate(vTask1, "Task 1", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  xTaskCreate(vTask2, "Task 2", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  xTaskCreate(vTask3, "Task 3", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  // 启动调度器
  vTaskStartScheduler();
  // 程序不应运行到这里
  for (;;);
  return 0;
}
```
#### 3.3任务通知常用API
**①简化版**
>**概述**：**增加/减少**通知值，相当于轻量级的**计数型信号量**
{%list%}
通知状态初始为taskNOT_WAITING_NOTIFICATION，简称为0，其余类似
{%endlist%}
>当**通知状态**为`0`时，`ulTaskNotifyTake()`/`xTaskNotifyGive()`会将其修改为`1`/`2`

>当**通知状态**为`1`时，`ulTaskNotifyTake()`/`xTaskNotifyGive()`会将其修改为`1`/`0`

>当**通知状态**为`2`时，`ulTaskNotifyTake()`/`xTaskNotifyGive()`会将其修改为`0`/`2`
```c
/* 发出通知，使得通知值加一 */
BaseType_t xTaskNotifyGive(
           TaskHandle_t xTaskToNotify             //任务句柄，指向通知的任务
);
/* 取出通知，使得通知值减一 */
uint32_t   ulTaskNotifyTake( 
           BaseType_t xClearCountOnExit,          //pdTRUE：把通知值清零，pdFALSE：如果通知值大于0，则把通知值减一
           TickType_t xTicksToWait                //如果通知值为0，阻塞多久
);

void       vTaskNotifyGiveFromISR(
           TaskHandle_t xTaskHandle,              //任务句柄，指向通知的任务
           BaseType_t *pxHigherPriorityTaskWoken
);
```
**②专业版**
>**概述**：可以使用**不同参数**实现各类功能，如**设置通知值的某些位**、将**通知值修改为新值**等
{%right%}
实现轻量级的队列、邮箱、计数型信号量、二进制信号量和事件组
{%endright%}
```c
/* 发出通知
   当eAction为eNoAction，表示仅仅将通知状态为"pending"，不使用ulValue
   当eAction为eSetBits，通知值 = 原来的通知值 | ulValue
   当eAction为eIncrement，通知值 = 原来的通知值 + 1，不使用ulValue
   当eAction为eSetValueWithoutOverwrite，如果通知状态为taskNOTIFICATION_RECEIVED ，不做任何事，返回pdFAIL，反之将通知值修改ulValue
   当eAction为eSetValueWithOverwrite，无论通知状态如何，将通知值修改ulValue
 */
BaseType_t xTaskNotify( 
           TaskHandle_t xTaskToNotify,            //任务句柄，指向通知的任务
           uint32_t ulValue,                      //根据eAction决定该值的意义
           eNotifyAction eAction
);
/* 取出通知 */
BaseType_t xTaskNotifyWait( 
           uint32_t ulBitsToClearOnEntry,         // 通知状态不为taskNOTIFICATION_RECEIVED时，在函数入口处清除哪些位  
           uint32_t ulBitsToClearOnExit,          //倘若该函数是因为接收到数据而不是超时退出时，清除哪些位
           uint32_t *pulNotificationValue,        //用于接收ulBitsToClearOnExit清除前的通知值
           TickType_t xTicksToWait                //等待通知状态变为"pending"的阻塞时间
);
/* 在中断中发出通知 */
BaseType_t xTaskNotifyFromISR(
           TaskHandle_t xTaskToNotify,            
           uint32_t ulValue, 
           eNotifyAction eAction, 
           BaseType_t *pxHigherPriorityTaskWoken
);
```
**③示例**
>**概述**：`vTaskToNotify`每隔一秒发送一个数字给`vTaskToReceive`，并进行**覆盖**，起到**轻量级邮箱**的功能
```c
#include <FreeRTOS.h>
#include <task.h>
#include <stdio.h>
// 任务句柄
TaskHandle_t xTaskToNotifyHandle = NULL;

// 发送任务
void vTaskToNotify(void *pvParameters) {
  uint32_t count；
  while(1) {
    // 模拟一些处理
    vTaskDelay(pdMS_TO_TICKS(1000));  // 延迟1秒
    // 发送任务通知
    xTaskNotify(xTaskToNotifyHandle, count, eSetValueWithOverwrite);
    printf("通知已发送\n");
  }
}

// 接收任务
void vTaskToReceive(void *pvParameters) {
  uint32_t ulNotificationValue;
  while(1){
    // 等待接收通知
    if (xTaskNotifyWait(0, 0, &ulNotificationValue, portMAX_DELAY) == pdTRUE) {
      printf("接收到通知，值为: %d\n", ulNotificationValue);
    }
  }
}

int main(void) {
  // 创建接收任务
  xTaskCreate(vTaskToReceive, "ReceiveTask", 1000, NULL, 1, &xTaskToNotifyHandle);
  // 创建发送任务
  xTaskCreate(vTaskToNotify, "NotifyTask", 1000, NULL, 1, NULL);
  // 启动调度器
  vTaskStartScheduler();
  // 如果一切正常，程序不会到达这里
  for (;;);
  return 0;
}
```



















