---
title: Freertos入门（二）
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
summary: 任务调度
---
# Freertos
## Freertos入门（二）
### 1.任务管理
#### 1.1引言
**①状态和优先级**
>**概述**：任务状态分别有**运行态**、**就绪态**、**阻塞态**和**挂起态**，每个任务都有优先级，**数值越高**，**优先级越高**
{%list%}
当一个任务调用了vTaskDelay()或者在等待队列、信号量、事件组、通知或互斥信号量时会进入阻塞态
{%endlist%}
{%right%}
每个任务都会分配一个0~(configMAX_PRIORITIES-1)的优先级，configMAX_PRIORITIES在FreeRTOSConfig.h定义
{%endright%}
>如果需要多个任务**共⽤⼀个优先级**，需要将宏`configUSE_TIME_SLICING`定义为1
{%warning%}
configMAX_PRIORITIES不要太大，否则会占用较多内存，且任务调度效率也会变低
{%endwarning%}
>如果`configMAX_PRIORITIES`**小于32**，就可以采用**汇编指令**快速找到**最高的优先级**

![任务状态](/image/Freertos_2.png)
**②任务函数模板**
>**概述**：`Freertos`官方给出的**任务函数模板**如下，主体为一个**死循环**
{%right%}
任务函数最好在循环一次后调用vTaskDelay()或其他方式使得自己进入阻塞态，防止其一直占用CPU
{%endright%}
{%warning%}
任务函数返回值必须是void，且参数必须是void指针类型
{%endwarning%}
{%wrong%}
任务函数永远都不能退出，或者在退出时调用vTaskDelete(NULL)删除此任务
{%endwrong%}
>**创建任务时**会**伪造**`lr`寄存器，将**返回地址**设置为`prvTaskExitError`，导致**中断关闭**并进入**死循环**

