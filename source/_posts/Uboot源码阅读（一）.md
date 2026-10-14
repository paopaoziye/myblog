---
title: Uboot源码阅读（一）
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
img: /medias/featureimages/32.webp
date: 2026-09-03 00:00:00
summary: U-Boot工作原理简介
---
# BootLoader
## U-Boot源码阅读
### U-Boot源码阅读（一）
#### 简介
**①引言**
>**概述**：一个用于启动`Linux`内核的`Bootloader`，主要用于负责**初始化必要硬件**并加载`Linux Kernel`、**设备树**和**根文件系统**等
{%list%}
由于刚上电时DDR未初始化且片内SRAM空间不足以容纳完整U-Boot，因此U-Boot通常分为SPL和U-Boot proper两个阶段
{%endlist%}
>`SPL`：本质上是一个**精简版**`U-Boot`，主要负责**初始化**`DDR`等关键硬件，然后加载`U-Boot proper`到`DDR`中

>`U-Boot proper`：完整的`U-Boot`，提供`MMC`、**网络通信**、**文件系统**和**环境变量**等功能，并最终加载`Linux Kernel`、`DTB`等资源
{%right%}
可以在U-Boot自动启动前按键打断启动过程进入其Shell，用于修改启动配置以及进行调试、烧写和升级
{%endright%}
{%warning%}
由于CPU上电后DDR、存储设备等尚未完成初始化，因此需要U-Boot先建立基本运行环境，再加载并启动Linux内核
{%endwarning%}
```tree
U-Boot proper
 │
 ├─ 完成 CPU / 时钟 / Cache 等基础运行环境初始化
 │
 ├─ 初始化串口和控制台
 │
 ├─ 确认 / 初始化 DRAM
 │
 ├─ 将 U-Boot 重定位到 DRAM
 │
 ├─ 初始化 malloc、Driver Model 等运行环境
 │
 ├─ 读取 environment
 │
 ├─ 初始化 / 探测 MMC、USB、Ethernet 等启动设备
 │
 ├─ 执行 bootcmd / bootflow，选择启动方式
 │
 ├─ 加载 Kernel
 │
 ├─ 加载 DTB
 │
 ├─ 可选：加载 initramfs
 │
 ├─ 设置 bootargs 等启动参数
 │
 └─ 跳转到 Kernel 入口，启动 Linux
```
**②Linux启动流程**
>**概述**：**系统上电后**会依次经历`BootROM`、`SPL`、`U-Boot proper`、`Linux Kernel`和**用户空间**等阶段，最终完成**整个系统的启动**
{%list%}
Bootloader阶段负责建立启动环境，Kernel阶段负责初始化内核并挂载根文件系统，用户空间阶段负责启动init及各类系统服务
{%endlist%}
>`BootROM`为固化在`SoC`内部的启动代码，负责在上电后完成**最基础的启动检查**，并从指定**启动介质**加载下一阶段`Bootloader`

>`SPL`和`U-Boot proper`通常存放在`SPI Flash`等**启动介质中**，前者被`BootROM`加载到片内`SRAM`中，后者被前者加载到`DDR`中
{%right%}
U-Boot在启动Linux前会通过bootargs等方式向内核传递串口、根文件系统位置和启动模式等参数，同时提供DTB描述硬件信息
{%endright%}
>`U-boot`还可以加载`initramfs`给`Linux Kernel`使用，本质上也是一种**根文件系统**，可作为`Kernel`与`RootFS`之间的**临时启动环境**

>一些**体积较小**、**功能相对简单**的嵌入式系统也可以直接将`initramfs`作为最终`RootFS`使用，例如`BusyBox`小系统
{%warning%}
Linux Kernel开始运行并不代表整个系统已经启动完成，还需要挂载RootFS并执行/sbin/init才能真正进入用户空间
{%endwarning%}
{%wrong%}
bootargs中的root=通常用于指定最终RootFS的位置，而initramfs则是内核启动早期使用的内存根文件系统
{%endwrong%}
**③环境变量**
>**概述**：`U-Boot`环境变量用于保存**控制系统启动**所需的各类参数，如**启动命令**、**内核参数**、**加载地址**和**网络配置**等
{%list%}
U-Boot常用的环境变量有bootcmd、bootargs、kernel_addr_r、fdt_addr_r和ramdisk_addr_r等
{%endlist%}
>`bootcmd`为自启动时执行的**启动脚本**，`bootargs`用于向`Linux Kernel`传递**控制台**、**根文件系统**和**启动模式**等参数

