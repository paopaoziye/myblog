---
title: ARM体系架构（五）
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
  - ARM体系架构
categories: 编程语言
keywords:
  - ARM
  - M-profile
  - Armv8-M
  - MPU
  - Region
  - TrustZone
updated: ''
img: /medias/featureimages/20.webp
date: 2026-08-31 00:00:00
summary: M-profile的内存管理机制，主要围绕Armv8-M
---
# 处理器架构
## ARM体系架构
### ARM体系架构（五）
#### 1.引言
**①内存地图**
>**概述**：`M-profile`采用统一的`32-bit`**线性地址空间**，**指令和数据**共享同一套地址空间，总可寻址范围为`4GB`
{%list%}
M-profile定义了一套Default Memory Map，将整个地址空间预划分为若干架构区域，并规定了默认的内存属性与访问语义
{%endlist%}
>主要可分为`Code`、`SRAM`、`Peripheral`、`External RAM/Device`和`System`等区域，详细如下所示
{%right%}
ARM采用Memory-mapped I/O机制，使处理器能够使用普通的Load/Store内存访问指令读写映射到地址空间中的硬件寄存器
{%endright%}
>`Memory-mapped I/O`即将外设寄存器映射到**处理器地址空间**，为各寄存器**分配特定地址**并纳入**统一的寻址体系**
{%warning%}
ARM规定整体地址空间框架及部分系统资源地址，具体Flash、SRAM和芯片外设的实现范围及地址由芯片厂商定义
{%endwarning%}
>比如某芯片厂商可以规定`UART0`的**寄存器块基地址**为`0x40001000`，另一厂商则可以将其放在`0x40010000`

>芯片厂家可以通过**别名映射**使多个**不同地址**指向**同一物理存储**，也可以通过**重映射**改变**某个地址所指向的物理存储**
{%wrong%}
统一地址空间描述的是处理器的寻址模型，并不意味着整个地址范围都对应实际实现的存储器或外设
{%endwrong%}
```text
0xFFFF_FFFF  ┌──────────────────────────────┐   System Region
             │                              │   作用：核心系统资源
             │        System Region         │   典型对象：Vendor_SYS, NVIC, SCB, SysTick
             │                              │
0xE000_0000  ├──────────────────────────────┤
             │                              │   External Device
             │       External Device        │   作用：典型片外 MMIO 设备
             │                              │   典型对象：FPGA 寄存器, LCD 控制器
0xA000_0000  ├──────────────────────────────┤
             |                              |
             │                              │   External RAM
             │         External RAM         │   作用：片外可读写存储器
             │                              │   典型对象：SDRAM, PSRAM, External SRAM
             │                              │
0x6000_0000  ├──────────────────────────────┤
             │                              │   Peripheral
             │          Peripheral          │   作用：片上外设寄存器
             │                              │   典型对象：GPIO, UART, SPI, ADC, Timer
0x4000_0000  ├──────────────────────────────┤
             │                              │   SRAM
             │             SRAM             │   作用：运行时数据存储
             │                              │   典型对象：stack, heap, .data, .bss
0x2000_0000  ├──────────────────────────────┤
             │                              │   Code
             │             Code             │   作用：程序镜像 / 常量 / 启动向量
             │                              │   典型对象：Flash, ROM, vector table, .text, .rodata
0x0000_0000  └──────────────────────────────┘
```
**②内存属性**
>**概述**：也称为`Memory Attribute`，用于描述处理器访问某段地址时应遵循的**访问语义**和**行为约束**
{%list%}
Memory Type是最基础的内存属性之一，Armv8-M主要定义了Normal Memory和Device Memory两种Memory Type
{%endlist%}
>`Normal Memory`通常不会**因为访问行为本身产生硬件副作用**，主要用于`Flash`、`SRAM`和`External RAM`等**普通存储器区域**

