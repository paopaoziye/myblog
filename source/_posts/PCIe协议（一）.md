---
title: PCIe协议（一）
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
  - 通信协议
categories: 通信协议
updated: ''
img: /medias/featureimages/29.webp
date: 2026-09-22 11:43:10
keywords:
summary: PCIe协议简介
---
# 通信协议
## PCIe协议
### PCIe协议（一）
#### 协议简介
**①引言**
>**概述**：`PCIe`是用于连接**处理器**、**芯片组**与**高速外设**的**高速串行互连标准**，采用**分层协议与数据包交换机制**
{%list%}
PCIe采用点对点连接，支持全双工通信，并通过可扩展的Lane结构灵活调整Link宽度，从而满足不同设备对传输带宽与性能的需求
{%endlist%}
>`Lane`为`PCIe`中最基本的**双向数据通道**，由一对**发送差分线**和一对**接收差分线**组成，`Link`是由若干`Lane`组成的**设备间连接**
{%right%}
PCIe具有高带宽、低延迟、全双工和良好扩展性等优点，能够满足网卡、显卡等高速外设对大规模数据传输和高性能通信的需求
{%endright%}
>`PCIe`采用**树状拓扑结构**，由`Root Complex`、`Switch`和`Endpoint`等组件通过`Port`与`Link`逐级连接，构成完整的`PCIe`系统

>`Root Complex`：位于`PCIe`**拓扑根部**，负责连接**处理器**、**内存系统**与`PCIe`设备，并负责系统侧对`PCIe`事务的**发起**、**转发**和**管理**

>`Endpoint`：位于`PCIe`**拓扑末端**，代表具体的`PCIe`功能设备，负责**响应系统访问**并完成**网卡**、**显卡**和**存储**等实际外设功能

>`Switch`：位于`Root Complex`与多个`Endpoint`之间，用于**扩展`PCIe`拓扑并转发数据包**，使一条上游连接能够连接**多个下游设备**

>`Port`：用于连接`Link`的**接口端口**，其中`Upstream Port`朝向`Root Complex`方向，`Downstream Port`则朝向`Endpoint`方向
{%warning%}
PCIe协议复杂、硬件设计难度高且调试成本较大，对高速信号完整性、PCB布线以及系统软硬件协同设计提出了较高要求
{%endwarning%}

**②设备寻址**
>**概述**：`PCIe`采用`Bus`、`Device`和`Function`对系统中的**每个功能单元**进行标识，使系统能够**准确定位并访问**对应的`PCIe`设备
{%list%}
Bus、Device和Function三者组合形成BDF地址，通常表示为Bus:Device.Function，用于唯一标识系统中的一个PCIe Function
{%endlist%}
>`Bus`表示设备所在的**总线编号**，`Device`表示某条`Bus`上的**设备编号**，`Function`表示一个`Device`内部**相互独立的功能单元**
{%right%}
BDF可以理解为PCIe Function在系统中的逻辑地址，系统通过该地址定位目标功能，并访问其配置空间以完成设备识别与功能配置
{%endright%}
{%warning%}
一个物理PCIe设备可包含多个独立的Function，因此BDF实际唯一标识的是具体的Function，而不是整个物理设备
{%endwarning%}
**③配置空间**
>**概述**：每个`PCIe Function`拥有的一块**标准化配置寄存器空间**，用于存放设备的**身份信息**、**资源需求**和**支持特性**等信息
{%list%}
PCIe配置空间主要由标准配置头、能力列表以及扩展配置区域等部分组成，并按照统一格式组织各类配置寄存器
{%endlist%}
>**标准配置头**位于配置空间前`64 Byte`，用于保存设备的**身份信息**、**基本控制状态**、**资源映射信息**以及**配置头类型**等基础配置内容

>**能力列表**位于**传统`PCI`兼容配置区域**，通过**链表结构**组织设备支持的**扩展能力**如`MSI`、`MSI-X`和**电源管理**等

