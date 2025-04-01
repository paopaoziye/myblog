---
title: STM32入门（三）
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
  - STM32
categories: 嵌入式
keywords: 文章关键词
updated: ''
img: /medias/featureimages/28.webp
date:
summary: 中断、定时器和ADC
---
# STM32入门
## STM32入门（三）
### 1.中断系统
#### 1.1引言
**①简介**
>**概述**：一种由**硬件或软件**引发的事件，使得处理器**中断当前程序**并执行**另一个特定的程序**
{%list%}
中断分为硬件中断和软件中断，前者由硬件产生，后者由软件指令触发
{%endlist%}
{%right%}
中断机制可以提高系统响应速度，确保重要事件能够得到及时处理
{%endright%}
{%warning%}
如下所示，非中断模式下led_blink过程中串口不能接收数据，可能会导致数据丢失，使用中断可以避免这种情况
{%endwarning%}
```c
/* 非中断模式 */
int main(void){
  usart_init();
  led_init();
  while(1){
    led_blink();
    usart_receive_byte();
  }
}

```
```c
/* 中断模式 */
int main(void){
  usart_init();
  led_init();
  while(1){
    led_blink();
  }
}
void USART1_IRQHandler(void){
  if(USART_GetFlagStatus(USART1,USART_FLAG_RXNE) == SET){
    usart_receive_byte();
  }
}
```

**②NVIC**
>**概述**：一种**中断控制器**，给予中断**不同的优先级**，并控制中断的**使能**以及**执行顺序**等
{%list%}
中断优先级由4bit表示，分为抢占优先级和子优先级，各自占用的位数由中断分组表示
{%endlist%}
>**分组N**情况下**抢占优先级**占`N`位，**子优先级**占`4-N`位
{%right%}
STM32F103C8T6中，NVIC模块属于系统的基本功能模块，不需要手动开启时钟
{%endright%}
{%warning%}
抢占优先级更高的中断可以打断正在执行的中断，子优先级更高的中断优先执行但是不能打断正在执行的中断
{%endwarning%}
>**优先级相同**的中断按照`FIFO`顺序执行