>`Device Memory`的**访问**则可能会产生`W1C`或**触发硬件操作**等副作用，主要用于`GPIO`和`UART`等各种`Memory-mapped Peripheral`
{%right%}
Normal Memory具有更宽松的访问语义，因此架构允许处理器对其采用Cache、推测访问、访问合并和访问重排等优化
{%endright%}
>`Armv8-M`对`Device Memory`施加了更严格的**访问约束**，例如其始终为`Non-cacheable`，并按`Shareable`处理

>`Device Memory`同时禁止`Speculative Data Access`，避免**提前访问外设**产生硬件副作用，并要求内存访问满足**地址对齐要求**
{%warning%}
Device Memory还通过G/nG、R/nR和E/nE属性，进一步约束访问合并、访问重排以及提前写确认等行为
{%endwarning%}
>**合并访问**：允许将**多个同类型**的内存访问合并为更少的`Memory Transaction`，以降低总线**事务数量**和**访问开销**

>**访问重排**：允许在**架构规则范围内**改变设备访问**到达目标的先后顺序**，从而提高`Memory System`的处理效率

>**提前写确认**：允许写请求在**真正到达最终设备之前**，由中间节点提前向处理器**返回该写请求已被接受的确认**

>根据上述属性，`Device Memory`可细分为`Device-nGnRnE`、`Device-nGnRE`、`Device-nGRE`和`Device-GRE`四种类型

**③缓存与共享**
>**概述**：`Armv8-M`为`Normal Memory`定义了可选的`Cacheability`和`Shareability`，分别表示**缓存属性**和**共享属性**
{%list%}
缓存属性可分为Cacheable和Non-cacheable，共享属性可分为Non-shareable、Inner Shareable和Outer Shareable
{%endlist%}
>以下将**可以访问内存的主体**如`CPU`和`DMA`等称为`Observer`，比如一个系统存在两个`Observer`分别为`CPU0`和`CPU1`

>`Shareability`用于管理多个`Observer`共享内存时，硬件需要在什么范围内满足**架构规定的一致性和可观察性要求**

>`Non-shareable`表示这片内存被一个`Observer`修改时，不需要保证其他处理器或设备能**同步看到相同的数据**

>`Inner Shareable`表示这片内存需要在同一`Inner Shareability Domain`内的多个`Observer`之间满足相应的**数据共享与一致性要求**

>`Outer Shareable`表示该内存需要在更大的`Outer Shareability Domain`内的多个`Observer`满足相应的**数据共享与一致性要求**
{%right%}
如果支持Cache，还可进一步配置写策略Write-Through/Write-Back以及分配策略Read Allocate/Write Allocate
{%endright%}
>`Write-Through`表示`CPU`进行**写操作**时会同时更新`Cache`以及对应的下级`Memory`

>`Write-Back`表示`CPU`进行**写操作**时只修改`Cache`并将对应`Cache Line`标记为`Dirty`，以后再写回`Memory`

>`Read Allocate`表示发生**读缺失**时，会先将对应`Cache Line`加载到`Cache`中，再完成本次读取

>`Write Allocate`表示发生**写缺失**时，会先将对应`Cache Line`分配到`Cache`中，再在`Cache`内完成写入
{%warning%}
Armv8-M明确规定Normal Non-cacheable memory locations始终按Outer Shareable处理
{%endwarning%}
{%wrong%}
带Cache且存在其他Bus Master时，需要进行缓存维护或将相关区域设为Non-cacheable，避免数据不一致
{%endwrong%}

**④内存访问流程**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}
#### 2.内存保护单元
**①简介**
>**概述**：也称为`MPU`，将**地址空间**划分成若干`Region`并规定**访问权限**、**执行权限**和**内存属性**，阻止**非法访问**并**隔离不同软件区域**
{%list%}
Region的属性主要包含地址范围、读写权限、特权访问权限、执行权限以及内存类型、缓存和共享属性
{%endlist%}
>访问一个地址时，`MPU`会先判断这个地址属于哪个`Region`，随后依次进行**相关权限的检查**

>**地址范围**：规定该`Region`覆盖的**起始地址**和**结束地址**，`Armv8-M`的`Region`边界必须按`32 Byte`对齐

