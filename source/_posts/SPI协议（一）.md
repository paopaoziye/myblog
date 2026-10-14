---
title: SPI协议（一）
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
  - 串行协议
categories: 通信协议
keywords:
  - SPI
  - 串行通信
  - 通信协议
  - 时序
updated: ''
img: /medias/featureimages/29.webp
date: 2026-07-27 17:47:22
summary: SPI 总线通信模式、时序与数据传输
---
# 串行协议
## SPI协议
### SPI协议（一）
#### 协议简介
**①引言**
>**概述**：也称为**串行外设接口**，是一种常用的**同步全双工串行通信方式**，主要用于`MCU`与**外围器件**之间的**短距离高速通信**
{%list%}
典型SPI通常由SCLK、MOSI、MISO和CS/NSS四根信号线组成，分别用于提供同步时钟、发送数据、接收数据和片选
{%endlist%}
>`SPI`将设备分为**主设备和从设备**，前者负责产生**时钟信号**并控制**片选信号**，后者主要根据前者提供的时钟**完成数据收发**

>`CS/NSS`为片选信号，通常由主机控制且**低电平有效**，主机通过拉低对应`CS`选择从设备，**通信结束**后再将其拉高
{%right%}
SPI结构简单、协议开销较小，支持较高的通信速率和全双工数据传输，适合MCU与高速外设之间进行高效的数据交换
{%endright%}
{%warning%}
SPI缺少统一的设备寻址、错误校验和总线仲裁机制，连接多个从设备时通常需要增加独立片选线，不适合复杂的多节点通信场景
{%endwarning%}
**②帧格式**
>**概述**：`SPI`没有**统一固定的帧格式**，一次通信通常由`CS`有效开始，在`SCLK`驱动下连续**传输若干位数据**，并在`CS`失效后结束
{%list%}
SPI本身主要规定基本的数据传输时序即时钟极性CPOL、时钟相位CPHA、传输顺序和数据宽度，保证主从设备安全完成数据交互
{%endlist%}
>**时钟极性**规定`SCLK`在**空闲状态**下保持高电平还是低电平，**时钟相位**规定数据在`SCLK`的第一个还是第二个**有效边沿**进行采样

>**传输顺序**规定数据按`MSB First`还是`LSB First`逐位发送，**数据宽度**规定一次基本传输包含的**有效数据位数**，如`8 bit`或`16 bit`
{%right%}
SPI对帧内容限制较少，不同外设可以根据自身需求灵活定义命令、地址和数据等字段，具体结合对应的数据手册确定实际通信格式
{%endright%}
>以`W25Q64`存储器为例，其**读数据指令**通常为`03H:[24位地址]:[数据]`，其中`03H`为读操作码
{%warning%}
主从设备的CPOL、CPHA、传输顺序和数据宽度必须保持一致，否则可能导致数据错位或通信异常
{%endwarning%}
**③收发流程**
>**概述**：`SPI`采用**全双工同步通信**，主机在产生`SCLK`的同时，通过`MOSI`**发送数据**，并通过`MISO`**同步接收**从机返回的数据
{%list%}
SPI收发本质上是主从设备的移位寄存器随SCLK同步移位，每个时钟周期同时完成一位数据的发送和接收
{%endlist%}
>`SPI`收发流程为`CPU -> TXDR -> TX FIFO -> TX Shift Register -> MOSI`和`MISO -> RX Shift Register -> RX FIFO -> RXDR -> CPU`

>`SPI`收发过程中，可通过`TXE`、`TXP`、`RXNE`、`RXP`、`RXWNE`和`BSY/EOT`等标志位判断**收发缓冲区状态**及**传输是否完成**

>`TXE`表示**发送数据寄存器为空**，`TXP`表示`TX FIFO`中存在**可写空间**，`RXNE`表示**接收数据寄存器非空**

>`RXWNE`表示`RX FIFO`中至少存在**一个完整的数据字**，`BSY`表示`SPI`当前仍处于**数据传输状态**，`EOT`表示**本次配置的数据传输结束**
{%right%}
TX/RX FIFO可在CPU与移位寄存器之间缓存数据，减少CPU频繁访问数据寄存器的开销，但是不是所有SPI都支持TX/RX FIFO
{%endright%}
{%warning%}
SPI接收数据时仍需要主机持续产生SCLK，因此纯接收场景下通常也需要发送Dummy Data以提供传输时钟
{%endwarning%}
**④错误标志**
>**概述**：`SPI`在通信过程中可通过`OVR`、`UDR`和`MODF`等错误标志判断是否发生**接收溢出**、**发送下溢**和**模式冲突**
{%list%}
常见SPI错误主要集中在收发缓冲、主从模式和总线状态等方面，可结合对应标志位进行定位
{%endlist%}
>`OVR`：表示**旧的接收数据尚未及时读取**时新的数据再次到达即发生**接收溢出**，通常由`CPU`**处理不及时**或**接收速率过高**引起

>`UDR`：表示需要发送数据时发送端**未及时提供新的数据**即发生**发送下溢**，通常由**数据准备不及时**或**从机响应速度不足**引起

>`MODF`：表示`SPI`发生**主从模式冲突**，通常与主机模式下`NSS/CS`**状态异常**或**多个主设备同时驱动总线**有关
{%right%}
SPI协议本身不规定CRC校验，但部分SPI控制器支持硬件CRC功能，启用后可通过CRCERR等标志判断是否发生CRC校验错误
{%endright%}
{%warning%}
不同SPI控制器支持的错误类型并不完全一致，部分标志仅在特定工作模式或功能开启后才会产生
{%endwarning%}
**⑤功能扩展**
>**概述**：为了**减少引脚数量或提高数据吞吐率**，`SPI`又发展出了`3-Wire SPI`、`Dual SPI`、`Quad SPI`和`OctoSPI`等扩展形式
{%list%}
3-Wire SPI主要用于减少引脚占用，而Dual/Quad/OctoSPI主要通过增加并行数据线提高单位时钟周期的数据传输能力简洁一点
{%endlist%}
>`3-Wire SPI`：将`MOSI`和`MISO`合并为一根**双向数据线**`SDIO`，以减少引脚占用，变为**半双工通信**

>`Dual SPI`、`Quad SPI`和`OctoSPI`分别使用`2`、`4`、`8`根数据线**并行传输**，以提高**单位时钟周期的数据传输能力**
{%right%}
Dual/Quad/OctoSPI可在指令、地址和数据阶段使用不同数量的数据线，并可结合DDR/DTR进一步提高传输带宽
{%endright%}
{%warning%}
3-Wire SPI、Dual SPI、Quad SPI和OctoSPI并非所有设备都支持，具体的数据线切换、Dummy Cycle和时钟要求需参考芯片手册
{%endwarning%}