---
title: Modbus协议（一）
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
keywords:
  - Modbus
updated: ''
img: /medias/featureimages/29.webp
date: 2026-09-11 13:12:51
summary: Modbus Application Protocol简介
---
# 通信协议
## Modbus协议
### Modbus协议（一）
#### 协议简介
**①引言**
>**概述**：一种广泛用于**工业设备**之间通信的**应用层协议**，采用**请求响应模型**，其通信规则由`Modbus Application Protocol`统一定义
{%list%}
Modbus Application Protocol是整个Modbus协议族共同遵守的应用层规则，统一定义数据模型、功能码及PDU等核心内容
{%endlist%}
>`PDU`也称为**协议数据单元**，是由`Modbus Application Protocol`定义的**核心报文结构**，由**功能码**和**数据字段**组成
{%right%}
实际传输时PDU会根据不同传输方式进一步封装为ADU，从而形成Modbus RTU、Modbus ASCII和Modbus TCP等实现形式
{%endright%}
>`ADU`也称为**应用数据单元**，是`PDU`结合**具体传输方式**所需的**地址**、**校验码**或**头部信息**后形成的完整`Modbus`报文
{%warning%}
Modbus位于应用层，主要负责定义通信规则，实际通信仍需依赖下层的传输机制和物理接口完成数据发送与信号传输
{%endwarning%}
>如`Modbus RTU`可通过`UART`完成字节的**串行收发**，再通过`RS-485`收发器转换为**差分信号**并在物理链路上传输

**②数据模型**
>**概述**：`Modbus`通过统一的**数据模型**描述设备**对外可访问的数据**，规定不同数据对象的**数据位宽**和**读写特性**
{%list%}
Modbus数据模型将设备数据分为Coil、Discrete Input、Input Register和Holding Register四类
{%endlist%}
>`Coil`：也称为**线圈**，属于`1 bit`的**可读写数据对象**，用于表示设备中可**由通信端读取或修改的二值状态**如**启停控制位**

>`Discrete Input`：也称为**离散输入**，属于`1 bit`的**只读数据对象**，用于表示设备中可**由通信端读取的二值状态**如**限位开关状态**

>`Input Register`：也称为**输入寄存器**，属于`16 bit`的**只读数据对象**，用于表示设备**采集或测量得到的数据**如**当前温度值**

>`Holding Register`：也称为**保持寄存器**，属于`16 bit`的**可读写数据对象**，用于表示设备可**由通信端读写的数值数据**如**目标转速值**
{%right%}
Modbus数据模型将不同设备内部各不相同的数据统一抽象为标准类型，使通信双方能够以一致方式描述、定位和读写数据
{%endright%}
{%warning%}
数据模型描述的是设备对外提供的数据视图和访问方式，用于统一通信接口，并不等同于设备内部真实的数据组织与存储结构
{%endwarning%}
**③地址模型**
>**概述**：`Modbus`通过**数据地址**定位数据模型中的**具体数据对象**，并为不同类型的数据划分**独立的地址空间**
{%list%}
传统Modbus通过不同的地址前缀区分四类数据对象，并配合后续编号标识具体数据对象，这种编号方式也称为参考地址
{%endlist%}
>比如`0xxxx`均表示**线圈对象**，`1xxxx`均表示**离散输入对象**，`3xxxx`均表示**输入寄存器对象**，`4xxxx`均表示**保持寄存器对象**
{%right%}
参考地址仅用于区分和描述数据对象，实际写入PDU的是从0开始的16 bit协议地址，也称为偏移地址，并不会加上地址前缀
{%endright%}
>具体访问哪一类数据主要**由功能码决定**，再加上每个数据类型都有**独立的地址空间**，所以不需要**地址前缀**
{%warning%}
设备手册中的地址表示方式并不完全统一，可能使用参考地址或协议地址，实际通信前需先确认其地址编号方式
{%endwarning%}

**④PDU报文结构**
>**概述**：`PDU`主要由`1 Byte`的**功能码**和**长度可变的数据字段**组成，前者不仅决定**操作类型**，还决定**后续数据字段的解析方式**
{%list%}
功能码按用途可分为读取类、写入类和诊断管理类等，数据字段则携带地址、数量、数据值等具体操作参数
{%endlist%}
>`0x01`、`0x02`、`0x03`和`0x04`分别用于**读取一个或多个**`Coil`、`Discrete Input`、`Holding Register`和`Input Register`

>`0x05`和`0x06`用于**写入单个**`Coil`和`Holding Register`，`0x0F`和`0x10`用于**写入多个**`Coil`和`Holding Register`

{%right%}
Modbus功能码按分配方式可分为公共功能码、用户自定义功能码和保留功能码，分别用于标准功能、私有扩展和协议保留
{%endright%}
{%warning%}
Modbus标准统一规定各功能码的含义，但具体设备实际支持哪些功能码以及对应功能范围，仍由设备厂商决定
{%endwarning%}

**⑤请求与响应**
>**概述**：`Modbus`将设备分为`Server`和`Client`，其中`Client`负责**主动发起请求**，`Server`负责**接收请求**、**执行对应操作并返回响应**
{%list%}
同一功能通常具有请求PDU和响应PDU两种形式，两者使用相同功能码，但数据字段的结构会根据通信方向而变化
{%endlist%}
{%right%}
请求与响应模型具有流程清晰、实现简单、通信可控且便于确认执行结果等特点，适合工业设备的周期性轮询与控制
{%endright%}
{%warning%}
当请求因功能码不支持、数据地址无效或参数错误等原因无法正常执行时，Server会通过异常响应告知具体错误原因
{%endwarning%}
>**异常响应**的功能码会在原功能码基础上将**最高位**置`1`，并携带`1 Byte`的**异常编码**作为数据字段