>**读写权限**：规定该`Region`允许`Read/Write`还是**仅允许**`Read`

>**特权访问权限**：规定该`Region`是否允许`Unprivileged`代码访问，从而实现**内核与普通任务**之间的内存隔离

>**执行权限**：规定处理器能否从该`Region`进行**指令取指**，`XN`置位时表示`Execute Never`即禁止执行
{%right%}
Privileged访问在没有命中任何MPU Region时，可以使用ARM的默认Memory Map作为Background Region
{%endright%}
>`Unprivileged`软件不能靠这个获得**默认兜底权限**，通常只允许访问**显式配置**的`Region`
{%warning%}
MPU主要约束Cortex-M自身经过MPU的访存，不直接保护DMA等独立Bus Master的访问，并且不会像MMU那样进行地址转换
{%endwarning%}
{%wrong%}
当访问违反Region的访问权限或执行权限时，会触发MemManage Fault，无法正常处理时还可能升级为HardFault
{%endwrong%}
```text
Region
│
├── 地址属性
│   └── Base / Limit
│
├── 保护属性
│   ├── Privileged / Unprivileged
│   ├── Read / Write
│   └── Execute / XN
│
└── 内存属性
    ├── Memory Type
    │   ├── Normal
    │   └── Device
    │
    ├── Cache Attribute
    │   ├── Non-cacheable
    │   └── Cacheable
    │       ├── Write-Through / Write-Back
    │       └── Read / Write
    │
    └── Shareability
        ├── Non-shareable
        ├── Inner Shareable
        └── Outer Shareable
```

**②核心寄存器**
>**概述**：以`Armv8-M`为例，`MPU`主要包含`MPU_TYPE`、`MPU_CTRL`、`MPU_RNR`、`MPU_RBAR`、`MPU_RLAR`以及`MPU_MAIR0/1`等寄存器
{%list%}
MPU_TYPE/CTRL负责整体能力与控制，RNR/RBAR/RLAR负责定义Region，MAIR负责定义Region使用的内存属性
{%endlist%}
>`MPU_TYPE`：用于指示`MPU`**是否存在**以及可以实现的`Region`**数目**等能力信息

>`MPU_CTRL`：用于控制`MPU`是否`Enable`、`Privileged`是否使用`Default Memory Map`以及某些**高优先级异常环境**下`MPU`是否生效

>`MPU_RNR`：用于选择当前需要**配置或访问**的`Region`编号，后续对`RBAR`和`RLAR`的操作作用于该`Region`

>`MPU_RBAR`：用于定义`Region`的**起始地址**及**保护属性**，如**共享属性**、**读写权限**、**非特权访问权限**和`XN`**执行权限**等

>`MPU_RLAR`：用于定义`Region`的**结束地址**及**内存属性索引**，并通过`AttrIndx`关联`MAIR`中定义的`Memory Attribute`

