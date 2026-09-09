---
title: FreeRTOS源码阅读（一）
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
  - RTOS
  - FreeRTOS
categories: RTOS
keywords:
updated: ''
img: /medias/featureimages/38.webp
date: 2026-06-30 13:55:14
summary: FreeRTOS简介与移植
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（一）
#### 1.引言
**①裸机开发**
>**概述**：裸机指直接在**没有操作系统**的`MCU`上运行程序，常用的编程范式有**轮询**、**前后台**、**状态机**和**定时驱动**，如下所示
{%list%}
裸机开发结构简单、资源占用少且执行可控，但缺少完善的任务机制，随着任务和功能的增多，维护和扩展难度会逐渐增大
{%endlist%}
>**轮询**：简单可预测且无**上下文切换开销**，但是**任务数量较多**或者**某个任务阻塞**时就会延长其他任务的响应时间

>**前后台**：能够通过**中断快速响应紧急事件**，但是中断处理函数即`ISR`要求**简洁高效**，不适合执行**复杂或耗时逻辑**

>**状态机**：通过**状态划分**和**事件驱动**将复杂流程拆分为多个步骤，适合多阶段任务，但是**状态嵌套复杂时**会变得难以维护

>**定时驱动**：通过周期定时器按**固定时间执行任务**，时序清晰，但任务执行时间过长时容易造成**任务堆积**或**错过执行周期**
{%right%}
中断可以抢占主循环以及较低优先级中断，并可通过配置不同的中断优先级实现对紧急事件的分级响应
{%endright%}
{%warning%}
ISR应尽量简短高效，避免执行阻塞、延时或复杂逻辑，且与主循环共享数据时，还需要注意并发访问、数据一致性和临界区保护
{%endwarning%}
```c
/* 轮询模式：各任务在主循环中依次执行 */

int main(void)
{
    /* 系统初始化 */
    init();

    /* 主循环 */
    while (1)
    {
        do_task1();
        do_task2();
    }
}
```
```c
/* 前后台模式：
 * 前台由中断处理紧急事件，后台在主循环中完成具体任务
 */

static volatile int task2_pending = 0;

int main(void)
{
    /* 系统初始化 */
    init();

    /* 后台主循环 */
    while (1)
    {
        do_task1();

        if (task2_pending)
        {
            task2_pending = 0;
            do_task2();
        }
    }
}

/* 前台：中断服务函数 */
void task2_irq(void)
{
    /* ISR 中尽量只记录事件，避免执行耗时操作 */
    task2_pending = 1;
}
```
```c
/* 定时驱动：
 * 利用周期定时器产生系统 Tick，
 * 不同任务按照各自的固定周期执行
 */

static volatile unsigned int tick = 0;

int main(void)
{
    /* 系统初始化 */
    init();

    while (1)
    {
        do_tasks();
    }
}

void do_tasks(void)
{
    if ((tick % 2) == 0)
    {
        do_task1();
    }

    if ((tick % 5) == 0)
    {
        do_task2();
    }
}

/* 定时器中断，每个固定时间产生一次 Tick */
void timer_irq(void)
{
    tick++;
}
```
```c
/* 状态机：
 * 将复杂任务拆分为多个状态，
 * 根据事件或执行结果逐步切换状态
 */

typedef enum
{
    STATE_TASK1,
    STATE_TASK2,
    STATE_IDLE
} State;

static State state = STATE_TASK1;

int main(void)
{
    /* 系统初始化 */
    init();

    while (1)
    {
        run_state_machine();
    }
}

void run_state_machine(void)
{
    switch (state)
    {
        case STATE_TASK1:
            if (do_task1())
            {
                state = STATE_TASK2;
            }
            break;

        case STATE_TASK2:
            if (do_task2())
            {
                state = STATE_IDLE;
            }
            break;

        case STATE_IDLE:
            state = STATE_TASK1;
            break;

        default:
            state = STATE_TASK1;
            break;
    }
}
```
**②实时操作系统**
>**概述**：也称为`RTOS`，一类强调**确定性响应**和**实时调度**的操作系统，常见的`RTOS`有`FreeRTOS`、`RT-Thread`和`Zephyr`等
{%list%}
RTOS分为硬实时系统和软实时系统，前者要求关键任务必须在绝对截止时间内完成，后者允许偶尔错过截止时间
{%endlist%}
{%right%}
RTOS提供任务调度、内存管理以及任务间通信等机制，使不同任务具有独立的执行上下文，并能够按照优先级进行调度
{%endright%}
{%warning%}
RTOS需要额外占用一定的ROM、RAM和CPU资源，且任务切换和系统调用也会产生额外开销
{%endwarning%}
```c
/* RTOS：将不同功能划分为独立任务，由调度器统一调度 */

int main(void)
{
    /* 系统初始化 */
    init();

    /* 创建任务 */
    create_task(task1);
    create_task(task2);

    /* 启动任务调度器 */
    start_scheduler();

    /* 正常情况下不会执行到这里 */
    while (1)
    {
    }
}

/* 任务1 */
void task1(void)
{
    while (1)
    {
        do_task1();
    }
}

/* 任务2 */
void task2(void)
{
    while (1)
    {
        do_task2();
    }
}
```
**③`FreeRTOS`**
>**概述**：一个**轻量级且完全开源**的`RTOS`，可以在[官网](https://freertos.org/)中下载到**源码**，其**内核源码框架**如下所示，此处以`V11.0.1`版本为例
{%list%}
FreeRTOS采用优先级驱动的抢占式调度，当更高优先级任务进入就绪态时，可以立即抢占当前低优先级任务运行
{%endlist%}
{%right%}
FreeRTOS主要由C语言编写，代码规模较小且具有较好的可移植性和可裁剪性，实际资源占用取决于处理器架构以及内核配置
{%endright%}
{%warning%}
FreeRTOS支持静态和动态内存分配，若使用heap.x的动态内存分配，还可能因为内存碎片或分配失败引入不可预测的延迟
{%endwarning%}
```shell
FreeRTOS-Kernel/
├── include/         # 内核头文件
├── examples/        # 一些示例文件
├── tasks.c          # 任务调度核心
├── queue.c          # 队列/信号量实现
├── list.c           # 内核链表
├── timers.c         # 软件定时器
├── event_groups.c   # 事件组
├── stream_buffer.c  # 流缓冲区
└── portable/        # 移植相关
    ├─ [Compiler]/   # 编译器适配
    │  └─ [Arch]/    # 架构适配
    └─ MemMang/      # 内存管理
```
**④系统移植**
>**概述**：移植`FreeRTOS`时，需要根据**处理器架构**和**编译器**选择对应的**移植文件**，并将所需**源码**、**头文件**和**内存管理文件**加入工程
{%list%}
先根据编译环境选择文件夹，如Keil MDK需要选择portable/RVDS下的移植文件，随后根据处理器架构再选择对应的子文件夹
{%endlist%}
>以`STM32F407VET6`为例，其处理器内核为`Cortex-M4F`，可选择`portable/RVDS/ARM_CM4F`下的移植文件，如下所示
{%right%}
移植层主要负责任务上下文切换、栈初始化、临界区和中断管理等功能，并且封装了处理器相关的底层寄存器操作
{%endright%}
{%warning%}
Common、MemMang和ThirdParty还提供多个移植层共享的公共代码，如内存管理组件和MPU功能等
{%endwarning%}
```shell
FreeRTOS/
├── inc/             # 存放内核头文件，对应上述源码的include
├── src/             # 存放内核源文件，如tasks.c、list.c和queue.c等
└── portable/        # 移植相关        
    ├─ port.c        # 处理器架构相关的底层操作
    ├─ portmacro.h   # 处理器架构密切相关的宏定义和数据类型
    └─ heap4.c       # 内存管理
```
**⑤`FreeRTOSConfig.h`**
>**概述**：`FreeRTOS`的**用户配置文件**，用于设置**任务调度**、**系统时钟**、**中断**、**内存管理**及各功能模块的**启用与裁剪**
{%list%}
移植时需根据硬件平台和功能需求编写FreeRTOSConfig.h，用于内核配置与功能裁剪，也可参考官方示例
{%endlist%}
{%right%}
FreeRTOS需要接管PendSV、SVC和SysTick等异常处理函数，因此通常需要在FreeRTOSConfig.h中进行对应的函数映射
{%endright%}
{%warning%}
如果工程中已经在stm32f4xx_it.c定义了对应的异常处理函数，需要将其删除避免与FreeRTOS实现重复定义
{%endwarning%}
>其中`SysTick`若同时被`STM32 HAL`使用，可将`HAL`时基迁移至**其他定时器**，或统一在`SysTick_Handler()`中维护两者的系统`Tick`
```c
#ifndef FREERTOS_CONFIG_H
#define FREERTOS_CONFIG_H

#include <stdint.h>

/* STM32 CMSIS 中定义，表示 Cortex-M4 内核时钟频率 */
extern uint32_t SystemCoreClock;


/* ============================================================
 * 1. 处理器与系统时钟配置
 * ============================================================ */

/* Cortex-M4 内核时钟 */
#define configCPU_CLOCK_HZ                          ( SystemCoreClock )

/* FreeRTOS 系统节拍：1000Hz，即 1 Tick = 1ms */
#define configTICK_RATE_HZ                          1000U

/*
 * 使用32位 TickType_t。
 * V11.x 推荐使用该配置，不再使用 configUSE_16_BIT_TICKS。
 */
#define configTICK_TYPE_WIDTH_IN_BITS               TICK_TYPE_WIDTH_32_BITS


/* ============================================================
 * 2. 任务调度配置
 * ============================================================ */

/* 启用抢占式调度 */
#define configUSE_PREEMPTION                        1

/*
 * 同优先级任务采用时间片轮转。
 * 一个 Tick 到来时可以在同优先级 Ready Task 之间切换。
 */
#define configUSE_TIME_SLICING                      1

/*
 * Cortex-M4 使用 CLZ 指令快速查找最高优先级 Ready Task。
 * ARM_CM4F Port 要求 configMAX_PRIORITIES <= 32。
 */
#define configUSE_PORT_OPTIMISED_TASK_SELECTION     1

/*
 * 提供 0~15 共16个任务优先级。
 * 0最低，15最高。
 */
#define configMAX_PRIORITIES                        16U

/*
 * Idle Task 的最小栈深度。
 *
 * 注意：单位是 StackType_t，而不是 Byte。
 * Cortex-M4F 中 StackType_t = uint32_t，
 * 因此128对应约512 Byte。
 */
#define configMINIMAL_STACK_SIZE                    128U

/* 任务名称最大长度，包括字符串结束符 '\0' */
#define configMAX_TASK_NAME_LEN                     16U

/*
 * 如果存在优先级0的用户任务，
 * Idle Task 可以主动让出剩余时间片。
 */
#define configIDLE_SHOULD_YIELD                     1

/* 暂不启用低功耗 Tickless Idle */
#define configUSE_TICKLESS_IDLE                     0

/* 单核 FreeRTOS */
#define configNUMBER_OF_CORES                       1


/* ============================================================
 * 3. 任务相关功能
 * ============================================================ */

/* 启用 Task Notification */
#define configUSE_TASK_NOTIFICATIONS                1

/* 每个任务提供1个 Notification Slot */
#define configTASK_NOTIFICATION_ARRAY_ENTRIES       1

/* 启用互斥量 */
#define configUSE_MUTEXES                           1

/* 启用递归互斥量 */
#define configUSE_RECURSIVE_MUTEXES                 1

/* 启用计数信号量 */
#define configUSE_COUNTING_SEMAPHORES               1

/* 暂不使用 Queue Set */
#define configUSE_QUEUE_SETS                        0

/*
 * Queue Registry主要供调试器查看队列、信号量等对象。
 * 学习和调试阶段保留8个位置。
 */
#define configQUEUE_REGISTRY_SIZE                   8U

/* 不使用 Task Tag */
#define configUSE_APPLICATION_TASK_TAG              0

/* 不使用 Thread Local Storage Pointer */
#define configNUM_THREAD_LOCAL_STORAGE_POINTERS     0

/* 不使用 Newlib 的 task-local _reent */
#define configUSE_NEWLIB_REENTRANT                  0

/* 禁止旧版 FreeRTOS API 名称兼容，便于学习新版 API */
#define configENABLE_BACKWARD_COMPATIBILITY         0


/* ============================================================
 * 4. 可选 Task API
 * ============================================================ */

/* 动态修改任务优先级 */
#define INCLUDE_vTaskPrioritySet                    1

/* 获取任务优先级 */
#define INCLUDE_uxTaskPriorityGet                   1

/* 删除任务 */
#define INCLUDE_vTaskDelete                         1

/* 挂起/恢复任务 */
#define INCLUDE_vTaskSuspend                        1

/* 周期任务绝对时间延时 */
#define INCLUDE_xTaskDelayUntil                     1

/* 相对时间延时 */
#define INCLUDE_vTaskDelay                          1

/* 获取任务状态 */
#define INCLUDE_eTaskGetState                       1

/* 获取调度器状态 */
#define INCLUDE_xTaskGetSchedulerState              1

/* 获取当前任务句柄 */
#define INCLUDE_xTaskGetCurrentTaskHandle           1

/* 获取 Idle Task 句柄 */
#define INCLUDE_xTaskGetIdleTaskHandle              1

/* 根据任务名称查找任务句柄 */
#define INCLUDE_xTaskGetHandle                      1

/* 获取任务剩余栈空间 */
#define INCLUDE_uxTaskGetStackHighWaterMark         1
#define INCLUDE_uxTaskGetStackHighWaterMark2        1

/* 允许中止任务阻塞 */
#define INCLUDE_xTaskAbortDelay                     1

/* ISR中恢复任务 */
#define INCLUDE_xTaskResumeFromISR                  1

/* 获取持有Mutex的任务 */
#define INCLUDE_xQueueGetMutexHolder                1
#define INCLUDE_xSemaphoreGetMutexHolder            1


/* ============================================================
 * 5. 软件定时器
 * ============================================================ */

/* 启用软件定时器 */
#define configUSE_TIMERS                            1

/*
 * Timer Service Task优先级。
 * 给最高优先级15留出一级，这里设置为14。
 */
#define configTIMER_TASK_PRIORITY                   \
        ( configMAX_PRIORITIES - 2U )

/* Timer Command Queue长度 */
#define configTIMER_QUEUE_LENGTH                    10U

/*
 * Timer Task栈深度。
 * Cortex-M4F上256 words约为1KB。
 */
#define configTIMER_TASK_STACK_DEPTH                256U

/*
 * 启用 xTimerPendFunctionCall() /
 * xTimerPendFunctionCallFromISR()。
 */
#define INCLUDE_xTimerPendFunctionCall              1


/* ============================================================
 * 6. 内存管理
 * ============================================================ */

/*
 * 同时支持静态创建和动态创建。
 *
 * 动态：
 *     xTaskCreate()
 *     xQueueCreate()
 *
 * 静态：
 *     xTaskCreateStatic()
 *     xQueueCreateStatic()
 */
#define configSUPPORT_STATIC_ALLOCATION             1
#define configSUPPORT_DYNAMIC_ALLOCATION            1

/*
 * V11.0.1可以由Kernel提供Idle Task和Timer Task
 * 所需的静态内存，无需应用自己实现
 * vApplicationGetIdleTaskMemory()等函数。
 *
 * 标准ARM_CM4F Port可以这样使用；
 * MPU Port则需要单独处理。
 */
#define configKERNEL_PROVIDED_STATIC_MEMORY         1

/*
 * heap_4.c使用的FreeRTOS Heap大小。
 * 单位：Byte。
 *
 * STM32F407项目中20KB作为学习/一般项目初始值比较合适，
 * 最终应根据实际任务、队列、信号量等占用调整。
 */
#define configTOTAL_HEAP_SIZE                       ( 20U * 1024U )

/* Heap数组由FreeRTOS内部创建 */
#define configAPPLICATION_ALLOCATED_HEAP            0

/* vPortFree()后不主动清零内存 */
#define configHEAP_CLEAR_MEMORY_ON_FREE             0

/* 暂不启用heap_4/heap_5的Heap Protector */
#define configENABLE_HEAP_PROTECTOR                 0


/* ============================================================
 * 7. Hook与错误检测
 * ============================================================ */

/*
 * 开启较强的栈溢出检测。
 * 需要实现：
 *
 * vApplicationStackOverflowHook()
 */
#define configCHECK_FOR_STACK_OVERFLOW              2

/*
 * 动态内存申请失败时进入Hook。
 * 需要实现：
 *
 * vApplicationMallocFailedHook()
 */
#define configUSE_MALLOC_FAILED_HOOK                1

/* 不使用Idle Hook */
#define configUSE_IDLE_HOOK                         0

/* 不使用Tick Hook */
#define configUSE_TICK_HOOK                         0

/* 不使用Timer Daemon启动Hook */
#define configUSE_DAEMON_TASK_STARTUP_HOOK          0


/* ============================================================
 * 8. 调试与运行状态统计
 * ============================================================ */

/*
 * 加入部分任务调试信息。
 * 学习/调试阶段建议打开。
 */
#define configUSE_TRACE_FACILITY                    1

/*
 * 不启用vTaskList()/vTaskGetRunTimeStats()
 * 的字符串格式化接口，减少printf/sprintf依赖。
 */
#define configUSE_STATS_FORMATTING_FUNCTIONS        0

/*
 * 暂不统计每个Task的CPU运行时间。
 * 开启后还需要提供高精度计数器。
 */
#define configGENERATE_RUN_TIME_STATS               0


/* ============================================================
 * 9. Co-Routine
 * ============================================================ */

/* Co-Routine属于较老的机制，普通项目不建议使用 */
#define configUSE_CO_ROUTINES                       0


/* ============================================================
 * 10. Cortex-M4中断优先级配置
 * ============================================================ */

#ifdef __NVIC_PRIO_BITS
    #define configPRIO_BITS                         __NVIC_PRIO_BITS
#else
    /*
     * STM32F407实现4个NVIC优先级位。
     */
    #define configPRIO_BITS                         4
#endif


/*
 * Cortex-M优先级：
 *
 * 数字越小 → 逻辑优先级越高
 *
 * 0   最高
 * ...
 * 15  最低
 */

/* PendSV和SysTick使用最低中断优先级 */
#define configLIBRARY_LOWEST_INTERRUPT_PRIORITY     15

/*
 * FreeRTOS API中断优先级边界：
 *
 * 0~4：
 *     不受FreeRTOS临界区BASEPRI屏蔽
 *     不能调用FreeRTOS API
 *
 * 5~15：
 *     可以调用允许在ISR中使用的 xxxFromISR() API
 */
#define configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY 5


/* 转换为Cortex-M NVIC寄存器使用的左对齐值 */
#define configKERNEL_INTERRUPT_PRIORITY             \
        ( configLIBRARY_LOWEST_INTERRUPT_PRIORITY << ( 8 - configPRIO_BITS ) )

#define configMAX_SYSCALL_INTERRUPT_PRIORITY        \
        ( configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY << ( 8 - configPRIO_BITS ) )


/* ============================================================
 * 11. FreeRTOS异常处理函数映射
 * ============================================================ */

/*
 * FreeRTOS接管PendSV：
 * 负责实际的任务上下文切换。
 */
#define xPortPendSVHandler                          PendSV_Handler

/*
 * FreeRTOS接管SVC：
 * 主要用于启动第一个Task。
 */
#define vPortSVCHandler                             SVC_Handler

/*
 * 如果SysTick完全由FreeRTOS管理，可以直接映射。
 *
 * 如果STM32 HAL仍然依赖HAL_IncTick()，
 * 请参见下文的HAL兼容方案。
 */
#define xPortSysTickHandler                         SysTick_Handler


/* ============================================================
 * 12. Assert
 * ============================================================ */

/*
 * 调试阶段强烈建议开启。
 *
 * Cortex-M Port还会利用configASSERT()
 * 检测非法的ISR优先级配置等问题。
 */
#define configASSERT( x )                           \
    do                                              \
    {                                               \
        if( ( x ) == 0 )                           \
        {                                           \
            taskDISABLE_INTERRUPTS();               \
            for( ;; )                               \
            {                                       \
            }                                       \
        }                                           \
    } while( 0 )


#endif /* FREERTOS_CONFIG_H */
```


