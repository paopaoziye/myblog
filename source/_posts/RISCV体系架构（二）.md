---
title: RISC-V体系架构（二）
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
img: /medias/featureimages/16.webp
date:
summary: RISC-V体系架构简介
---
# 处理器架构
## RISC-V体系架构
### RISC-V体系架构（二）
#### 1.指令系统
**①引言**
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


```
**②**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

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
CSR
CPU运行状态
中断状态
异常信息
特权配置
内存管理配置

具体有哪些寄存器
mstatus     sstatus
mtvec       stvec
mepc        sepc
mcause      scause
mie         sie
mip         sip



RISC-V中的虚拟内存方案通常以Sv开头，例如：

Sv32
Sv39
Sv48

其中：

Sv32主要用于32位系统；
Sv39和Sv48主要用于64位系统；
是否支持虚拟内存并不由RV32或RV64本身决定
对于不使用虚拟内存的小型嵌入式系统，RISC-V可以通过PMP，即物理内存保护机制，限制不同软件对物理内存区域的访问权限


Trap
├── Exception   异常
└── Interrupt   中断

异常
非法指令
访问错误
断点
ECALL系统调用
页故障

中断
定时器中断
软件中断
外部设备中断
六、发生Trap时CPU做什么

以M-mode为例，假设程序正在运行：

PC = 0x80001000

突然发生定时器中断。

CPU会使用一组CSR保存关键信息：

mepc
   ↓
保存原来的PC


mcause
   ↓
记录为什么发生Trap


mstatus
   ↓
保存/修改特权与中断状态


mtvec
   ↓
找到Trap处理程序入口

然后：

正常程序
   │
   │ Trap
   ▼
mtvec指定的处理程序
   │
   │ 处理中断/异常
   ▼
mret
   │
   ▼
返回mepc

可以把整个过程记成：

发生Trap
   ↓
保存原因和返回地址
   ↓
跳转Trap Handler
   ↓
软件处理
   ↓
MRET
   ↓
恢复原程序

这部分以后就是理解 RTOS中断、任务切换和Linux异常入口 的基础。


PMP
哪段物理地址
谁可以访问
R / W / X分别是否允许

虚拟地址
   ↓
页表
   ↓
物理地址
Sv32
Sv39
Sv48
...

委托机制即M-mode可以告诉CPU：这些异常和中断不用找我，直接交给S-mode处理

