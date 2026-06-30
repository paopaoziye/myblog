---
title: Zephyr源码阅读（一）
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
  - RTOS
  - Zephyr
categories: RTOS
keywords: 文章关键词
updated: ''
img: /medias/featureimages/10.webp
date:
summary: Zephyr移植
---
# RTOS
## Zephyr源码阅读
### Zephyr源码阅读（一）
#### 1.引言
**①简介**
>**概述**：由`Linux`基金会托管的开源`RTOS`，可以在[官方仓库](github.com/zephyrproject-rtos/zephyr)获取其源码，**代码架构**如下所示
{%list%}
Zephyr采用类似Linux的Kconfig配置系统，支持模块化开发，并且包含丰富的组件如蓝牙和Wi-Fi等
{%endlist%}
{%right%}
Zephyr采用统一的驱动接口以及设备树，并且代码高度抽象，便于代码移植
{%endright%}
{%warning%}
由于其复杂的抽象层，Zephyr的RAM/Flash占用通常比FreeRTOS等较高
{%endwarning%}
```shell
zephyr/
├── .west/               #west工具的配置信息
├── bootloader/          #引导加载程序，通常为mcuboot负责验签和OTA升级
├── modules/             #外部组件如HAL库、加密库和文件系统等
├── tools/               #辅助工具如蓝牙测试工具等
└── zephyr/              #Zephyr核心仓库
    ├── arch/            #存放不同架构的底层代码如上下文切换和中断向量表初始化等
    ├── kernel/          #与硬件无关的内核代码如调度器和任务间通信等
    ├── include/         #包含了对外接口即所有API的头文件
    ├── boards/          #各种开发板的支持文件如设备树等
    ├── drivers/         #各种外设的驱动实现
    ├── dts/             #通用的设备树绑定文件
    ├── subsys/          #包含了许多可以使用的子系统如蓝牙协议栈和IP协议栈等
    └── ...
```
**②环境配置**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
**③简易工程**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
#### 2.启动流程
**①简介**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
```shell

```
**②环境配置**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
**③移植组件**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