![模块结构](/image/stm32_22.png)
**③串口中断**
>**概述**：使用**串口中断**接收数据，并根据**接收到的数据**改变LED灯**闪烁频率**
{%list%}
根据用户手册，每个串口都有一个全局中断，当对应标志位被设置时触发
{%endlist%}
{%right%}
为了使用USART1的中断，需要使对应标志位能够触发中断，并配置NVIC使能串口中断并设置其优先级
{%endright%}
{%warning%}
编写串口中断处理函数时，需要判断是哪个标志位触发的中断，并清除该标志（少部分标志位需要手动清除）
{%endwarning%}
```c
//主函数
include "delay.h"
uint32_t blink_interval = 1000;
int main(void){
  //中断分组，在misc.c中
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
  led_init();
  usart1_init();
  while(1){
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_RESET);
    delay_us(blink_interval);
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_SET);
    delay_us(blink_interval);
  }
}
```
```c
//USART1初始化
void usart1_init(){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_9;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);

  gpio_init_struct.GPIO_Pin = GPIO_Pin_10;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPU;
  GPIO_Init(GPIOA,&gpio_init_struct);

  RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1,ENABLE);
  USART_InitTypeDef usart_init_struct;
  usart_init_struct.USART_BaudRate = 115200;
  usart_init_struct.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
  usart_init_struct.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
  usart_init_struct.USART_Parity = USART_Parity_No;
  usart_init_struct.USART_Stop_Bits = USART_StopBits_1;
  usart_init_struct.USART_Word_Length = USART_WordLength_8b;
  USART_Init(USART1,&usart_init_struct);

  USART_Cmd(USART1,ENABLE);
  //配置RxNE标志位中断，当其置1时产生中断
  USART_ITConfig(USART1,USART_IT_RxNE,ENABLE);
  //配置NVIC模块
  NVIC_InitTypeDef nvic_init_struct;
  nvic_init_struct.NVIC_IRQChannel = USART1_IRQn; //中断名称，可见stm32f10x.h
  nvic_init_struct.NVIC_IRQChannelPreemptionPriority = 0;
  nvic_init_struct.NVIC_IRQChannelSubPriority = 0;
  nvic_init_struct.NVIC_IRQChannelCmd = ENABLE;
  NVIC_Init(&nvic_init_struct);
}
//LED初始化
void led_init(void){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOC,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_13;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_Out_OD;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOC,&gpio_init_struct);
}
```
```c
//中断处理函数
void USART1_IRQHandler(void){
  //判断RxNE标志位
  if(USART_GetFlagStatus(USART1,USART_FLAG_RXNE) == SET){
    uint8_t data = usart_receive_data(USART1);
    if(data == '0'){
      blink_interval = 1000;
    }
    if(data == '1'){
      blink_interval = 200;
    }
    if(data == '2'){
      blink_interval = 50;
    }
  }
}
```
#### 1.2EXTI
**①简介**
>**概述**：全称为**外部中断和事件控制器**，捕捉单片机**引脚的电平变化**从而产生**中断和事件**
{%list%}
一个引脚可以通过GPIO模块进行输入输出，也可以通过EXTI模块触发中断和事件
{%endlist%}
{%right%}
一个EXTI有20条信号线EXTIx，每条信号线都一组中断源，使用时需要通过选择AFIO其中一个中断源
{%endright%}
>如`EXTI0`的**中断源**为`PA0`、`PB0`、`PC0`和`PD0`
{%warning%}
EXTI0-EXTI4都有自己的对应中断，EXTI5-EXTI9共用EXTI9_5中断，EXTI10-EXTI15共用EXTI15_10中断
{%endwarning%}
![EXTI线结构](/image/stm32_23.png)
**②按钮实验**
>**概述**：使用**两个按钮**触发**外部中断**，从而控制**LED灯的状态**
{%list%}
为了使用外部中断，需要开启AFIO选择中断源，并配置EXTI和NVIC
{%endlist%}
{%right%}
配置EXTI需要选择捕获的是上升沿还是下降沿
{%endright%}
{%warning%}
在EXTI中断处理程序中需要手动清除对应标志位
{%endwarning%}
```c
//按钮实验
include "delay.h"
int main(void){
  //中断分组，在misc.c中
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
  led_init();
  button_init();
  while(1){
  }
}
```
```c
//LED灯初始化
void led_init(void){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOC,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_13;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_Out_OD;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOC,&gpio_init_struct);
}
//按钮初始化
void button_init(void){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_5 |GPIO_Pin_6;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPU;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //开启AFIO时钟，选择外部中断的中断源
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO,ENABLE);
  GPIO_EXTILineConfig(GPIO_PortSourceGPIOA,GPIO_PinSource5);
  GPIO_EXTILineConfig(GPIO_PortSourceGPIOA,GPIO_PinSource6);
  //配置EXTI
  EXTI_InitTypeDef exti_init_struct;
  exti_init_struct.EXTI_Line = EXTI_Line5;
  exti_init_struct.EXTI_Mode = EXTI_Mode_Interrupt;
  exti_init_struct.EXTI_Trigger = EXTI_Trigger_Rising;
  exti_init_struct.EXTI_LineCmd = ENABLE;
  EXTI_Init(&exti_init_struct);
  exti_init_struct.EXTI_Line = EXTI_Line6;
  exti_init_struct.EXTI_Mode = EXTI_Mode_Interrupt;
  exti_init_struct.EXTI_Trigger = EXTI_Trigger_Rising;
  exti_init_struct.EXTI_LineCmd = ENABLE;
  EXTI_Init(&exti_init_struct);
  //配置NVIC模块
  NVIC_InitTypeDef nvic_init_struct;
  nvic_init_struct.NVIC_IRQChannel = EXTI9_5_IRQn; //中断名称，可见stm32f10x.h
  nvic_init_struct.NVIC_IRQChannelPreemptionPriority = 0;
  nvic_init_struct.NVIC_IRQChannelSubPriority = 0;
  nvic_init_struct.NVIC_IRQChannelCmd = ENABLE;
  NVIC_Init(&nvic_init_struct);
}
```
```c
void EXTI9_5_IRQHandler(void){
  if(EXTI_GetFlagStatus(EXTI_Line5) == SET){
    EXTI_ClearFlag(EXTI_Line5);
    GPIO_WriteBit(GPIOC,GPIO_Pin_13,Bit_RESET);
  }
  if(EXTI_GetFlagStatus(EXTI_Line6) == SET){
    EXTI_ClearFlag(EXTI_Line5);
    GPIO_WriteBit(GPIOC,GPIO_Pin_13,Bit_SET);
  }
}
```
### 2.定时器
#### 2.1引言
**①简介**
>**概述**：一种**硬件定时器**，可分为**时基单元**、**输出比较**、**输入捕获**和**从模式控制器**四个部分
{%list%}
STM32定时器分为高级、通用和基本三类其中TIM1/8为高级定时器，TIM6/7为基本定时器，其余为通用定时器
{%endlist%}
{%right%}
高级定时器包含通用定时器和基本定时器的所有功能，只需要学习高级定时器即可，以下为其结构
{%endright%}
![模块结构](/image/stm32_24.png)
**②时基单元**
>**概述**：主要由**预分频器**`PSC`、**自动重装寄存器**`ARR`、**计数器**`CNT`和**重复计数器**`RCR`组成
{%list%}
以上计数模式为例，初始时CNT值为0，每经过一个脉冲，CNT值加一，当其等于ARR时，再经过一个脉冲就归零
{%endlist%}
>除了**上计数模式**，还有**下计数模式**和**中心计数模式**
{%right%}
当以上过程经历了RCR+1次后，会将UPDATE标志位置1，从而触发定时器中断
{%endright%}
{%warning%}
ARR、PSC和RCR都有其影子寄存器，当向这些寄存器写值时，会先写入其影子寄存器，等UPDATE置1后再更新
{%endwarning%}
>防止**定时器运行过程中**突然改变`ARR`导致跑飞，如下所示