>**扩展配置区域**位于`PCIe`**扩展区域**，同样采用**链表结构**组织更高级的`PCIe`**扩展能力**如`AER`、`SR-IOV`和`ACS`等
{%right%}
PCIe配置空间最大为4 KB，其中前256 Byte保留了传统PCI的配置空间格式，所以PCIe在软件层面仍然兼容很多PCI的设备管理机制
{%endright%}
{%warning%}
配置空间并不等同于设备的功能寄存器，前者用于识别与配置设备，后者通常通过BAR映射到系统地址空间后访问
{%endwarning%}
```map
Offset

00h ┌───────────────────────────────┐
    │ Vendor ID       │ Device ID   │
04h ├───────────────────────────────┤
    │ Command         │ Status      │
08h ├───────────────────────────────┤
    │ Revision / Class Code         │
0Ch ├───────────────────────────────┤
    │ Header Type / BIST ...        │
10h ├───────────────────────────────┤
    │ BAR0                          │
14h ├───────────────────────────────┤
    │ BAR1                          │
18h ├───────────────────────────────┤
    │ BAR2                          │
1Ch ├───────────────────────────────┤
    │ BAR3                          │
20h ├───────────────────────────────┤
    │ BAR4                          │
24h ├───────────────────────────────┤
    │ BAR5                          │
    ├───────────────────────────────┤
    │ Subsystem ID 等               │
34h ├───────────────────────────────┤
    │ Capabilities Pointer          │
    ├───────────────────────────────┤
    │ Interrupt 等                  │
3Fh └───────────────────────────────┘
| 内容                      | 作用          |
| ----------------------- | ----------- |
| `Vendor ID / Device ID` | 确定设备身份      |生产厂商与硬件类型
| `Class Code`            | 判断设备类型      |网络设备、显示设备和USB
| `Command / Status`      | 控制和查看设备基本状态 |
| `BAR`                   | 描述设备需要映射的资源 |
| `Header Type`           | 判断配置头类型     |
| `Subsystem ID`          | 标识具体产品/子系统  |
| `Capabilities Pointer`  | 找到设备支持的扩展能力 |

```
BAR
这个 Function 内部需要暴露给 CPU 的资源如Control Registers和Status Registers等，应该映射到系统地址空间的哪里
因此设备通过 BAR 告诉系统我需要一块多大的地址空间，以及这块空间具有什么属性系统枚举时再为它分配实际地址
只是一个配置寄存器，不是设备真正的大量功能寄存器本身

Capabilities 通常通过一个链表结构组织，每个Capability通常包含Capability ID、Next Pointer和Capability Data

MSI / MSI-X 我支持基于消息的中断机制

0x100 ~ 0xFFF属于PCIe Extended Capabilities，
```
Vendor ID / Device ID     → 这是谁
Class Code                → 这是什么类型的设备
Command / Status          → 当前状态和基本控制
BAR                       → 需要多少地址空间、映射到哪里
Capability                → 支持哪些扩展能力
```
配置头
不同设备的配置头不同Type 0 Endpoint，Type 1 Bridge

[BDF] + [Configuration Offset]


ECAM 把整个 PCIe 配置空间映射进 CPU 的地址空间

ECAM Base
+
Bus      × 1 MB
+
Device   × 32 KB
+
Function × 4 KB
+
Register Offset

Address =
Base
+ (Bus << 20)
+ (Device << 15)
+ (Function << 12)
+ Offset、

Configuration Space 和普通设备寄存器的区别

Configuration Space
│
├── Vendor ID
├── Device ID
├── BAR0
├── MSI Capability
└── PCIe Capability

BAR0 Address Space
│
├── Control Register
├── Status Register
├── Queue Register
├── DMA Register
└── ...
**④设备枚举**
>**概述**：系统启动时主动扫描`PCIe`拓扑，通过访问各`BDF`配置空间**发现并识别设备**，同时完成**总线号与地址资源分配**的过程
{%list%}
Vendor ID位于配置空间起始位置，且有效Function必须具有合法值，因此系统通常通过读取该字段判断目标设备是否存在
{%endlist%}
>系统首先检查`Function 0`，若设备支持**多功能**，则继续扫描该`Device`下的其他`Function`
{%right%}
系统通过BAR确定设备所需地址空间大小与类型，再从系统可用地址范围中分配不冲突的区域，并将分配结果写回BAR
{%endright%}
{%warning%}
对于Bridge或Switch Port，还需要给其下游链路分配新的Bus Number，并继续递归扫描和枚举后续连接的PCIe设备
{%endwarning%}
```map
系统启动
   ↓
从 Root Bus 开始
   ↓
扫描 Bus / Device / Function
   ↓
读取 Vendor ID
   ↓
判断 Function 是否存在
   ↓
读取 Device ID / Class Code / Header Type
   ↓
判断设备类型
   ↓
┌──────────────────────────┐
│                          │
Endpoint              Bridge / Switch Port
│                          │
│                          ├── 分配 Bus Number
│                          │
│                          ├── 递归扫描下游 Bus
│                          |
└──────────────┬───────────┘
               ↓
            检查 BAR
               ↓
       确定资源大小与类型
               ↓
          分配地址空间
               ↓
            写回 BAR
               ↓
         遍历 Capability
               ↓
      配置 Command 等寄存器
               ↓
            枚举完成
```
**⑤BAR与地址空间**
>**概述**：`BAR`用于描述该`Function`需要映射到**系统地址空间**中的资源
{%list%}
BAR本质上是一个基地址寄存器
{%endlist%}
Memory BAR和I/O BAR
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
`BAR`为**基地址寄存器**，用于告诉CPU设备的一块资源被映射到了以0x80000000为起始地址的位置
保存的是设备资源的映射基地址
设备提出资源需求，系统统一分配地址，减少设备冲突

Memory BAR