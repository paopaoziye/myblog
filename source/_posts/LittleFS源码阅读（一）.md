---
title: LittleFS源码阅读（一）
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
  - LittleFS
categories: 文件系统
updated: ''
img: /medias/featureimages/34.webp
date: 2026-09-10 16:04:57
keywords:
  - LittleFS
  - 文件系统
  - 源码阅读
summary: LittleFS文件系统源码阅读
---
# 文件系统
## LittleFS源码阅读
### LittleFS源码阅读（一）
#### 协议简介
**①引言**
>**概述**：`LittleFS`是一种面向嵌入式设备的**轻量级文件系统**，主要用于管理片内`Flash`和`SPI Flash`等**非易失性存储器**中的数据
{%list%}
LittleFS在底层Flash驱动之上提供文件和目录管理，使应用程序无需直接操作Flash地址即可完成文件创建、读写和删除等操作
{%endlist%}
>
{%right%}
LittleFS写入时不会直接覆盖旧数据，并结合元数据冗余与校验机制保证数据可靠性，同时动态分配擦写块实现掉电安全和磨损均衡
{%endright%}
{%warning%}
LittleFS本身不负责Flash的底层读写，需要用户提供read、prog、erase和sync等底层接口与实际Flash驱动对接
{%endwarning%}
```
读取：比较自由
写入：通常只能把 1 改成 0
擦除：必须整块擦除，才能重新变成 1
擦除次数：有限
断电：写到一半可能导致数据损坏
```
**②引言**
>**概述**：
{%list%}

{%endlist%}
>
{%right%}

{%endright%}
{%warning%}

{%endwarning%}