```c
void vATaskFunction(void *pvParameters){
  /* 一些前置工作，如变量定义 */
  int32_t lVariableExample = 0;
  while(1){
    /* 任务代码 */
    /* 每次循环都将自己阻塞一会，防止一直占用CPU */
    vTaskDelay();
  }
  vTaskDelete(NULL);
}
```
```c
static void prvTaskExitError( void )
{
  configASSERT( uxCriticalNesting == ~0UL );
  portDISABLE_INTERRUPTS();
  for( ; ; )
  {
  }
}
```
**③任务控制块**
>**概述**：每个任务将其**自身信息**存储在**任务控制块**`TCB_t`中，并使用**相关列表**对其进行管理
{%list%}
在没有补丁的情况下，FreeRTOS中的任务共享CPU资源，即并发的线程
{%endlist%}
{%right%}
pxCurrentTCB指向运行态任务TCB_t，其余状态任务TCB_t存储在对应列表中
{%endright%}
```c
/* task.c文件 */
typedef struct tskTaskControlBlock
{
  volatile StackType_t * pxTopOfStack;        //指向任务栈顶部的指针
  ListItem_t xStateListItem;                  //状态列表项
  ListItem_t xEventListItem;                  //事件列表项
  UBaseType_t uxPriority;                     //任务优先级
  StackType_t * pxStack;                      //指向任务栈的起始位置的指针
  char pcTaskName[ configMAX_TASK_NAME_LEN ]; //任务的描述名称
  /* 还有一些需要对应宏开关被定义才定义的成员 */
} tskTCB;
typedef tskTCB TCB_t;
```
```c
/* task.c文件 */
/* 指向当前运行任务 */
portDONT_DISCARD PRIVILEGED_DATA TCB_t * volatile pxCurrentTCB = NULL;
/* 存储所有优先级的就绪列表的数组 */
PRIVILEGED_DATA static List_t pxReadyTasksLists[ configMAX_PRIORITIES ]; 
/* 存储延迟任务的列表 */
PRIVILEGED_DATA static List_t xDelayedTaskList1;
PRIVILEGED_DATA static List_t xDelayedTaskList2; 
PRIVILEGED_DATA static List_t * volatile pxDelayedTaskList;
PRIVILEGED_DATA static List_t * volatile pxOverflowDelayedTaskList; 
/* 存储阻塞任务的列表 */
PRIVILEGED_DATA static List_t xPendingReadyList;
```
#### 1.2相关API
**①任务创建/删除**
>**概述**：**函数原型**如下，通常采用`xTaskCreate()`创建任务，**创建成功**返回`pdPASS`
{%list%}
任务句柄本质上是任务控制块的指针，用于管理任务，类似的，其他句柄也是对应管理结构的指针
{%endlist%}
{%right%}
当需要向任务传递多个参数时，通常采用结构体传递，栈的大小先分配一个较大的，运行后查看反汇编再修改
{%endright%}
{%warning%}
如果要使用静态分配的API，不仅要提供对应的缓冲区，还需要将宏configSUPPORT_STATIC_ALLOCATION置为1
{%endwarning%}
```c
/* task.h文件 */
typedef struct tskTaskControlBlock * TaskHandle_t;
```
```c
/* task.c文件 */
BaseType_t   xTaskCreate( 
             TaskFunction_t pxTaskCode,                 // 函数指针, 任务函数
             const char * const pcName,                 // 任务的名字，仅用于调试目的
             const configSTACK_DEPTH_TYPE usStackDepth, // 栈大小，单位为word，10表示40字节
             void * const pvParameters,                 // 调用任务函数时传入的参数
             UBaseType_t uxPriority,                    // 优先级
             TaskHandle_t * const pxCreatedTask         // 任务句柄, 以后使用它来操作这个任务
); 
TaskHandle_t xTaskCreateStatic ( 
             TaskFunction_t pxTaskCode,                 // 函数指针, 任务函数
             const char * const pcName,                 // 任务的名字，仅用于调试目的
             const uint32_t ulStackDepth,               // 栈大小,单位为word,10表示40字节
             void * const pvParameters,                 // 调用任务函数时传入的参数
             UBaseType_t uxPriority,                    // 优先级
             StackType_t * const puxStackBuffer,        // 静态分配的栈，就是一个buffer
             StaticTask_t * const pxTaskBuffer          // 静态分配的任务结构体的指针，用来操作任务
);
void         vTaskDelete( 
             TaskHandle_t xTaskToDelete                 //删除对应任务，也可传入NULL，表示删除自己
);
```
**②任务挂起/阻塞**
>**概述**：**函数原型**如下，任务**挂起**后，只有调用**恢复函数**才能回到**就绪态**，任务**阻塞**后，**一定时间后**回到**就绪态**
{%list%}
由函数接口可知，任务只能在运行态时将自己变为阻塞态
{%endlist%}
{%right%}
可以使用pdMS_TO_TICKS宏把ms转换为tick，如vTaskDelay(pdMS_TO_TICKS(100))阻塞100ms
{%endright%}
{%warning%}
在中断上下文中挂起函数需要使用xTaskResumeFromISR()
{%endwarning%}
```c
/* 任务挂起 */
void       vTaskSuspend( 
           TaskHandle_t xTaskToSuspend            //挂起对应任务，也可传入NULL，表示挂起自己
);
void       vTaskResume( 
           TaskHandle_t xTaskToSuspend            //恢复对应任务，在任务上下文中调用
);
BaseType_t xTaskResumeFromISR( 
           TaskHandle_t xTaskToResume             //恢复对应任务，在中断上下文中调用
);
/* 任务阻塞 */
void       vTaskDelay( 
           const TickType_t xTicksToDelay         //阻塞的tick数
);
BaseType_t xTaskDelayUntil( 
           TickType_t * const pxPreviousWakeTime, //上一次被唤醒的时间
           const TickType_t xTimeIncrement        //阻塞到pxPreviousWakeTime+xTimeIncrement
);
```
**③程序模板**
>**概述**：基本的`FreeRTOS`程序模板如下，包含**初始化**、**任务创建**和**启动调度器**等常见步骤
{%list%}
通常会给每个任务创建对应的任务句柄，便于管理任务
{%endlist%}
{%warning%}
调度器一旦启动，通常情况下不会返回
{%endwarning%}
```c
#include <FreeRTOS.h>
#include <task.h>
#include <stdio.h>

// 定义任务句柄
TaskHandle_t xTask1Handle = NULL;
TaskHandle_t xTask2Handle = NULL;
// 任务1的实现
void vTask1(void *pvParameters) {
  int i = 0;
  while(1) {
    i++;
    printf("Task 1 is running.\n");
    if(i == 10000){
      vTaskSuspend(NULL);
    }
    vTaskDelay(pdMS_TO_TICKS(500)); // 延迟0.5秒
  }
}
// 任务2的实现
void vTask2(void *pvParameters) {
  int i = 0;
  while(1) {
    i++;
    printf("Task 2 is running.\n");
    if(i == 10000){
      vTaskResume(xTask1Handle);
      vTaskDelete(NULL);
    }
    vTaskDelay(pdMS_TO_TICKS(500)); // 延迟0.5秒
  }
}
int main(void) {
  // 初始化硬件（例如，串口、GPIO等）
  // HardwareInit();
  // 创建任务
  xTaskCreate(vTask1, "Task 1", 128, NULL, 1, &xTask1Handle);
  xTaskCreate(vTask2, "Task 2", 128, NULL, 1, &xTask2Handle);
  // 启动调度器
  vTaskStartScheduler();
  // 如果调度器启动成功，程序将不会返回到这里
  for (;;) {
      // 循环以防止程序终止
  }
  return 0;
}
```
#### 1.3空闲任务
**①简介**
>**概述**：**启动调度器时**自动创建的任务，通常负责释放**删除自身任务**的**控制块**和**堆栈**
{%list%}
一个良好的程序，其中的任务都是事件驱动的，即大部分时间处于阻塞状态，当没有任务运行时就运行空闲任务
{%endlist%}
{%right%}
空闲任务的优先级为0，且永远不会阻塞
{%endright%}
{%warning%}
如果使用vTaskDelete()来删除任务，就要确保空闲任务有机会执行，否则就无法释放被删除任务的内存
{%endwarning%}
```c
static portTASK_FUNCTION( prvIdleTask, pvParameters )
{
  ( void ) pvParameters;
  /* 分配安全上下文 */
  portALLOCATE_SECURE_CONTEXT( configMINIMAL_SECURE_STACK_SIZE );
  for( ; ; )
  {
    /* 检查是否有任务被删除 */
    prvCheckTasksWaitingTermination();
    /* 如果未使用抢占，空闲任务会强制切换到其他任务 */
    #if ( configUSE_PREEMPTION == 0 )
    {
      taskYIELD();
    }
    #endif 
    /* 如果使用抢占，会判断是否有更高优先级的任务并进行任务切换 */
    #if ( ( configUSE_PREEMPTION == 1 ) && ( configIDLE_SHOULD_YIELD == 1 ) )
    {
      if( listCURRENT_LIST_LENGTH( &( pxReadyTasksLists[ tskIDLE_PRIORITY ] ) ) > ( UBaseType_t ) 1 )
      {
          taskYIELD();
      }
      else
      {
          mtCOVERAGE_TEST_MARKER();
      }
    }
    #endif
    /* 如果定义了configUSE_IDLE_HOOK，则会运行用户定义的钩子函数 */
    #if ( configUSE_IDLE_HOOK == 1 )
    {
      extern void vApplicationIdleHook( void );
      vApplicationIdleHook();
    }
    #endif 

    /* 低功耗模式，会检查预期的空闲时间，并决定是否进入低功耗状态，通常不用，略 */
  }
}
```
```c
static void prvCheckTasksWaitingTermination( void )
{
  #if ( INCLUDE_vTaskDelete == 1 )
  {
    TCB_t * pxTCB;
    /* 当有待清理的已删除任务时 */
    while( uxDeletedTasksWaitingCleanUp > ( UBaseType_t ) 0U )
    {
      /* 进入临界区，获取已删除任务的pxTCB */
      taskENTER_CRITICAL();
      {
        pxTCB = listGET_OWNER_OF_HEAD_ENTRY( ( &xTasksWaitingTermination ) );
        ( void ) uxListRemove( &( pxTCB->xStateListItem ) );
        --uxCurrentNumberOfTasks;
        --uxDeletedTasksWaitingCleanUp;
      }
      /* 退出临界区 */
      taskEXIT_CRITICAL();
      /* 释放资源 */
      prvDeleteTCB( pxTCB );
    }
  }
  #endif
}
```
**②钩子函数**
>**概述**：如上，若定义了`configUSE_IDLE_HOOK`，空闲任务还会运行**用户自定义的函数**`vApplicationIdleHook()`
{%list%}
如果需要使用vTaskDelete()来删除任务，钩子函数要非常高效地执行
{%endlist%}
{%right%}
类似的，时钟中断、内存申请失败以及定时器服务任务都有对应的钩子函数，需要打开对应的宏
{%endright%}
{%warning%}
钩子函数不能导致空闲任务进入阻塞状态、暂停状态
{%endwarning%}
```c
/* 示例 */
#include <FreeRTOS.h>
#include <task.h>
#include <stdio.h>

// 空闲钩子函数的定义
void vApplicationIdleHook(void) {
    static uint32_t idleCounter = 0;
    idleCounter++;
    if (idleCounter % 1000 == 0) {
        printf("Idle hook is running.\n");
    }
    // 在这里可以执行低功耗模式
    // vLowPowerMode();
}

int main(void) {
  /* 同上 */
}
```
### 2.任务调度
#### 2.1引言
**①时钟中断**
>**概述**：由**硬件定时器**生成的中断信号，每隔一段时间触发**时钟中断处理函数**，代码如下
{%list%}
由源码可知，每次时钟中断都会触发一次任务切换，本质上是触发PendSV中断
{%endlist%}
{%right%}
时钟中断的优先级通常都很低，所以在执行时钟中断处理函数时需要提高其优先级防止被其他中断打断
{%endright%}
```c
void xPortSysTickHandler( void )
{
  /* 提高时钟中断的中断优先级，防止其被其他中断打断 */
  vPortRaiseBASEPRI();
  {
    /* 递增滴答计数器 */
    if( xTaskIncrementTick() != pdFALSE )
    {
      /* 设置portNVIC_INT_CTRL_REG，请求进行任务切换 */
      portNVIC_INT_CTRL_REG = portNVIC_PENDSVSET_BIT;
    }
  }
  /* 恢复时钟中断的优先级 */
  vPortClearBASEPRIFromISR();
}
```
**②PendSV中断**
>**概述**：`ARM Cortex-M`系列处理器中的一种中断，用于请求**上下文切换**，其**中断处理函数**如下
{%list%}
ARM架构中，MSP寄存器指向主栈的顶部，PSP指向线程栈即当前任务的栈的顶部
{%endlist%}
>**任务上下文**中`SP`代表`PSP`，**中断上下文**中`SP`代表`MSP`
{%right%}
将r4-r11压入线程栈/从线程栈弹出，即保存/恢复现场，将r3和r14保存到主栈/从主栈弹出，用于任务切换
{%endright%}
>`r3`保存的是`pxCurrentTCB`的地址，在调用`vTaskSwitchContext()`后，`r3`中为**新任务**的**TCB指针的地址**
{%warning%}
保存/恢复现场后，还需要更新TCB_t中的栈顶指针，在调用函数vTaskSwitchContext前/后要屏蔽/恢复中断
{%endwarning%}
```c
__asm void xPortPendSVHandler( void )
{
  extern uxCriticalNesting;
  extern pxCurrentTCB;
  extern vTaskSwitchContext;
  /* 确保使用的寄存器在调用时保持对齐 */
  PRESERVE8
  /* 将线程栈顶指针读入r0 */
  mrs r0, psp
  isb
  /* 将pxCurrentTCB的地址读取到r3 */
  ldr r3, =pxCurrentTCB
  /* 将当前任务的TCB地址读取到r2 */
  ldr r2, [ r3 ]
  /* 将寄存器r4到r11的值压入当前任务的栈中，即保存上下文，并更新r0 */
  stmdb r0 !, { r4 - r11 } 
  /* 将新的栈顶指针保存到TCB中 */
  str r0, [ r2 ] 
  /* 将r3和r14压入中断栈中 */
  /* r3为变量pxCurrentTCB的地址，r14为链接寄存器，存储中断返回地址 */
  stmdb sp !, { r3, r14 }
  /* 屏蔽所有中断 */
  mov r0, #configMAX_SYSCALL_INTERRUPT_PRIORITY
  msr basepri, r0
  dsb
  isb
  /* 调用函数vTaskSwitchContext决定下一个要运行的任务，并使能响应中断 */
  bl vTaskSwitchContext
  mov r0, #0
  msr basepri, r0
  /* 弹出r3，r14，此时r3为新任务的TCB指针的地址 */
  ldmia sp !, { r3, r14 }
  /* 将切换后任务的TCB地址读入r1，并将切换后任务的栈地址读入r0 */
  ldr r1, [ r3 ]
  ldr r0, [ r1 ] 
  /* 恢复现场，设置栈指针，最后跳转运行 */
  ldmia r0 !, { r4 - r11 } 
  msr psp, r0
  isb
  bx r14
  nop
}
```
**③调度配置**
>**概述**：通过配置`FreeRTOSConfig.h`中的`configUSE_PREEMPTION`和`configUSE_TIME_SLICING`控制**调度规则**
{%list%}
configUSE_PREEMPTION为抢占模式的开关，configUSE_TIME_SLICING为轮转模式的开关
{%endlist%}
>**抢占**：**高优先级任务**就绪后可以**打断低优先级任务**立马执行，反之只能等待其**主动CPU**