![定时器跑飞](/image/stm32_25.png)
**③延时函数**
>**概述**：配置`TIM1`，将其**周期**配置为`1ms`，并实现对应的**延时函数**
{%list%}
使用定时器UPDATE中断更新系统当前时间current_tick
{%endlist%}
{%right%}
TIM1的时钟频率为72MHz，将PSC设置为71，使其分频后频率为1Hz，并将ARR设置为999，RCR设置为0即可
{%endright%}
{%warning%}
记录当前时间的current_tick需要用volatile修饰
{%endwarning%}
```c
volatile uint32_t current_tick = 0;//记录当前时间

void delay_ms(){
  uint32_t expiretime = current_tick + ms;
  while(current_tick < expiretime);
}
```
```c
void tim_timebase_init(void){
  //开启时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_TIM1,ENABLE);
  //配置时基单元参数
  TIM_TimeBaseInitTypeDef tim_init_struct;
  tim_init_struct.TIM_Prescaler = 71;                   //PSC寄存器的值
  tim_init_struct.TIM_Period = 999;                     //ARR寄存器的值
  tim_init_struct.TIM_CounterMode = TIM_CounterMode_Up; //计数模式，设置为上计数
  tim_init_struct.TIM_RepetitionCounter = 0;            //RCR寄存器的值
  TIM_TimeBaseInit(TIM1,&tim_init_struct);
  //使能时基单元
  TIM_Cmd(TIM1,ENABLE);
  //使能update中断
  TIM_ITConfig(TIM1,TIM_IT_Update,ENABLE);
  //配置NVIC模块
  NVIC_InitTypeDef nvic_init_struct;
  nvic_init_struct.NVIC_IRQChannel = TIM1_IRQn; //中断名称，可见stm32f10x.h
  nvic_init_struct.NVIC_IRQChannelPreemptionPriority = 0;
  nvic_init_struct.NVIC_IRQChannelSubPriority = 0;
  nvic_init_struct.NVIC_IRQChannelCmd = ENABLE;
  NVIC_Init(&nvic_init_struct);
}
```
```c
void TIM1_IRQHandler(void){
  if(TIM_GetFlagStatus(TIM3,TIM_FLAG_Update) == SET){
    TIM_ClearFlag(TIM3,TIM_FLAG_Update);
    current_tick++;
  }
}
```
#### 2.2输出比较
**①简介**
>**概述**：每个定时器有**四个通道**，都可以通过定时器产生**特定的方波信号**，并通过`CHx`和`CHxN`发送出去
{%list%}
以PWM1模式为例，当CCRx的值小于CNT的值时，CHx输出高电平，反之输出低电平，CHxN信号和CHx互补
{%endlist%}
{%right%}
ARR的值即为方波信号的周期，CCRx的值即为方波信号高电平的时间
{%endright%}
![输出比较](/image/stm32_26.png)