>`MPU_MAIR0/1`：共同提供`8`组**可复用**`Memory Attribute`，每组占`8 bit`，`MPU_RLAR.AttrIndx`选择一组属性给当前`Region`使用
{%right%}
MPU不识别具体Task，通常由RTOS在任务切换时加载对应的Region配置，实现各任务之间的访问隔离
{%endright%}
{%warning%}
高优先级异常环境是指处理器处于NMI、HardFault或FAULTMASK=1等具有负数执行优先级、可屏蔽绝大多数普通异常的执行状态
{%endwarning%}
{%wrong%}
在HardFault、NMI等高优先级异常环境下忽略MPU，可避免错误的MPU配置阻止关键异常处理和故障恢复
{%endwrong%}
```c
#include "stm32u5xx.h"

/* MAIR中的Memory Attribute索引 */
#define MPU_ATTR_NORMAL_NC    0U
#define MPU_ATTR_DEVICE       1U

void MPU_Config(void)
{
    uint32_t region_count;

    /*----------------------------------------------------------
     * 1. 关闭MPU
     *---------------------------------------------------------*/
    ARM_MPU_Disable();


    /*----------------------------------------------------------
     * 2. 获取并清除当前MPU的所有Region
     *
     * ARM_MPU_TYPE()读取MPU_TYPE.DREGION
     *---------------------------------------------------------*/
    region_count = ARM_MPU_TYPE();

    for (uint32_t i = 0; i < region_count; i++)
    {
        ARM_MPU_ClrRegion(i);
    }


    /*----------------------------------------------------------
     * 3. 配置MAIR中的Memory Attribute
     *---------------------------------------------------------*/

    /*
     * Attr 0:
     * Normal Memory
     * Non-cacheable
     */
    ARM_MPU_SetMemAttr(
        MPU_ATTR_NORMAL_NC,
        ARM_MPU_ATTR(
            ARM_MPU_ATTR_NON_CACHEABLE,     /* Outer */
            ARM_MPU_ATTR_NON_CACHEABLE      /* Inner */
        )
    );

    /*
     * Attr 1:
     * Device-nGnRnE
     *
     * nG = 不允许Gathering
     * nR = 不允许Reordering
     * nE = 不允许Early Write Acknowledgement
     */
    ARM_MPU_SetMemAttr(
        MPU_ATTR_DEVICE,
        ARM_MPU_ATTR(
            ARM_MPU_ATTR_DEVICE,
            ARM_MPU_ATTR_DEVICE_nGnRnE
        )
    );


    /*----------------------------------------------------------
     * 4. Region 0：Flash
     *
     * 0x08000000 ~ 0x081FFFFF
     * 2 MB
     *
     * Normal Memory
     * Read Only
     * Unprivileged也可访问
     * 可执行
     *---------------------------------------------------------*/
    ARM_MPU_SetRegion(
        0U,

        ARM_MPU_RBAR(
            0x08000000UL,       /* Base */
            ARM_MPU_SH_NON,     /* Non-shareable */
            ARM_MPU_AP_RO,      /* Read Only */
            ARM_MPU_AP_NP,      /* Non-privileged allowed */
            ARM_MPU_EX          /* Executable */
        ),

        ARM_MPU_RLAR(
            0x081FFFFFUL,       /* Limit */
            MPU_ATTR_NORMAL_NC  /* AttrIndx = 0 */
        )
    );


    /*----------------------------------------------------------
     * 5. Region 1：主SRAM
     *
     * 0x20000000 ~ 0x200BFFFF
     * 768 KB
     *
     * Normal Memory
     * Read / Write
     * Unprivileged也可访问
     * XN：禁止执行代码
     *---------------------------------------------------------*/
    ARM_MPU_SetRegion(
        1U,

        ARM_MPU_RBAR(
            0x20000000UL,
            ARM_MPU_SH_NON,
            ARM_MPU_AP_RW,
            ARM_MPU_AP_NP,
            ARM_MPU_XN
        ),

        ARM_MPU_RLAR(
            0x200BFFFFUL,
            MPU_ATTR_NORMAL_NC
        )
    );


    /*----------------------------------------------------------
     * 6. Region 2：SRAM4
     *
     * 0x28000000 ~ 0x28003FFF
     * 16 KB
     *
     * Normal Memory
     * Read / Write
     * Unprivileged可访问
     * XN
     *---------------------------------------------------------*/
    ARM_MPU_SetRegion(
        2U,

        ARM_MPU_RBAR(
            0x28000000UL,
            ARM_MPU_SH_NON,
            ARM_MPU_AP_RW,
            ARM_MPU_AP_NP,
            ARM_MPU_XN
        ),

        ARM_MPU_RLAR(
            0x28003FFFUL,
            MPU_ATTR_NORMAL_NC
        )
    );


    /*----------------------------------------------------------
     * 7. Region 3：Non-secure Peripheral Address Space
     *
     * 0x40000000 ~ 0x4FFFFFFF
     *
     * Device-nGnRnE
     * Read / Write
     * Privileged Only
     * XN
     *
     * 普通Unprivileged Task无法直接操作外设
     *---------------------------------------------------------*/
    ARM_MPU_SetRegion(
        3U,

        ARM_MPU_RBAR(
            0x40000000UL,
            ARM_MPU_SH_NON,     /* Device Memory下SH不作为普通Normal属性使用 */
            ARM_MPU_AP_RW,
            ARM_MPU_AP_PO,      /* Privileged Only */
            ARM_MPU_XN
        ),

        ARM_MPU_RLAR(
            0x4FFFFFFFUL,
            MPU_ATTR_DEVICE
        )
    );


    /*----------------------------------------------------------
     * 8. 使能MemManage Fault
     *
     * MPU权限违规时优先进入MemManage_Handler，
     * 而不是因为MemManage未使能直接升级为HardFault
     *---------------------------------------------------------*/
    SCB->SHCSR |= SCB_SHCSR_MEMFAULTENA_Msk;


    /*----------------------------------------------------------
     * 9. 重新使能MPU
     *
     * PRIVDEFENA:
     * Privileged访问没有命中显式Region时，
     * 可以使用ARM Default Memory Map作为Background Region
     *
     * 不设置HFNMIENA：
     * HardFault/NMI等特殊环境可以绕过普通MPU Region限制
     *---------------------------------------------------------*/
    ARM_MPU_Enable(MPU_CTRL_PRIVDEFENA_Msk);
}
```
**③**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}

