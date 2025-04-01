---
title: Linux内核驱动（一）
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
  - Linux内核
categories: 编程语言
keywords: 文章关键词
updated: ''
img: /medias/featureimages/0.webp
date:
summary: 预处理器
---
# Linux内核驱动
## Linux内核驱动（一）
### 1.引言
#### 1.1
按照硬件设备的具体工作方式，读写设备的寄存器，完成对应的功能
如果有操作系统，必须按照相应的架构设计驱动，将其融入内核
统一的系统调用接口访问各种设备

字符设备，块设备和网络设备
字符设备：必须按照串行顺序依次访问的设备，如鼠标
块设备：可以按照任意顺序访问，以块为单位进行操作，如硬盘
网络设备：使用套接字与内核通信，面向数据包的接收和发送设计

被映射到对应文件系统的文件和目录，通过文件系统的系统调用接口进行访问

哈佛结构：将程序指令和数据分开存储，可以有不同的数据宽度，并且有独立的程序总线和数据总线

软实时：中断、软中断和临界区等原子上下文，进程无法抢占执行

内核抢占


#### 1.2内核模块
模块本身不被编译入内核映像，但是一旦加载，就和内核其他部分完全一致
动态加载