**②工作模式**
>**概述**：除了`PWM1`模式外，还有以下几种**工作模式**
{%list%}
除此之外，还可以设置每个通道CHx和CHxN的极性，即是否输出互补信号
{%endlist%}
![工作模式](/image/stm32_27.png)

**③呼吸灯**
>**概述**：将**两个LED灯**连接到`TIM1`的`CHx`和`CHxN`引脚，并不断调整**输出信号占空比**从而输出**变化的电压**
{%list%}
根据引脚分布表，TIM1的CH1和CH1N引脚对应PA8和PB13
{%endlist%}
{%right%}
ARR和CCR寄存器的影子寄存器需要手动开启
{%endright%}
```c
void pwm_init(void){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_8;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  gpio_init_struct.GPIO_Pin = GPIO_Pin_13;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOB,&gpio_init_struct);
  //开启TIM1时钟
  RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM1,ENABLE);
  //配置时基单元参数
  TIM_TimeBaseInitTypeDef tim_init_struct;
  tim_init_struct.TIM_Prescaler = 71;
  tim_init_struct.TIM_Period = 999;
  tim_init_struct.TIM_CounterMode = TIM_CounterMode_Up;
  tim_init_struct.TIM_RepetitionCounter = 0;
  TIM_TimeBaseInit(TIM1,&tim_init_struct);
  //开启预加载
  TIM_ARRPreloadConfig(TIM1,ENABLE);
  TIM_CCPreloadControl(TIM1,ENABLE);
  //使能时基单元
  TIM_Cmd(TIM1,ENABLE);
  //设置通道1
  TIM_OCInitTypeDef timoc1_init_struct;
  timoc1_init_struct.TIM_OCMode = TIM_OCMode_PWM1;           //工作模式
  timoc1_init_struct.TIM_OCNPolarity = TIM_OCNPolarity_High; //CH1N极性
  timoc1_init_struct.TIM_OCPolarity = TIM_OCPolarity_High;   //CH1极性
  timoc1_init_struct.TIM_OutputNState = ENABLE;              //CH1N使能
  timoc1_init_struct.TIM_OutputState = ENABLE;               //CH1使能
  timoc1_init_struct.TIM_Pulse = 0;                          //ccr的值
  TIM_OC1Init(TIM1,&timoc1_init_struct);
  //使能通道1
  TIM_CtrlPWMOutputs(TIM1,ENABLE);
}
```
```c
#include "math.h"
int main(void){
  pwm_init();
  while(1){
    float t = GetTick() * 1.0e-3f; //获取当前时间
    float duty = (sin(2*3.14*t) + 1)*0.5; //占空比
    uint16_t ccr1 = duty * 1000;
    TIM_SetCompare1(TIM1,ccr1);
  }
}
```
#### 2.3输入捕获
**①简介**
>**概述**：使用**一对通道**捕获输入信号的**上升沿/下降沿**，并触发`CCx`**事件**，将当时`CNT`的值保存到`CCRx`中
{%list%}
通道1和通道2为一组，通道3和通道4为一组，以通道1和通道2为例，内部结构如下
{%endlist%}
{%right%}
其中直接表示信号来自于本通道，间接表示信号来自于另一个通道
{%endright%}
![输入捕获](/image/stm32_28.png)
**②超声波测距**
>**概述**：使用`HCSR04`模块**测量距离**并通过**串口发送**到PC端，其主要引脚为`Trig`和`Echo`
{%list%}
向Trig引脚发送大于10us的高电平会启动该模块，Echo引脚输出一个方波信号，其脉冲表示声波往返时间
{%endlist%}
{%right%}
使用输入捕获测量Echo引脚的脉冲，通道1捕获上升沿，通道2捕获下降沿
{%endright%}
{%warning%}
开始测量前，清除CNT以及CC1和CC2标志位，且定时器一个周期需要大于模块的最大脉宽
{%endwarning%}
```c
#include "math.h"
int main(void){
  //硬件初始化
  usart1_init();
  HCSR04_init();
  while(1){
    //清除CNT
    TIM_SetCounter(TIM1,0);
    //清除标志位
    TIM_ClearFlag(TIM1,TIM_FLAG_CC1);
    TIM_ClearFlag(TIM1,TIM_FLAG_CC2);
    //开启定时器
    TIM_Cmd(TIM1,ENABLE);
    //发送trig脉冲
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_SET);
    delay_us(10);
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_RESET);
    //查询标志位
    while(TIM_GetFlagStatus(TIM1,TIM_FLAG_CC1) == RESET);
    while(TIM_GetFlagStatus(TIM1,TIM_FLAG_CC2) == RESET);
    //关闭定时器
    TIM_Cmd(TIM1,DISABLE);
    //测量距离
    uint16_t ccr1 = TIM_GetCapture1(TIM1);
    uint16_t ccr1 = TIM_GetCapture1(TIM1);
    float distance = (ccr2-ccr1) * 1.0e-6f * 340.0f / 2;
    delay_ms(100);
  }
}
```
```c
void usart1_init(){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_9;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);

  gpio_init_struct.GPIO_Pin = GPIO_Pin_10;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPU;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //初始化usart
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1,ENABLE);
  USART_InitTypeDef usart_init_struct;
  usart_init_struct.USART_BaudRate = 115200;
  usart_init_struct.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
  usart_init_struct.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
  usart_init_struct.USART_Parity = USART_Parity_No;
  usart_init_struct.USART_Stop_Bits = USART_StopBits_1;
  usart_init_struct.USART_Word_Length = USART_WordLength_8b;
  USART_Init(USART1,&usart_init_struct);

  USART_Cmd(USART1,ENABLE);
}
```
```c
void HCSR04_init(void){
  //开启时钟
  RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM1,ENABLE);
  //配置时基单元参数
  TIM_TimeBaseInitTypeDef tim_init_struct;
  tim_init_struct.TIM_Prescaler = 71;
  tim_init_struct.TIM_Period = 65535;
  tim_init_struct.TIM_CounterMode = TIM_CounterMode_Up;
  tim_init_struct.TIM_RepetitionCounter = 0;
  TIM_TimeBaseInit(TIM1,&tim_init_struct);
  //这里不闭合开关
  //初始化trig引脚
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_0;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_OUT_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //初始化CH1引脚PA8
  gpio_init_struct.GPIO_Pin = GPIO_Pin_8;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPD;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //初始化输入捕获
  TIM_ICInitTypeDef tim_ic_init_struct;
  tim_ic_init_struct.TIM_Channel = TIM_Channel_1;                  //通道1
  tim_ic_init_struct.TIM_ICFilter = 0;                             //不使用滤波
  tim_ic_init_struct.TIM_ICPolarity = TIM_ICPolarity_Rising;       //捕获上升沿
  tim_ic_init_struct.TIM_ICPrescaler = TIM_ICPSC_DIV1;             //1分频
  tim_ic_init_struct.TIM_ICSelection = TIM_ICSelection_DirectTI;   //直接
  TIM_ICInit(TIM1,&tim_ic_init_struct);
  tim_ic_init_struct.TIM_Channel = TIM_Channel_2;                  //通道2
  tim_ic_init_struct.TIM_ICFilter = 0;                             //不使用滤波
  tim_ic_init_struct.TIM_ICPolarity = TIM_ICPolarity_Falling;      //捕获下降沿
  tim_ic_init_struct.TIM_ICPrescaler = TIM_ICPSC_DIV1;             //1分频
  tim_ic_init_struct.TIM_ICSelection = TIM_ICSelection_IndirectTI; //间接
  TIM_ICInit(TIM1,&tim_ic_init_struct);
}
```
#### 2.4从模式控制器
**①简介**
>**概述**：`TRGI`接收**外部信号**控制**时基单元**，`TRGO`根据**时基单元状态**发出对应**控制信号**
{%list%}
TRGI信号来源如下所示，其中ITRx表示其他定时器的TRGO信号，需要在参考手册(P237和P285)中查表获取
{%endlist%}
>`TIM1`的`ITRx`分别对应`TIM5`、`TIM2`、`TIM3`和`TIM4`的`TRGO`
{%right%}
从模式控制器有八种不同的主模式和从模式，描述TRGI和TRGO信号与时基单元状态之间的影响关系
{%endright%}
>如**UPDATE主模式**表示每个`UPDATE`事件，`TRGO`输出**脉冲**，**触发从模式**表示`TRGI`**上升沿**闭合总开关

