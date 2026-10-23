---
title: MCUboot源码阅读（一）
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
  - BootLoader
categories: BootLoader
keywords:
  - MCUboot
updated: ''
img: /medias/featureimages/13.webp
date: 2026-06-30 13:55:14
summary: MCUboot简介与移植
---
# BootLoader
## MCUboot源码阅读
### MCUboot源码阅读（一）
#### 简介与移植
**①引言**
>**概述**：一个面向`32`位`MCU`的**开源安全引导程序**，可以在[官方网站](https://github.com/mcu-tools/mcuboot)获取其源码，目录结构如下所示
{%list%}
MCUboot通过哈希校验与数字签名验证固件，并结合Flash分区与状态管理机制，实现固件升级、升级确认及失败回滚
{%endlist%}
{%right%}
MCUboot采用模块化、可裁剪设计，支持多种处理器架构及RTOS平台，升级策略灵活，具有良好的可移植性与扩展性
{%endright%}
{%warning%}
MCUboot需要占用额外的Flash空间，增加分区规划、密钥管理及平台移植的复杂度，且固件下载与传输需要依赖其他组件
{%endwarning%}
```tree
mcuboot/
│
├── boot/                  # Bootloader核心代码及平台适配
│   ├── bootutil/          # 核心引导逻辑：镜像验证、升级与回滚
│   │   ├── include/      # 核心数据结构与接口声明
│   │   └── src/          # 镜像管理、启动决策及升级算法
│   │
│   ├── boot_serial/      # 串口恢复与固件管理协议支持
│   ├── zephyr/           # Zephyr平台移植与启动程序
│   ├── nuttx/            # NuttX平台移植与启动程序
│   ├── mynewt/           # Apache Mynewt平台适配
│   ├── mbed/             # Mbed OS平台适配
│   ├── espressif/        # Espressif芯片平台适配
│   ├── cypress/          # Cypress/Infineon芯片平台适配
│   └── zcbor/            # CBOR数据编解码支持
│
├── scripts/              # 镜像处理与辅助工具
│   ├── imgtool/          # 镜像打包、签名及密钥管理
│   └── imgtool.py        # 镜像工具命令行入口
│
├── zephyr/               # Zephyr模块集成配置
├── ext/                  # 第三方密码学库及外部依赖
├── sim/                  # Bootloader模拟器与回归测试
├── samples/              # 示例工程与配置
│
├── ptest/                # Rust测试辅助程序
├── testplan/             # 平台测试计划
├── ci/                   # 持续集成与自动化测试脚本
├── .github/workflows/    # GitHub Actions工作流
│
├── docs/                 # 官方设计文档与移植指南
│
├── Cargo.toml            # Rust工作区构建配置
├── README.md             # 项目说明与使用指南
└── LICENSE               # Apache-2.0开源许可证
```
**②基本架构**
>**概述**：`MCUboot`采用**核心引导库**与**平台适配层**分离的模块化架构，通过统一的存储访问接口管理固件镜像
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}