>**轮转**：**同优先级**的任务**轮流执行**，每次执行**一个时间片**，否则只能等待当前任务**被抢占**或者**主动放弃CPU**
{%warning%}
只有设置了抢占才能设置轮转，通常这两种模式都打开，否则优先级无意义
{%endwarning%}
{%right%}
在抢占+轮转的前提下，还可以进一步设置configIDLE_SHOULD_YIELD，决定空闲任务是否让步于用户任务，
{%endright%}

#### 2.2调度器
**①启动**
>**概述**：由**程序模板**可知，**主函数**创建任务后会调用`vTaskStartScheduler()`启动调度器
{%list%}
创建空闲任务和定时器任务，并配置PendSV和SysTick中断，最后启动第一个用户任务
{%endlist%}
{%right%}
PendSV和SysTick中断优先级都很低，防止其抢占其他中断
{%endright%}
```c
void vTaskStartScheduler( void )
{
  BaseType_t xReturn;
  /* 默认采用动态分配，这里只看动态分配的逻辑 */
  /* 创建空闲任务，优先级最低 */
  xReturn = xTaskCreate( prvIdleTask,
                        configIDLE_TASK_NAME,
                        configMINIMAL_STACK_SIZE,
                        ( void * ) NULL,
                        portPRIVILEGE_BIT,  
                        &xIdleTaskHandle ); 
  /* 如果启动了定时器，则会创建一个定时器任务，用于管理软件定时器 */
  #if ( configUSE_TIMERS == 1 )
  {
    if( xReturn == pdPASS )
    {
      xReturn = xTimerCreateTimerTask();
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }
  }
  #endif 

  if( xReturn == pdPASS )
  {
    /* 调用用户自定义的初始化函数 */
    #ifdef FREERTOS_TASKS_C_ADDITIONS_INIT
    {
      freertos_tasks_c_additions_init();
    }
    #endif
    /* 禁用中断，并初始化调度器相关状态 */
    portDISABLE_INTERRUPTS();
    xNextTaskUnblockTime = portMAX_DELAY;
    xSchedulerRunning = pdTRUE;
    xTickCount = ( TickType_t ) configINITIAL_TICK_COUNT;
    /* 用于支持运行时统计 */
    portCONFIGURE_TIMER_FOR_RUN_TIME_STATS();
    traceTASK_SWITCHED_IN();
    /* 启动任务调度器，一般不会返回 */
    xPortStartScheduler();
  }
  else
  {
    /* 创建任务失败，触发断言提示错误 */
    configASSERT( xReturn != errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY );
  }
  /* 使用(void)强制转换表示有意不使用这些变量，这样就不会有警告 */
  ( void ) xIdleTaskHandle;
  ( void ) uxTopUsedPriority;
}
```
```c
BaseType_t xPortStartScheduler( void )
{
  /* 如果启用了断言配置，这里会验证系统中断优先级的设置是否正确，省略 */

  /* 开启PendSV和SysTick中断 */
  /* 前者用于任务切换，后者用于生成系统滴答 */
  portNVIC_SHPR3_REG |= portNVIC_PENDSV_PRI;
  portNVIC_SHPR3_REG |= portNVIC_SYSTICK_PRI;
  /* 配置硬件定时器，以产生时钟滴答 */
  vPortSetupTimerInterrupt();
  /* 初始化临界区的计数器 */
  uxCriticalNesting = 0;
  /* 启动第一个任务，通常不会返回 */
  prvStartFirstTask();
  return 0;
}
```
**②初始任务**
>**概述**：通过`VTOR`寄存器找到并设置`MSP`，随后**开启中断**，最后`svc 0`触发**SVC中断**
{%list%}
SVC中断处理函数如下，主要工作为弹出任务栈中的r4-r11寄存器并设置PSP
{%endlist%}
{%right%}
orr r14, # 0xd将r14的bit2和bit3设置为1，表示返回线程以及返回线程栈
{%endright%}
```c
__asm void prvStartFirstTask( void )
{
  PRESERVE8

  /* 加载VTOR寄存器地址，该寄存器保存向量表位置 */
  ldr r0, =0xE000ED08
  /* 读取该寄存器，找到向量表地址 */
  ldr r0, [ r0 ]
  /* 读取向量表地址，首项即中断栈地址 */
  ldr r0, [ r0 ]

  /* 设置msp寄存器，即中断栈地址 */
  msr msp, r0
  /* 开启FIQ和IRQ */
  cpsie i
  cpsie f
  dsb
  isb
  /* 触发svc中断 */
  svc 0
  /* 无操作指令，保证CPU不会立即执行下一条指令 */
  nop
  nop
}
```
```c
__asm void vPortSVCHandler( void )
{
  PRESERVE8
  /* 将当前任务的栈顶地址读入r0 */
  ldr r3, = pxCurrentTCB
  ldr r1, [ r3 ]
  ldr r0, [ r1 ]
  /* 弹出寄存器r4 - r11，并设置psp寄存器 */
  ldmia r0 !, { r4 - r11 }
  msr psp, r0
  isb
  /* 允许响应所有优先级中断 */
  mov r0, # 0
  msr basepri, r0
  /* 设置r14，返回用户模式，SP使用PSP */
  orr r14, # 0xd
  bx r14
}
```
#### 2.3调度机制
**①任务的起点**
>**概述**：`xTaskCreate()`代码如下，当给任务**分配好资源**后，便调用`prvAddNewTaskToReadyList()`
{%list%}
当有任务运行且调度器正在运行时，会将其插入就绪链表，若其优先级更高，就会触发pendSV中断进行任务调度
{%endlist%}
{%right%}
当调度器没有运行时，只要新任务的优先级大于等与当前运行任务，就会投入运行
{%endright%}
>所以如果在`main`函数中创建几个**同等优先级**的任务，**最后创建**的反而**最先运行**
```c
/* 只看栈向下增长情况下的代码逻辑，只是任务栈和TCB的分配顺序不同 */
BaseType_t xTaskCreate( TaskFunction_t pxTaskCode,
                        const char * const pcName, 
                        const configSTACK_DEPTH_TYPE usStackDepth,
                        void * const pvParameters,
                        UBaseType_t uxPriority,
                        TaskHandle_t * const pxCreatedTask )
{
  TCB_t * pxNewTCB;
  BaseType_t xReturn;

  StackType_t * pxStack;

  /* 分配任务栈 */
  pxStack = pvPortMallocStack( ( ( ( size_t ) usStackDepth ) * sizeof( StackType_t ) ) ); 
  /* 当任务栈分配成功后，再为TCB分配内存 */
  if( pxStack != NULL )
  {
    pxNewTCB = ( TCB_t * ) pvPortMalloc( sizeof( TCB_t ) );
    /* 若TCB分配成功，则清空对应内存 */
    if( pxNewTCB != NULL )
    {
      memset( ( void * ) pxNewTCB, 0x00, sizeof( TCB_t ) );

      /* 将pxStack写入TCB */
      pxNewTCB->pxStack = pxStack;
    }
    else
    {
      /* 若TCB分配失败，则释放栈内存 */
      vPortFreeStack( pxStack );
    }
  }
  /* 若任务栈分配失败，则不用为TCB分配内存 */
  else
  {
    pxNewTCB = NULL;
  }
  /* 当TCB和栈分配成功 */
  if( pxNewTCB != NULL )
  {
    #if ( tskSTATIC_AND_DYNAMIC_ALLOCATION_POSSIBLE != 0 ) 
    {
      pxNewTCB->ucStaticallyAllocated = tskDYNAMICALLY_ALLOCATED_STACK_AND_TCB;
    }
    #endif
    /* 初始化新任务，主要是对TCB进行填充 */
    prvInitialiseNewTask( pxTaskCode, pcName, ( uint32_t ) usStackDepth, pvParameters, uxPriority, pxCreatedTask, pxNewTCB, NULL );
    /* 将新任务添加到就绪链表中 */
    prvAddNewTaskToReadyList( pxNewTCB );
    xReturn = pdPASS;
  }
  else
  {
    xReturn = errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY;
  }

  return xReturn;
}
```
```c
static void prvAddNewTaskToReadyList( TCB_t * pxNewTCB ){

  /* 进入临界区，保证更新任务列表时不会被打断 */
  taskENTER_CRITICAL();
  {
    /* 增加当前任务的计数器数量 */
    uxCurrentNumberOfTasks++;
    /* 如果当前没有任务在运行，则将当前运行任务设置为该任务 */
    if( pxCurrentTCB == NULL )
    {
      pxCurrentTCB = pxNewTCB;
      /* 如果这是第一个任务 */
      if( uxCurrentNumberOfTasks == ( UBaseType_t ) 1 )
      {
        /* 初始化任务列表 */
        prvInitialiseTaskLists();
      }
      else
      {
        mtCOVERAGE_TEST_MARKER();
      }
    }
    /* 如果调度器没有运行 */
    else
    {
      if( xSchedulerRunning == pdFALSE )
      {
        /* 若当前运行任务的优先级小于等于该任务，则将当前运行任务设置为该任务 */
        if( pxCurrentTCB->uxPriority <= pxNewTCB->uxPriority )
        {
          pxCurrentTCB = pxNewTCB;
        }
        else
        {
          mtCOVERAGE_TEST_MARKER();
        }
      }
      else
      {
        mtCOVERAGE_TEST_MARKER();
      }
    }
    /* 递增任务编号 */
    uxTaskNumber++;

    #if ( configUSE_TRACE_FACILITY == 1 )
    {
      /* Add a counter into the TCB for tracing only. */
      pxNewTCB->uxTCBNumber = uxTaskNumber;
    }
    #endif
    traceTASK_CREATE( pxNewTCB );
    /* 将该任务添加到就绪链表中 */
    prvAddTaskToReadyList( pxNewTCB );

    portSETUP_TCB( pxNewTCB );
  }
  taskEXIT_CRITICAL();
  /* 如果任务调度器正在运行 */
  if( xSchedulerRunning != pdFALSE )
  {
    /* 若当前运行任务的优先级小于该任务，则启动任务调度 */
    if( pxCurrentTCB->uxPriority < pxNewTCB->uxPriority )
    {
      taskYIELD_IF_USING_PREEMPTION();
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }
}
  else
  {
    mtCOVERAGE_TEST_MARKER();
  }
}
```
**②任务切换**
>**概述**：`pendSV`中断处理函数的**核心函数**为`vTaskSwitchContext()`，代码如下
{%list%}
获取所有就绪任务中最高的优先级，并将pxCurrentTCB指向对应优先级的就绪列表中的下一个列表项
{%endlist%}
{%right%}
高优先级任务可以通过pendSV中断打断低优先级任务运行并进行调度实现抢占，同优先级任务依此调度实现轮转
{%endright%}
```c
/* 任务调度函数 */
void vTaskSwitchContext( void )
{
  /* 检查调度器是否处于挂起状态，是的话则表示不允许上下文切换 */
  if( uxSchedulerSuspended != ( UBaseType_t ) pdFALSE )
  {
    /* 表示有任务切换请求但暂时不处理 */
    xYieldPending = pdTRUE;
  }
  else
  {
    /* 表示当前不需要进行上下文切换 */
    xYieldPending = pdFALSE;
    traceTASK_SWITCHED_OUT();

    /* 检查当前任务的堆栈是否溢出 */
    taskCHECK_FOR_STACK_OVERFLOW();

    /*选择下一个要运行的任务 */
    taskSELECT_HIGHEST_PRIORITY_TASK(); 
    traceTASK_SWITCHED_IN();
  }
}
```
```c
#define taskSELECT_HIGHEST_PRIORITY_TASK()                                                \
{                                                                                         \
  UBaseType_t uxTopPriority;                                                              \
  /* 找到就绪任务中最高的优先级 */                                                          \
  portGET_HIGHEST_PRIORITY( uxTopPriority, uxTopReadyPriority );                          \
  /* 断言检查指定优先级的就绪任务列表的长度是否大于0 */                                       \
  configASSERT( listCURRENT_LIST_LENGTH( &( pxReadyTasksLists[ uxTopPriority ] ) ) > 0 ); \
  /* 从优先级最高的就绪任务列表中获取下一个任务的TCB，并将pxCurrentTCB指向它 */                \
  listGET_OWNER_OF_NEXT_ENTRY( pxCurrentTCB, &( pxReadyTasksLists[ uxTopPriority ] ) );   \
}
```
```c
#define listGET_OWNER_OF_NEXT_ENTRY( pxTCB, pxList )                                   \
{                                                                                      \
/* 读取就绪链表，且确保不会对其进行修改 */                                                \
List_t * const pxConstList = ( pxList );                                               \
/* 获取下一个任务块索引 */                                                               \
( pxConstList )->pxIndex = ( pxConstList )->pxIndex->pxNext;                           \
/* 如果下一个任务块为结束标记，则再向后移动一个节点 */                                     \
if( ( void * ) ( pxConstList )->pxIndex == ( void * ) &( ( pxConstList )->xListEnd ) ) \
{                                                                                      \
    ( pxConstList )->pxIndex = ( pxConstList )->pxIndex->pxNext;                       \
}                                                                                      \
( pxTCB ) = ( pxConstList )->pxIndex->pvOwner;                                         \
}
```













