---
title: Freertos入门（四）
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
  - 操作系统
categories: 工作流
keywords: 文章关键词
updated: ''
img: /medias/featureimages/38.webp
date:
summary: 低功耗模式、软件定时器
---
# Freertos
## Freertos入门（四）
### 1.中断配置
#### 1.1
通常在空闲任务钩⼦函数中将处理器设置为低功耗模式来节省电能，为了与 FreeRTOS ⾃带的 Tickless 模式做区分，这⾥我暂且将这种低功耗的实现⽅法称之为通⽤低功耗模式

如果使⽤通⽤低功耗模式的话每个滴答定时器中断都会将处理器从低功耗模式中唤醒，反复的进入低功耗、退出低功耗

软件定时器
依赖于硬件的tick中断，tick中断会处理软件定时器
判断链表中是否有超时的定时器，有的话就调用对应的函数，但是这样就是在中断中，会影响效率，且不能休眠
唤醒一个timer任务（类似于空闲任务），timer就会调用对应函数
```c
static TimerHandle_t buzz_timer;
void main(void){
  buzz_init();
  int i = 0;
  while(1){
    i++;
    if(i == 100){
      buzzer(50,20);
    }
  }
}
void stop_buzz(TimerHandle_t buzz_timer){
  buzz_control(0);
}
void buzz_init(void){
  //创建定时器
  buzz_timer = xTimerCreate("a_timer",200,pdFALSE,NULL,stop_buzz);
}
void buzzer(int freq,int time_ms){
  //发出声音
  do_buzz();
  //启动定时器，一段时间后关闭声音
  xTimerChangePeriod(buzz_timer,time_ms,NULL);
}
```
### 2.软件定时器
#### 3.1引言
静态分配
configSUPPORT_STATIC_ALLOCATION
### 3.低功耗模式
#### 3.1