#### 3.TrustZone
**①简介**
>**概述**：`Armv8-M`提供的**硬件安全扩展**，将系统划分为`Secure`和`Non-secure`区域，并限制后者**直接访问**前者的**代码**、**数据**和**外设**
{%list%}
TrustZone与运行模式和特权级相互独立，两个安全状态仍具有自己的运行模式、特权状态、栈、异常向量和MPU配置等
{%endlist%}
>`TrustZone`对于`Armv8-M`是一个可选的**安全扩展**，支持该扩展的处理器**复位**后默认从`Secure state`开始执行

>启用`TrustZone`后，`Secure`和`Non-secure`区域有自己的栈指针`MSP_S`、`PSP_S`、`MSP_NS`和`PSP_NS`，表示**执行上下文**的隔离

>此外`Secure`和`Non-secure`状态也有各自的`CONTROL`、`PRIMASK`、`MPU`和`VTOR`等寄存器，对应后缀分别为`_S`和`_NS`

>`Non-secure`发起的**访问请求**只能访问`Non-secure`地址，而`Secure`发起的访问请求可以访问`Secure`和`Non-secure`地址
{%right%}
外部中断可通过NVIC_ITNS指定目标为Secure或Non-secure，异常发生后处理器可直接进入对应安全状态的Handler
{%endright%}
>**系统异常**则根据异常类型采用`Banked`、**固定安全状态**或**目标安全状态可配置**等方式

>`Banked`即同一个系统异常在`Secure`和`Non-secure`状态下拥有各自的`Pending`、`Active`、`Priority`和**异常向量**等状态
{%warning%}
Non-secure Privileged仍然是Non-secure，它并不会因为拥有特权就获得Secure资源访问权
{%endwarning%}
{%wrong%}
支持TrustZone的Armv8-M还会增加SecureFault这一系统异常，专门处理非法Secure访问等TrustZone安全违规异常
{%endwrong%}
>`SecureFault`只能在`Secure`状态下处理，对应的**处理程序**也必须放在**安全内存**中
```text
Secure
├── Secure Code
├── Secure Data
├── Secure Flash
├── Secure SRAM
├── Secure Peripheral
├── Secure Interrupt
└── Secure System State

Non-secure
├── Non-secure Code
├── Non-secure Data
├── Non-secure Flash
├── Non-secure SRAM
├── Non-secure Peripheral
└── Non-secure Interrupt

```
**②安全属性单元**
>**概述**：也称为`SAU`，用于将地址空间划分为多个**安全属性区域**，具体可分为`Secure`、`Non-secure`或`NSC`三种区域
{%list%}
SAU只能由Secure Privileged软件配置，未被配置为Non-secure/NSC的区域默认保持为Secure
{%endlist%}
{%right%}
SAU主要包含SAU_CTRL、SAU_TYPE、SAU_RNR、SAU_RBAR和SAU_RLAR等寄存器，区域边界同样采用32 Byte粒度
{%endright%}
>`SAU_CTRL`：用于控制`SAU`**是否使能**，以及`SAU`关闭时地址空间默认按`Secure`还是`Non-secure`处理

