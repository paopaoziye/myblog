---
title: ARM体系架构（五）
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
  - ARM体系架构
categories: 编程语言
keywords: 文章关键词
updated: ''
img: /medias/featureimages/20.webp
date:
summary: M-pofile的内存管理机制，主要围绕Armv8-M
---
# 处理器架构
## ARM体系架构
### ARM体系架构（五）
#### 1.引言
**①内存地图**
>**概述**：`Cortex-M`是一个**统一的线性内存映射系统**，且由于使用`32`位地址，故拥有`4GB`的**地址空间**
{%list%}
M-profile本身有一套Default Memory Map，不仅将这些地址空间划分为不同类型，还设置了其默认内存属性
{%endlist%}
>主要可`Code`、`SRAM`、`Peripheral`、`External RAM/Device`和`System`等区域，如下所示
{%right%}
ARM采用Memory-mapped I/O机制，使处理器能够直接通过内存访问指令读写对应硬件寄存器
{%endright%}
>`Memory-mapped I/O`即将外设寄存器映射到**内存地址空间**，为各寄存器**分配固定地址**并纳入**统一的寻址体系**
{%warning%}
ARM规定整体地址空间框架及部分系统资源地址，具体Flash、SRAM和芯片外设的实现范围及地址由芯片厂商定义
{%endwarning%}
>比如一个芯片厂商规定`UART0 = 0x40001000`，另一个芯片厂商规定`UART0 = 0x40010000`

>
{%wrong%}
统一地址空间只表示处理器通过同一套地址进行寻址，不代表所有地址都实际存在
{%endwrong%}
```shell
0x0000_0000
    │
    │ Code
    │ Flash / ROM 等
    │
0x2000_0000
    │
    │ SRAM
    │
0x4000_0000
    │
    │ Peripheral
    │ UART / GPIO / Timer ...
    │
0x6000_0000
    │
    │ External RAM / Device
    │
    │ ...
0xE000_0000
    │
    │ System / PPB
    │ NVIC / SCB / SysTick / Debug ...
    │
0xFFFF_FFFF
```
**②内存属性**
>**概述**：也称为`Memory Attribute`，用于规定某段地址空间的**内存类型**及**访问语义**
{%list%}
不同M-profile架构的术语略有区别，比如Armv8-M主要使用Normal和Device两种类型
{%endlist%}

>`Normal Memory`主要用于`Flash`、`External RAM`、`SRAM`、`Stack`、`Heap`、**程序代码**和**普通数据**等

>`Device Memory`主要用于`GPIO`、`DMA`和`UART`等各种`Memory-mapped Peripheral`
{%right%}
处理器可以假定访问普通内存通常没有硬件副作用，因此允许进行更多性能优化如访问合并、推测访问和Cache等
{%endright%}
{%warning%}
访问Device Memory时可能具有副作用如改变硬件状态，因此处理器必须更加严格地对待这些访问
{%endwarning%}
>`Armv8-M`给`Device Memory`定义了三个属性`G`、`R`和`E`，分别表示能不能**合并访问**、**重排**和**提前确认完成写操作**

>`Device`又可细分为`Device-nGnRnE`、`Device-nGnRE`、`Device-nGRE`和`Device-GRE`四种类型

>**合并访问**即允许把某些**相邻访问**合并为一次访问，**重排**即在架构允许范围内可以改变设备访问**被观察到的顺序**

>**提前确认完成写操作**即写请求可以在**真正到达最终设备之前**，就向处理器确认这次写操作**已经被接受**

**③缓存与共享**
>**概述**：`Armv8-M`为`Normal Memory`定义了**缓存属性**和**共享属性**
{%list%}
缓存属性包括Cacheable/Non-cacheable，共享属性包括Non-shareable/Inner Shareable/Outer Shareable
{%endlist%}
>`Non-shareable`表示这片内存主要由**当前处理器**使用，不需要保证其他处理器或设备能**同步看到相同的数据**

>`Inner Shareable`表示这片内存可由**同一内部范围内**的多个处理器或设备共享，并进行**数据协调**

>`Outer Shareable`表示这片内存可由**跨多个内部共享域**的处理器或设备共享，并进行**数据协调**

{%right%}
如果支持Cache，还可进一步配置写策略Write-Through/Write-Back以及分配策略Read Allocate/Write Allocate
{%endright%}
>`Write-Through`表示`CPU`进行**写操作**时会同时更新`Cache`以及对应的下级`Memory`

>`Write-Back`表示`CPU`进行**写操作**时只修改`Cache`并将对应`Cache Line`标记为`Dirty`，以后再写回`Memory`

>`Read Allocate`表示发生**读缺失**时，会先将对应`Cache Line`加载到`Cache`中，再完成本次读取

>`Write Allocate`表示发生**写缺失**时，会先将对应`Cache Line`分配到`Cache`中，再在`Cache`内完成写入
{%warning%}
Armv8-M中的Device Memory始终按Shareable处理，无需像Normal Memory一样配置具体的共享属性
{%endwarning%}
{%wrong%}
带Cache且存在其他Bus Master时，需要进行缓存维护或将相关区域设为Non-cacheable，避免数据不一致
{%endwrong%}
>
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











```
驱动里经常出现：

UART->DR = 0x55;

实际上 UART 往往就是：

#define UART ((UART_Type *)0x40001000)

而：

typedef struct
{
    volatile uint32_t DR;
    volatile uint32_t SR;
    volatile uint32_t CR;
} UART_Type;

所以：

UART->DR

本质就是：

Base Address
0x40001000

+
DR Offset
0x00

=
0x40001000

而：

UART->SR

就是：

0x40001000
+
0x04
=
0x40001004

因此这个 C 结构体并没有创造什么硬件对象。

它只是给地址起了方便理解的名字：

0x40001000 → UART->DR
0x40001004 → UART->SR
0x40001008 → UART->CR
```

当CPU运行一条内存访问指令如`LDR`访问`0x20001000`时，经过地址译码后发现该地址属于SRAM，于是访问请求被路由到SRAM Controller，于是SRAM 找到对应存储单元取出数据按照SRAM -> Bus -> CPU返回
计算地址
   ↓
发起Read
   ↓
地址译码
   ↓
路由到SRAM
   ↓
SRAM读取数据
   ↓
数据返回CPU
   ↓
写入R0




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
    │       └── Read / Write Allocate
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
PU不识别具体Task，通常由RTOS在任务切换时加载对应的Region配置，实现各任务之间的访问隔离
{%endright%}
{%warning%}
高优先级异常环境是指处理器处于NMI、HardFault或FAULTMASK=1等具有负数执行优先级、可屏蔽绝大多数普通异常的执行状态
{%endwarning%}
{%wrong%}
在HardFault、NMI等高优先级异常环境下忽略MPU，可避免错误的MPU配置阻止关键异常处理和故障恢复
{%endwrong%}
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
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}
```
十二、如果地址根本不存在怎么办？

例如 CPU：

LDR R0, [R1]

而：

R1 = 0xDEADBEEF

这个地址可能没有任何硬件响应。

于是：

CPU发出访问
   ↓
Address Decoder
   ↓
没有有效目标
或目标返回错误
   ↓
Bus Error
   ↓
BusFault

如果：

BusFault没有正常处理

那么就是你前面刚学过的：

BusFault
   ↓
Fault Escalation
   ↓
HardFault

所以现在连 Memory Map 和 Fault 也接起来了：

错误地址访问
    ↓
Memory / Bus
    ↓
BusFault
    ↓
可能HardFault
```