>`kernel_addr_r`、`fdt_addr_r`和`ramdisk_addr_r`分别用于指定`Kernel`、`DTB`和`initramfs`在`DDR`中的**加载地址**
{%right%}
可以在U-Boot Shell中使用printenv、setenv和saveenv分别查看、修改和保存环境变量，如setenv bootdelay 5
{%endright%}
{%warning%}
环境变量修改后通常被保存在RAM中，只有执行saveenv保存操作后，才会写入配置好的持久化存储后端，如SPI Flash、eMMC等
{%endwarning%}
{%wrong%}
kernel_addr_r、fdt_addr_r和ramdisk_addr_r是常见的环境变量命名约定，具体变量名称和默认值可能因开发板配置而不同
{%endwrong%}
**④启动命令**
>**概述**：`U-Boot`提供`booti`、`bootz`和`bootm`等不同的启动命令，分别对应不同的**镜像格式**与**启动方式**
{%list%}
booti通常用于启动Image，bootz用于启动zImage，而bootm主要用于启动uImage和FIT Imag
{%endlist%}
>`Image`为`Linux`内核编译生成的**直接可启动镜像**，`zImage`为**经过压缩**并带有**自解压代码**的`Linux`内核镜像

>`uImage`在Linux内核镜像外加入`U-Boot Legacy Header`的封装格式，其中包含**加载地址**、**入口地址**和**镜像类型**等启动信息

>`FIT Image`是一种可同时封装`Kernel`、`DTB`、`initramfs`及**配置**、**校验**和**签名信息**的`U-Boot`镜像格式，并支持**多套启动配置**
{%right%}
Image和zImage主要描述Linux内核本身的镜像形式，而uImage和FIT Image则进一步加入了供U-Boot解析的镜像描述
{%endright%}
{%warning%}
uImage和FIT Image可以封装压缩后的内核数据，启动时由U-Boot根据镜像中的压缩信息完成解压并继续启动内核
{%endwarning%}

**⑤启动脚本**
>**概述**：用于**组织系统启动**所需的一系列命令，通常包括**选择启动设备**、**加载启动资源**、**设置启动参数**并最终启动`Linux Kernel`
{%list%}
bootcmd通常保存系统自动启动时执行的启动脚本，也可以通过run调用其他环境变量中定义的子脚本，典型脚本如下所示
{%endlist%}
{%right%}
启动脚本通常由设备操作命令、文件加载命令和内核启动命令三类命令组成，如mmc、load和bootx
{%endright%}
>`mmc`：用于管理和操作`MMC`设备，如**选择设备**、**扫描设备**和**查看分区**等，类似的设备操作命令还有`usb`、`nvme`、`sf`和`nand`

>`load`：用于从指定设备的**文件系统**中读取`Kernel`、`DTB`等文件并加载到`DDR`，类似的命令还有`fatload`、`ext4load`和`tftp`

>`bootx`：可泛指`booti`、`bootz`、`bootm`等启动命令，用于**启动已加载到内存中的系统镜像**并将控制权交给内核
{%warning%}
启动脚本中的设备编号、分区号、文件名和加载地址必须与实际硬件及存储布局保持一致，否则会导致启动资源加载失败
{%endwarning%}
```tree
MMC0
│
├─ Partition 1
│    ├─ Image           # Linux Kernel 镜像
│    ├─ board.dtb       # 设备树文件
│    └─ initramfs.img   # 启动早期使用的内存根文件系统
│
└─ Partition 2
     └─ RootFS          # 最终根文件系统
```
```uboot
# 选择编号为 0 的 MMC 设备，通常对应 eMMC 或 SD 卡
mmc dev 0
# 重新扫描 MMC0，确认设备和分区可以正常访问
mmc rescan
# 从 MMC0 的第 1 分区读取 Image
# 并将 Linux Kernel 加载到 kernel_addr_r 指定的 DDR 地址
load mmc 0:1 ${kernel_addr_r} Image
# 从 MMC0 的第 1 分区读取 board.dtb
# 并将设备树加载到 fdt_addr_r 指定的 DDR 地址
load mmc 0:1 ${fdt_addr_r} board.dtb
# 从 MMC0 的第 1 分区读取 initramfs.img
# 并将其加载到 ramdisk_addr_r 指定的 DDR 地址
# load 执行完成后，${filesize} 会保存本次加载的 initramfs 文件大小
load mmc 0:1 ${ramdisk_addr_r} initramfs.img
# 设置传递给 Linux Kernel 的启动参数：
# console=ttyS0,115200  → 使用 ttyS0 作为控制台，波特率为 115200
# root=/dev/mmcblk0p2   → 最终 RootFS 位于 MMC0 的第 2 分区
# rw                    → 以可读写方式挂载 RootFS
# rootwait              → 等待根文件系统所在设备初始化完成
setenv bootargs "console=ttyS0,115200 root=/dev/mmcblk0p2 rw rootwait"
# 启动 Linux Kernel：
# ${kernel_addr_r}              → Kernel 所在地址
# ${ramdisk_addr_r}:${filesize} → initramfs 的起始地址和大小
# ${fdt_addr_r}                 → DTB 所在地址
# 执行后 U-Boot 将控制权交给 Linux Kernel
booti ${kernel_addr_r} ${ramdisk_addr_r}:${filesize} ${fdt_addr_r}
```