![输入捕获](/image/stm32_29.png)

**②PWM参数测量**
>**概述**：通道`1`捕获**上升沿**，通道`2`捕获**下降沿**，并使用`PWM`信号作为`TRGI`，采用**复位模式**
{%list%}
复位模式即TRGI上升沿对CNT清零，当输入TRGI时会使得Trigger标志位置1
{%endlist%}
{%right%}
经过一个PWM信号后，CCR1保存的值为PWM的周期，CCR2保存的值为高电平时间
{%endright%}
```c
int main(){
  tim1_init()
  while(1){
    //清除trigger标志位并等待其被设置，说明一次测量完成
    TIM_ClearFlag(TIM1,TIM_FLAG_Trigger);
    while(TIM_GetFlagStatus(TIM1,TIM_FLAG_Trigger) == RESET)
    //获取CCR1和CCR2寄存器的值
    uint16_t ccr1 = TIM_GetCapture1(TIM1);
    uint16_t ccr1 = TIM_GetCapture1(TIM1);

    float period = ccr1 * 1.0e-6f *1.0e3f;
    float duty = ((float)ccr2)/ccr1 * 100.0f;
  }
}

```
```c
void tim1_init(){
  //开启时钟
  RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM1,ENABLE);
  //配置时基单元
  TIM_TimeBaseInitTypeDef tim_init_struct;
  tim_init_struct.TIM_Prescaler = 71;
  tim_init_struct.TIM_Period = 65535;
  tim_init_struct.TIM_CounterMode = TIM_CounterMode_Up;
  tim_init_struct.TIM_RepetitionCounter = 0;
  TIM_TimeBaseInit(TIM1,&tim_init_struct);
  //开启预加载
  TIM_ARRPreloadConfig(TIM1,ENABLE);
  TIM_CCPreloadControl(TIM1,ENABLE);
  //开启定时器
  TIM_Cmd(TIM1,ENABLE);
  //初始化输入捕获引脚
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  gpio_init_struct.GPIO_Pin = GPIO_Pin_8;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPD;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //初始化输入捕获
  TIM_ICInitTypeDef tim_ic_init_struct;
  tim_ic_init_struct.TIM_Channel = TIM_Channel_1;                  //通道1
  tim_ic_init_struct.TIM_ICFilter = 0;                             //不使用滤波
  tim_ic_init_struct.TIM_ICPolarity = TIM_ICPolarity_Rising;       //捕获上升沿
  tim_ic_init_struct.TIM_ICPrescaler = TIM_ICPSC_DIV1;             //1分频
  tim_ic_init_struct.TIM_ICSelection = TIM_ICSelection_DirectTI;   //直接
  TIM_ICInit(TIM1,&tim_ic_init_struct);
  tim_ic_init_struct.TIM_Channel = TIM_Channel_2;                  //通道2
  tim_ic_init_struct.TIM_ICFilter = 0;                             //不使用滤波
  tim_ic_init_struct.TIM_ICPolarity = TIM_ICPolarity_Falling;      //捕获下降沿
  tim_ic_init_struct.TIM_ICPrescaler = TIM_ICPSC_DIV1;             //1分频
  tim_ic_init_struct.TIM_ICSelection = TIM_ICSelection_IndirectTI; //间接
  TIM_ICInit(TIM1,&tim_ic_init_struct);
  //配置从模式控制器
  TIM_SelectInputTrigger(TIM1,TIM_TS_TI1FP1);                      //选择TRGI来源
  TIM_SelectSlaveMode(TIM1,TIM_SlaveMode_Reset)                    //选择复位模式
}
```
### 3.ADC模块
#### 3.1
