---
title: ARM体系架构（六）
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
summary: AArch64的执行模型，主要围绕Armv8-A
---
# 处理器架构
## ARM体系架构
### ARM体系架构（六）
#### 执行模型
**①异常级别**
>**概述**：`Armv8-A`及后续`A-profile`用来划分处理器**当前特权权限层级**的机制，通常从`EL0`到`EL3`**权限逐级提高**
{%list%}
从架构特权角度看，EL0为非特权级，EL1-EL3为特权级，且Armv8-A中EL0和EL1是必须实现的，EL2和EL3是可选的
{%endlist%}
>`AArch64`没有类似`M-profile`中专门用于**异常处理**的`Handler Mode`，异常通常由`EL1-EL3`的软件处理
{%right%}
EL1通常用于运行操作系统，EL2通常用于运行Hypervisor，EL3通常用于运行Platform Firmware
{%endright%}
>在`EL1-EL3`下可以读取`CurrentEL`寄存器获取**当前异常级别**，`EL0`不能直接读取该寄存器
{%warning%}
当前异常级别只能在异常进入或异常返回时改变，且异常进入和异常返回不一定改变异常级别
{%endwarning%}
>`AArch64`提供`SVC`、`HVC`和`SMC`等**同步异常生成指令**，其目标异常级别分别为`EL1`、`EL2`和`EL3`

>`EL0`不能执行`HVC`和`SMC`，而`EL1-EL3`在相应`EL`**存在且配置允许时**可以执行`HVC`和`SMC`
{%wrong%}
异常进入只能保持当前EL或进入更高EL，不能进入更低EL，比如EL2下调用SVC还是停留在EL2
{%endwrong%}
**②栈指针模型**
>**概述**：`AArch64`为**各异常级别**提供对应的栈指针寄存器`SP_EL0-SP_EL3`，`SP`表示当前**被选中的**栈指针寄存器
{%list%}
EL0只能使用SP_EL0，在EL1-EL3，PSTATE.SP=0表示选择SP_EL0，PSTATE.SP=1表示选择当前异常级别的SP_ELx
{%endlist%}
>对于`EL1-EL3`，如果`SP`使用`SP_EL0`，称为`ELxt`，如果使用`SP_ELx`，称为`ELxh`

>`EL1-EL3`的软件可以通过`SPSel`选择`SP_EL0`或当前异常级别的`SP_ELx`
{%right%}
架构允许先用SP_ELx完成最早期异常上下文保存，再切换到SP_EL0进行后续处理
{%endright%}
{%warning%}
异常进入目标EL时会自动选择目标EL的SP_ELx，且不能随意选择其他非EL0的栈指针
{%endwarning%}
{%wrong%}
来自当前EL的异常会根据异常发生前使用SP_EL0还是SP_ELx选择不同的异常向量入口
{%endwrong%}

**③处理器状态**
>**概述**：`AArch64`使用`PSTATE`保存影响**指令执行**、**条件判断**、**异常响应**以及**执行环境选择**的一组处理器状态
{%list%}
PSTATE包含很多独立的状态字段，可以通过不同的名字或者System Register接口访问
{%endlist%}
>

>

>

>
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}
```text
PSTATE
│
├── NZCV        条件标志
│
├── DAIF        异常屏蔽状态
│
├── EL          当前 Exception Level
│
├── SP          当前 SP 选择
│
├── SS          Single-step 状态
├── IL          Illegal Execution 状态
│
└── PAN / UAO / DIT / ...
    各种架构扩展增加的状态
```
