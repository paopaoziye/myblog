---
title: Uboot源码阅读（一）
draft: true
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
  - Uboot
categories: BootLoader
keywords:
  - U-Boot
  - BootLoader
  - 启动流程
updated: ''
img: /medias/featureimages/39.webp
date: 2026-09-03 00:00:00
summary: U-Boot 启动流程源码阅读
---
# BootLoader
## U-Boot源码阅读
### U-Boot源码阅读（一）
#### 1.引言
**①简介**
>**概述**：一个常见的嵌入式平台`Bootloader`，主要用于负责**初始化必要硬件**、加载`Linux`**内核和设备树等**并最终启动`Linux`内核

U-Boot 负责将 Linux 所需的 Kernel、DTB、initramfs 等镜像加载到内存，设置 bootargs 和必要的 CPU/硬件状态，然后跳转到 Kernel entry；
{%list%}
由于刚上电时DDR还不能用，片内SRAM又太小，放不下完整U-Boot，很多平台上的U-Boot通常分为SPL和U-Boot proper两个阶段
{%endlist%}
>`SPL`：精简版`U-Boot`，通常被`BootROM`中的程序加载到**片内**`SRAM`，主要负责**初始化**`DDR`等关键硬件，然后加载完整`U-Boot`

>`U-Boot proper`：完整的`U-Boot`，负责`MMC`、**网络**、**文件系统**和**环境变量**等功能，并最终加载`Linux Kernel`、`DTB`等
```
基本硬件初始化；
DRAM 初始化后的系统初始化；
从 Flash / eMMC / SD / NAND / 网络读取文件；
解析环境变量；
加载 Linux Kernel；
加载 Device Tree；
加载 initramfs；
设置 Linux 启动参数；
最终跳转到 Linux Kernel；
提供命令行用于调试、烧写、升级
```



U-Boot 通过 bootargs 向 Kernel 传递启动参数，告诉它控制台、RootFS 位置和挂载方式等信息
传递启动参数setenv bootargs \
"console=ttyS2,1500000 root=/dev/mmcblk0p2 rw rootwait"

有一套环境变量Environment Variables，如bootcmd、bootargs和bootdelay

U-Boot 启动 Linux 的命令有bootm、booti和bootz



SPL
+
U-Boot proper
由于片内SRAM非常小，且DDR尚未初始化，所以需要SPL，SPL 是精简版 U-Boot，主要负责初始化 DDR，并加载完整的 U-Boot
Bootloader 最核心的动作之一就是“从存储器搬到 RAM”
{%right%}
提供命令行用于调试、烧写、升级
{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}
```
DDR 还没初始化
时钟还没完整配置
Pinmux 还没配置
eMMC/SD 驱动还没准备好
设备树还没加载
Kernel 还不知道放在哪里
bootargs 还没有准备
```
U-Boot会传递一套启动参数给Kernel
```
U-Boot
 │
 ├─ 初始化 CPU / Cache / MMU 的相关环境
 │
 ├─ 初始化串口
 │
 ├─ 初始化 GPIO
 │
 ├─ 初始化 MMC
 │
 ├─ 初始化 USB
 │
 ├─ 初始化 Ethernet
 │
 ├─ 读取 environment
 │
 ├─ 判断启动方式
 │
 ├─ 加载 Kernel
 │
 ├─ 加载 DTB
 │
 ├─ 加载 initramfs
 │
 └─ 启动 Kernel
```
```
U-Boot
 │
 ├── 搬 Kernel → DDR
 ├── 搬 DTB → DDR
 ├── 搬 initramfs → DDR（如果有）
 └── 准备 bootargs
```
**②Linux启动流程**
>**概述**：主要流程为`Reset -> BootROM -> SPL -> U-Boot proper -> Linux Kernel -> RootFS`，实际上是一个逐级增强的过程
{%list%}

{%endlist%}
>CPU Reset之后首先进入SoC厂商固化在芯片内部的BootROM，主要负责读取启动模式、确定启动介质，读取下一阶段程序，将其放入SRAM并跳转过去执行
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}