>`SAU_TYPE`：用于描述`SAU`的**实现能力**，主要通过`SREGION`字段表示处理器实际支持的`SAU Region`数量

>`SAU_RNR`：用于选择当前需要**配置或查看**的`SAU Region`编号，后续对`SAU_RBAR`和`SAU_RLAR`的访问都作用于该`Region`

>`SAU_RBAR`：用于定义当前`Region`的**起始地址**，其**低**`5 bit`不参与地址定义，因此`Region`的起始地址必须按`32 Byte`对齐

>`SAU_RLAR`：用于定义当前`Region`的**结束地址**及**安全属性**，只能指定`Non-secure`和`NSC`，未指定的`Region`为`Secure`
{%warning%}
IDAU是由芯片厂家提供的实现定义安全属性单元，用于在SoC层面规定部分地址空间的固定或芯片级安全属性
{%endwarning%}
>`SAU`只能在`IDAU`的**可编程安全区域**进行进一步设置，通常需要结合`IDAU`与`SAU`来确定最终`Security Attribution`
{%wrong%}
TrustZone主要约束处理器访问，DMA等独立Bus Master仍需依赖SoC级安全机制进行保护
{%endwrong%}

**③NSC**
>**概述**：属于`Secure Memory`的一种**特殊区域**，专门用于存放从`Non-secure`进入`Secure`的`Gateway Veneer`
{%list%}
Gateway Veneer本质上是一个跳板，主要由SG指令和对应的跳转指令组成，如下所示
{%endlist%}
>`Non-secure`工程链接的是`Secure`工程生成的`import library`，其中**函数符号**指向是`NSC`区域里对应的`Gateway Veneer`地址

>`SG`指令用于从`Non-secure`合法进入`Secure`，但是`SG`只有在`NSC`中才有效，违规调用会导致`SecureFault`

>`BXNS`和`BLXNS`指令均可以用于从`Secure`主动切换到`Non-secure`，后者会**保留返回地址**，通常用于调用`Non-secure`函数
{%right%}
Gateway Veneer通常由工具链生成，在编写Secure函数时添加对应的编译器函数属性则编译器会自动生成对应的Gateway Veneer
{%endright%}
>`Armv8-M`下的`Secure/Non-secure`状态切换由**处理器硬件直接支持**，这种设计降低了**切换延迟**和**软件开销**
{%warning%}
Secure API绝不能因为调用者经过了SG就相信其传入的参数，仍需进行严格的参数与访问权限检查
{%endwarning%}
>`Armv8-M`提供`TT`和`Test Target`等一系列指令帮助软件查询某个地址的**安全和访问属性**
{%wrong%}

{%endwrong%}
```arm-gas
secure_add_veneer:
    SG                  ; Non-secure -> Secure
    B   secure_add      ; 跳到真正的 Secure 函数
```



```
二十三、启动过程是什么样

支持 TrustZone 的 Armv8-M 系统：

Reset
  ↓
Secure State

首先运行：

Secure Reset Handler

Secure Firmware 通常需要做：

① 初始化Secure执行环境
       ↓
② 配置SAU / 芯片安全控制器
       ↓
③ 划分Secure / Non-secure / NSC
       ↓
④ 配置Secure / Non-secure MPU
       ↓
⑤ 配置Interrupt Target State
       ↓
⑥ 配置Non-secure Vector Table
       ↓
⑦ 设置MSP_NS
       ↓
⑧ 跳转到Non-secure Reset Handler

然后：

Secure Boot / Initialization
          ↓
    Non-secure Application

Arm 也指出典型系统会在上电/复位后的可信 Secure 软件中配置安全区域。

```