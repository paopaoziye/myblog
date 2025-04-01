---
title: BootLoader（一）
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
  - BootLoader
categories: 项目实战
keywords: 文章关键词
updated: ''
img: /medias/featureimages/13.webp
date:
summary: 基于单片机的BootLoader
---
# BootLoader
## 基于单片机的BootLoader（一）
### 1.引言
#### 1.1单片机程序
**①程序运行**
>**概述**：单片机程序被烧写在`flash`上，可能在`flash`上**就地运行**，也可能被**复制到内存**中运行
{%list%}
前者也称为XIP，可以减少对内存的需求，常常用于bootloader或者内存极度短缺的情况
{%endlist%}
{%warning%}
XIP指CPU可以直接从设备中取指执行，所以外接flash等设备不能XIP
{%endwarning%}

**②程序更新**
>**概述**：当程序需要更新时，会运行对应的**更新函数**将新程序下载到**内存**中，随后**覆盖**`flash`中的旧程序
{%list%}
在写入flash前需要对flash进行擦除
{%endlist%}
{%warning%}
如果更新函数在目标代码内，当更新过程出现故障，如烧写到一半时断电，会损坏板子
{%endwarning%}
{%right%}
所以app/系统的更新函数需要独立出去，通常写在BootLoader/内存文件系统中
{%endright%}
#### 1.2BootLoader作用
**①单片机**
>**概述**：检查程序是否需要**下载/更新**，若不需要更新则**跳转到特定位置**运行
{%list%}
BootLoader通常位于flash开始位置，板子上电时会直接运行BootLoader
{%endlist%}
{%warning%}
一般不更新bootloader，双bootloader可以互相更新，但是需要硬件支持，因为上电时一定是从某个位置开始运行
{%endwarning%}
**②Linux**
>**概述**：进行**硬件初始化**等准备工作，将**内核读取到内存**中，并识别出**根文件系统**，最后跳转到**特定位置**运行
{%list%}
Linux的BootLoader还会提供一些调试命令，如读写内存
{%endlist%}
{%right%}
Linux的更新函数通常放在内存文件系统中，而不是放在BootLoader中
{%endright%}
#### 1.3keil工程构建
**①准备工作**
>**概述**：安装`keil`，并下载硬件对应的**库文件**和`keil`**芯片包**
{%list%}
使用的硬件为GD32F103C8T6芯片和4G的CAT1模块
{%endlist%}
>[keil安装教程](https://blog.csdn.net/lemou1211/article/details/128907850)、[硬件资源](https://gd32mcu.com/cn/download?kw=GD32F10&lan=cn)
{%right%}
解压芯片包，单机GigaDevice.GD32F10x_DFP.2.3.0即可完成安装
{%endright%}
**②工程文件夹**
>**概述**：`USER`**主函数和工程**，`HW`**硬件相关程序**，`LIB`**固件库**，`CMSIS`**标准接口**，`OBJ`**中间文件**
{%list%}
每个文件夹下都有Source和Include子文件夹分别存放源文件和头文件
{%endlist%}
>将**固件库文件**中`Firmware->GD32F10x_standard_peripheral`中的`Source`和`Include`复制到`LIB`中

>将**固件库文件**中`Firmware->CMSIS`和`Firmware->CMSIS->GD->GD32F10x->Include`下的头文件放入`CMSIS->Include`

>将**固件库文件**中`Firmware->CMSIS->GD->GD32F10x->Source的system_gd32f10x.c`放入`CMSIS->Source`

>将**固件库文件**中`Firmware->CMSIS->GD->GD32F10x->Source->Arm的startup_gd32f10x_md.s`放入`CMSIS->Source`

>将**固件库文件**中`Template`下的`gd32f10x_it.c`和`gd32f10x_it.h`分别放入`HW->Source`和`HW->Include`

**③工程创建**
>**概述**：创建**工程文件**并保存在在`USER`下，选择正确的**芯片包**`GD32F103C8`

>给**每个文件夹**设置**对应的分组**，将**用到的源文件**添加到**对应的分组**中，创建`main.c`并添加到`USER`分组

>并在`option->output`设置**输出路径**为`OBJ`，在`option->C/C++`设置**头文件路径**，定义一个全局宏`GD32F10X_MD`
{%list%}
添加RTE_Components.h头文件到USER文件夹下，作为外设的开关设置，详细配置选项可见gd32f10x_libopt.h文件
{%endlist%}
{%warning%}
需要清空gd32f10x_it.c中的SysTick_Handler函数
{%endwarning%}
```c
/* RTE_Components.h文件 */
#ifndef GD32F10X_RTE_H
#define GD32F10X_RTE_H

#define RTE_DEVICE_STDPERIPHERALS_GPIO
#define RTE_DEVICE_STDPERIPHERALS_MISC
#define RTE_DEVICE_STDPERIPHERALS_RCU

#endif
```

### 2.串口通信
#### 2.1引言
**①CH340N**
>**概述**：一种**USB转串口芯片**，使计算机可以通过**USB接口**和**单片机**等设备进行通信
{%list%}
电路原理图如下所示，可知单片机使用PA9和PA10作为输入引脚和输出引脚，用于和电脑通信
{%endlist%}
{%right%}
在芯片数据手册中搜索PA9/PA10，发现其属于USART0
{%endright%}
![CH340N](/image/bootloader_2.png)
**②基本思路**
>**概述**：使用`DMA`方式读取串口`RXD`**接收数据**，使用**空闲中断**表示**数据接收完成**，将数据写入串口`TXD`**发送数据**
{%list%}
串口收发过程中，如果串口接收端的线路没有任何传输数据，会触发空闲中断
{%endlist%}
{%right%}
使用环形数组作为缓冲区，将接收数据和发送数据放入到对应缓冲区中
{%endright%}
{%warning%}
对于数据接收，还需要定义一次最多能接收多少数据，当接收缓冲区剩余空位小于该值时，需要回卷防止数组越界
{%endwarning%}
**③接收数据管理**
>**概述**：定义一个**管理数组**，每一项为包含**数据块起始地址**的`SE`**结构体**，具体**工作流程**如下图所示
{%list%}
每个结构体都表示一个数据块，使用IN和OUT分别指向下一个需要填充的数据块结构体和需要处理的数据块结构体
{%endlist%}
{%right%}
定义END指针，指向管理数组最后一位，当IN和OUT到达END后回卷
{%endright%}
{%warning%}
管理数组不能太小，否则当数据的传入速度和处理速度相差较大时，会产生数据覆盖
{%endwarning%}
![接收数据管理](/image/bootloader_1.png)
#### 2.2准备工作
**①引言**
>**概述**：创建`uart.h`和`uart.c`文件，在`uart.h`中做出**以下定义**，并在`uart.c`创建对应的**初始化函数**
{%list%}
串口通信需要使用USART和DMA，需要在RTE_Components.h中定义对应宏
{%endlist%}
>将`uart.c`、`gd32f10x_usart.c`和`gd32f10x_dma.c`加入工程
{%right%}
初始时，只需要将IN指针的start成员指向接收缓冲区头部即可
{%endright%}
```c
/* RTE_Components.h文件 */
#ifndef GD32F10X_RTE_H
#define GD32F10X_RTE_H

#define RTE_DEVICE_STDPERIPHERALS_GPIO
#define RTE_DEVICE_STDPERIPHERALS_MISC
#define RTE_DEVICE_STDPERIPHERALS_RCU
#define RTE_DEVICE_STDPERIPHERALS_USART
#define RTE_DEVICE_STDPERIPHERALS_DMA

#endif
```
```c
/* uart.h */
#ifndef UART_H
#define UART_H
#include "stdint.h"
#include "stdarg.h"
#include "stdio.h"
#include "string.h"
//缓冲区相关定义
#define U0_RX_SIZE 2048                          //串口0的接收缓冲区长度
#define U0_RX_MAX  256                           //串口0单次最大接收值
#define U0_TX_SIZE 2048                          //串口0的发送缓冲区长度
#define NUM 10                                   //接收管理数组长度
//SE结构体
typedef struct{
  uint8_t *start;                                //指向数据块起始地址
  uint8_t *end;                                  //指向数据块结束地址
}RxBufPtr;
//接收数组管理结构体
typedef struct{
  uint16_t URxDataSum;                           //接收数据总数                 
  RxBufPtr URxBufPtrs[NUM];                      //接收缓冲区
  RxBufPtr *URxDataIn,*URxDataOut,*URxDataEnd;   //IN、OUT和END指针
}RxBuf_Manage;
//共享数据，定义在uart.c中
extern RxBuf_Manage U0_RxBufMan;
extern uint8_t U0_RxBuf[U0_RX_SIZE];
//函数声明
void uart0_init(uint32_t bandrate);
void DMA_init(void);
void U0_RxBufMan_init(void);
void u0_printf(char *format,...);
#endif
```
```c
/* uart.c */
#include "uart.h"
#include "gd32f10x.h"
//串口0的接收/发送数组以及对应管理结构体
uint8_t U0_RxBuf[U0_RX_SIZE];
uint8_t U0_TxBuf[U0_TX_SIZE];
RxBuf_Manage U0_RxBufMan;
//管理结构初始化
void U0_RxBufMan_init(void){
  //初始时，IN指针和OUT指针都指向管理数组的第一项，END指针指向最后一项
  U0_RxBufMan.URxDataIn = &U0_RxBufMan.URxBufPtrs[0];
  U0_RxBufMan.URxDataOut = &U0_RxBufMan.URxBufPtrs[0];
  U0_RxBufMan.URxDataEnd = &U0_RxBufMan.URxBufPtrs[NUM-1];
  //初始时，IN指针的start成员指向接收数组的起始位置
  U0_RxBufMan.URxDataIn->start = U0_RxBuf;

  U0_RxBufMan.URxDataSum = 0;
}
```
**②串口初始化**
>**概述**：打开`USART0`和`GPIOA`的**时钟**，配置其**工作模式**并设置`USART0`的**空闲中断**，最后**打开串口**
{%list%}
PA9配置为复用推挽输出，表示输出信号来自外设，PA10配置为浮空输入
{%endlist%}
{%right%}
由于使用了DMA，所以需要开启USART0的DAM功能
{%endright%}
{%warning%}
在设置USART0的波特率、数据位、校验位和停止位前，调用deinit复位USART0
{%endwarning%}

```c
//uart.c文件
void uart0_init(uint32_t bandrate){
  //打开时钟，详细见gd32f10x_rcu.c
  rcu_periph_clock_enable(RCU_USART0);
  //复位USART0
  usart_deinit(USART0);
  //相关GPIO配置，详细可见gd32f10x_gpio.c文件
  rcu_periph_clock_enable(RCU_GPIOA);
  gpio_init(GPIOA,GPIO_MODE_AF_PP,GPIO_OSPEED_50MHZ,GPIO_PIN_9);
  gpio_init(GPIOA,GPIO_MODE_IN_FLOATING,GPIO_OSPEED_50MHZ,GPIO_PIN_10);
  //设置波特率、数据位、校验位和停止位，详细可见gd32f10x_usart.c文件
  usart_baudrate_set(USART0,bandrate);
  usart_word_length_set(USART0,USART_WL_8BIT);
  usart_parity_config(USART0,USART_PM_NONE);
  usart_stop_bit_set(USART0,USART_STB_1BIT);
  //开启接受模式、发送模式和DMA
  usart_transmit_config(USART0,USART_TRANSMIT_ENABLE);
  usart_receive_config(USART0,USART_RECEIVE_ENABLE);
  usart_dma_receive_config(USART0,USART_RECEIVE_DMA_ENABLE);
  //中断分组，使能USART0中断并开启空闲中断
  nvic_priority_group_set(NVIC_PRIGROUP_PRE2_SUB2);
  nvic_irq_enable(USART0_IRQn,0,0);
  usart_interrupt_enable(USART0,USART_INT_IDLE);
  //管理结构体初始化
  U0_RxBufMan_init();
  //打开串口
  usart_enable(USART0);
}
```
**②DMA初始化**
>**概述**：打开`DMA0`的**时钟**，并设置`USART0_RX`对应通道的**工作模式**，最后**打开对应通道**
{%list%}
根据用户手册中的DMA请求映射，USART0_RX对应DMA0的通道4
{%endlist%}
{%right%}
将一次DMA传递数量设置为U0_RX_MAX+1，并关闭DMA完成中断，由空闲中断表示数据传输完成
{%endright%}
{%warning%}
同上，设置DMA前需要先使用deinit进行复位
{%endwarning%}
```c
//uart.c文件
void DMA_init(void){
  //打开DMA0的时钟
  rcu_periph_clock_enable(RCU_DMA0);
  //USART0_RX对应通道四，设置前先复位
  dma_deinit(DMA0,DMA_CH4);
  //dma初始化所需的结构体，详细可见gd32f10x_dma.h文件
  dma_parameter_struct dma0_init_struct;
  //外设地址，即串口0数据寄存器地址，查用户手册可知为USART0+0x04
  dma0_init_struct.periph_addr = USART0+4;
  //数据长度设置为1字节
  dma0_init_struct.periph_width = DMA_PERIPHERAL_WIDTH_8BIT;
  //数据接收地址，即数据接收数组
  dma0_init_struct.memory_addr = (uint32_t)U0_RxBuf;
  //同上定义为一字节
  dma0_init_struct.memory_width = DMA_MEMORY_WIDTH_8BIT ;
  //一次DMA可以传递的数据数量
  dma0_init_struct.number = U0_RX_MAX+1;
  //dma中断优先级设置
  dma0_init_struct.priority = DMA_PRIORITY_HIGH ;
  //外设地址递增量，这里一直使用串口，所以不变
  dma0_init_struct.periph_inc = DMA_PERIPH_INCREASE_DISABLE;
  //接收地址需要递增
  dma0_init_struct.memory_inc = DMA_MEMORY_INCREASE_ENABLE;
  //传递方向定义为外设到内存
  dma0_init_struct.direction  = DMA_PERIPHERAL_TO_MEMORY;
  dma_init(DMA0,DMA_CH4,&dma0_init_struct);
  //使能DMA0的DMA_CH4
  dma_channel_enable(DMA0,DMA_CH4);
}

```
#### 2.3收发函数
**①接收函数**
>**概述**：在`USART0`的中断处理函数中**检测空闲中断**将数据放入**接收缓冲区**中，定义在`gd32f10x_it.c`中
{%list%}
检测到空闲中断后，处理的第一步就是清除空闲中断标志位
{%endlist%}
{%right%}
状态寄存器的标志位有些是软件清零，有些需要手动清零，根据用户手册，空闲中断标志位需要手动清零
{%endright%}
{%warning%}
每次接受完数据后，调整IN指针以及其start成员时需要考虑回卷，且需要更新DMA的内存地址
{%endwarning%}
>当`IN`等于`END`时，**管理数组**回卷，当**接收缓冲区剩余位置**小于`U0_RX_MAX`时，**接收缓冲区**回卷

![空闲中断位](/image/bootloader_3.png)
```c
/* gd32f10x_it.c */
#include "uart.h"
void USART0_IRQHandler(void){
  //检测空闲中断
  if(usart_flag_get(USART0,USART_FLAG_IDLEF) == SET){
    //清除空闲中断的标志位
    usart_data_receive(USART0);
    //增加累加值URxDataSum，并更新IN指针的end成员
    //需要调用dma_transfer_number_get获取DMA没有接收到的数据
    U0_RxBufMan.URxDataSum += (U0_RX_MAX+1)-dma_transfer_number_get(DMA0,DMA_CH4);
    U0_RxBufMan.URxDataIn->end = &U0_RxBuf[U0_RxBufMan.URxDataSum-1];
    //将IN指针指向下一个RxBufPtr，表示待接收新的文件
    U0_RxBufMan.URxDataIn++;
    //如果IN指针等于END指针，则立马回卷
    if(U0_RxBufMan.URxDataIn == U0_RxBufMan.URxDataEnd){
      U0_RxBufMan.URxDataIn = &U0_RxBufMan.URxBufPtrs[0];
    }
    //如果剩余空间大于一次可接受数据的最大值，才能继续接收，反之回卷
    if(U0_RX_SIZE - U0_RxBufMan.URxDataSum >= U0_RX_MAX){
      U0_RxBufMan.URxDataIn->start = &U0_RxBuf[U0_RxBufMan.URxDataSum];
    }else{
      U0_RxBufMan.URxDataIn->start = U0_RxBuf;
      U0_RxBufMan.URxDataSum = 0;
    }
    //更新dma相关属性
    dma_channel_disable(DMA0,DMA_CH4);
    dma_transfer_number_config(DMA0,DMA_CH4,U0_RX_MAX+1);
    dma_memory_address_config(DMA0,DMA_CH4,(uint32_t)U0_RxBufMan.URxDataIn->start);
    dma_channel_enable(DMA0,DMA_CH4);
  }
}
```
**②发送函数**
>**概述**：使用`va_list`接收**可变变量**，并将其存储到**发送缓冲区**中，最后通过`usart_data_transmit`**逐一发送**
{%list%}
使用usart_data_transmit前需要检测串口TXD是否为空
{%endlist%}
{%right%}
使用vsprintf将可变参数格式化输出到输出缓冲区中
{%endright%}
{%warning%}
需要等串口将数据发送完毕才能退出该函数，否则可能会产生数据丢失
{%endwarning%}
```c
void u0_printf(char *format,...){
	uint16_t i;
	//使用valist结构读取不确定参数，并进行初始化
	va_list listdata;
	va_start(listdata,format);
	vsprintf((char *)U0_TxBuf,format,listdata);
	va_end(listdata);
	
	for(i = 0;i < strlen((const char*)U0_TxBuf);i++){
		//当串口的发送寄存器不为空，需要一直空循环等待
		while(usart_flag_get(USART0,USART_FLAG_TBE)!=1);
		//传递数据
		usart_data_transmit(USART0,U0_TxBuf[i]);
	}
	//当串口发送完毕才能退出
	while(usart_flag_get(USART0,USART_FLAG_TC)!=1);
}
```
### 3.M24C02通信
#### 3.1引言
**①M24C02**
>**概述**：大小为`2KB`的**串行EEPROM存储芯片**，使用**IIC总线通讯协议**读写芯片数据
{%list%}
电路原理图如下，其使用PB6和PB7作为其时钟线和数据线，地址选择引脚E0、E1和E2被置为低电平
{%endlist%}
{%right%}
M24C02有一个16字节的页写缓冲器和一个写保护功能
{%endright%}
![M24C02](/image/bootloader_4.png)

**②SysTick**
>**概述**：一种专用的**计时器**，用于在`Cortex-M`系列处理器中实现**系统定时功能**
{%list%}
SysTick有CTRL、LOAD、VAL和CALIB四个寄存器，简介如下
{%endlist%}
{%right%}
本质上是一个24位的递减计数器，每次计数到零时会触发一个中断
{%endright%}

| **寄存器名称**        | **功能描述**                                                                  |
|---------------------|-----------------------------------------------------------------------------|
| **CTRL**     | 控制寄存器，控制SysTick的使能、时钟源选择、中断使能等                         |
| **LOAD**     | 重载寄存器，用于设置计数器的初始值                                            |
| **VAL**      | 当前值寄存器，存储当前计数器的值                                              |
| **CALIB**    | 校准寄存器，包含系统时钟的校准值，用于计算定时精度（如果启用系统时钟）       |

**③延时函数**
>**概述**：创建`delay.c`和`delay.h`文件并将`delay.c`加入工程，使用`SysTick`实现延时函数，为**模拟IIC**做准备
{%list%}
清空VAL并设置LOAD，打开SysTick后，当计数不为0时一直空循环，结束后关闭SysTick
{%endlist%}
{%right%}
SysTick的时钟源为系统时钟，频率为108HZ，即108个计数表示一微秒
{%endright%}
```c
/* delay.h */
#ifndef DELAY_H
#define DELAY_H
#include "stdint.h"

void delay_init(void);
void delay_us(uint16_t us);
void delay_ms(uint16_t ms);

#endif
```
```c
/* delay.c */
#include "gd32f10x.h"
#include "delay.h"

void delay_init(void){
	//配置时钟源，详细见gd32f10x_misc.c文件
	systick_clksource_set(SYSTICK_CLKSOURCE_HCLK);
}

void delay_us(uint16_t us){
	//根据systick_clksource_set找到操作对象SysTick，设置其寄存器
	//VAL对应寄存器为0时，会将LOAD对应寄存器的值加载到VAL对应寄存器中
	SysTick->LOAD = us*108;
	SysTick->VAL = 0x00;
	//设置状态寄存器对应标志位，打开计数器
	SysTick->CTRL |= SysTick_CTRL_ENABLE_Msk ;
	//当时钟计时未结束，一直空循环
	while(!(SysTick->CTRL&SysTick_CTRL_COUNTFLAG_Msk));
	//关闭计时器
	SysTick->CTRL &= ~SysTick_CTRL_ENABLE_Msk ;
}

void delay_ms(uint16_t ms){
	while(ms--){
		delay_ms(1000);
	}
}
```

#### 3.2模拟IIC
**①准备工作**
>**概述**：创建`iic.c`和`iic.h`文件并将`iic.c`加入工程，在`iic.h`中定义**相关接口**，在`iic.c`中进行**初始化**
{%list%}
初始化时，将SDA线和SCL线都设置为高电平
{%endlist%}
{%right%}
由电路图可知，PB6为SCL线，PB7为SDA线，将其在iic.h中进行封装
{%endright%}
```c
/* iic.h文件 */
#ifndef IIC_H
#define IIC_H
#include "stdint.h"
//将SCL线设置为高/低电平
#define IIC_SCL_H gpio_bit_set(GPIOB,GPIO_PIN_6)
#define IIC_SCL_L gpio_bit_reset(GPIOB,GPIO_PIN_6)
//将SDA线设置为高/低电平
#define IIC_SDA_H gpio_bit_set(GPIOB,GPIO_PIN_7)
#define IIC_SDA_L gpio_bit_reset(GPIOB,GPIO_PIN_7)
//读取SDA线电平
#define READ_SDA gpio_input_bit_get(GPIOB,GPIO_PIN_7)
//函数声明
void iic_init(void);
void iic_start(void);
void iic_end(void);
void iic_send_byte(uint8_t txd);
uint8_t iic_wait_ack(int16_t timeout);
uint8_t iic_read_byte(uint8_t ack);

#endif
```
```c
/* iic.c文件 */
#include "gd32f10x.h"
#include "iic.h"
#include "delay.h"
//查看原理图
void iic_init(void){
  //打开B组的GPIO
  rcu_periph_clock_enable(RCU_GPIOB);
  //初始化GPIO，设置为输出的OD模式
  gpio_init(GPIOB,GPIO_MODE_OUT_OD,GPIO_OSPEED_50MHZ,GPIO_PIN_6);
  gpio_init(GPIOB,GPIO_MODE_OUT_OD,GPIO_OSPEED_50MHZ,GPIO_PIN_7);
  //初始时SDA和SCL线都为高电平
  IIC_SCL_H;
  IIC_SDA_H;
}
```
**②起始信号和结束信号**
>**概述**：根据**IIC协议**，控制`SDA`线和`SCL`线的电平，并利用**延时函数**输出对应波形
{%right%}
最后都将SCL置为低电平，因为SCL为低电平时，SDA的变化不会产生影响
{%endright%}

```c
/* iic.c文件 */
void iic_start(void){
  //根据iic协议，当SCL为高电平时，SDA从高电平变为低电平表示开始信号
  IIC_SCL_H;
  IIC_SDA_H;
  delay_us(2);
  IIC_SDA_L;
  delay_us(2);
  IIC_SCL_L;
}
//最后都拉低SCL，比较安全
void iic_end(void){
  //根据iic协议，当SCL为高电平时，SDA从低电平变为高电平表示结束信号
  IIC_SCL_H;
  IIC_SDA_L;
  delay_us(2);
  IIC_SDA_H;
  delay_us(2);
  IIC_SCL_L;
}
```
![起始信号和结束信号](/image/bootloader_5.png)
**②数据发送**
>**概述**：根据**IIC协议**，控制`SDA`线和`SCL`线的电平，并利用**延时函数**输出**数据信号**并等待**应答信号**
{%list%}
iic为大端传输，即先输出高位
{%endlist%}
{%right%}
等待应答信号需要等待从机拉低SDA
{%endright%}
{%warning%}
传输数据信号时，每次传输在改变SDA线前需要保证SCL线为低电平，传输完毕后将SCL线拉低/SDA线拉高
{%endwarning%}
>`SCL`线拉低便于**从机修改**`SDA`线，`SDA`线拉高是因为需要由**从机拉低**表示**应答信号**
```c
/* iic.c文件 */
/* 发送8位数据信号 */
void iic_send_byte(uint8_t txd){
  //从最高位开始，一位一位传递
  int8_t i;
  //传送数据
  for(i=7;i>=0;i--){
    //首先拉低SCL，因为只有在SCL为低时操作SDA不会有其他影响
    IIC_SCL_L;
    //根据数据位调整SDA
    if(txd & BIT(i))
      IIC_SDA_H;
    else
      IIC_SDA_L;
    delay_us(2);
    //将SCL拉高，以接收信号
    IIC_SCL_H;
    delay_us(2);
  }
  //准备接收应答信号
  IIC_SCL_L;
  IIC_SDA_H;
}
/* 等待应答信号 */
uint8_t iic_wait_ack(int16_t timeout){
	//一直读取SDA
	do{
		timeout--;
		delay_us(2);
	}while((READ_SDA)&&(timeout>=0));
	//超时返回1
	if(timeout<0) return 1;
	//如果SDA变为低电平，则进行进一步判断
	//若SCL线在高电平期间，SDA依旧为稳定的低电平，则表示收到应答信号，返回0
	//反之说明异常返回2
	IIC_SCL_H;
	delay_us(2);
	if(READ_SDA!=0) return 2;
	
	IIC_SCL_L;
	delay_us(2);
	return 0;
}
```
![数据发送](/image/bootloader_6.png)
**③数据读取**
>**概述**：控制`SCL`线并读取`SDA`线，最后根据情况发送**应答信号**
{%list%}
在SCL线为高时读取SDA线
{%endlist%}
{%right%}
读取数据时，每次读取前拉低SCL线，让从机可以改变SDA线，读取完毕后拉低SCL线让从机释放SDA线
{%endright%}
{%warning%}
在发送完应答信号后，主机需要拉低SCL线以释放总线
{%endwarning%}
```c
/* 读取一字节数据，如果要发送应答信号，ack设置为1，反之设置为0 */
uint8_t iic_read_byte(uint8_t ack){
  //rxd保存每次接受的二进制位
  int8_t i;
  uint8_t rxd;
  rxd = 0;
  for(i=7;i>=0;i--){
    //每次读取数据前，拉低SCL，让从机可以改变SDA
    IIC_SCL_L;
    delay_us(2);
    //一段时间后，读取SDA，若位高电平，则将rxd对应位置为一
    IIC_SCL_H;
    if(READ_SDA)
      rxd |= BIT(i);
    delay_us(2);
  }
  //将SCL拉低，从机才能释放SDA
  IIC_SCL_L;
  delay_us(2);
  //如果ack为非零值，则表示需要应答
  if(ack){
    //发出应答信号
    IIC_SDA_L;
    IIC_SCL_H;
    delay_us(2);
    //释放总线
    IIC_SCL_L;
    IIC_SDA_H;
    delay_us(2);
  }else{
    //不发出应答
    IIC_SDA_H;
    IIC_SCL_H;
    delay_us(2);
    IIC_SCL_L;
    delay_us(2);
  }
  return rxd;
}
```
![数据读取](/image/bootloader_7.png)
#### 3.3M24C02读写
**①准备工作**
>**概述**：创建`m24c02.c`和`m24c02.h`文件并将`m24c02.c`加入工程，在`m24c02.h`中定义**器件地址**
{%list%}
根据m24c02的手册，其地址为1010:E2:E1:E0:R/W，所以读写地址分别为0xA1和0xA0
{%endlist%}
```c
/* m24c02.h */
#ifndef M24C02_H
#define M24C02_H
#include "stdint.h"

#define M24C02_WADDR 0xA0
#define M24C02_RADDR 0xA1
//函数声明
uint8_t m24c02_wirte_byte(uint8_t addr,uint8_t data);
uint8_t m24c02_wirte_page(uint8_t addr,uint8_t *data);
uint8_t m24c02_read_data(uint8_t addr,uint8_t *data,uint16_t len);
void    m24c02_read_ota_info(void);
#endif
```
```c
/* m24c02.c */
#include "gd32f10x.h"
#include "iic.h"
#include "m24c02.h"
#include "main.h"
#include "string.h"
#include "delay.h"

```
**②写入函数**
>**概述**：依次发送**起始信号**、**器件写地址**、**写入位置**、**写入数据**和**停止信号**，如果没有接收到**应答信号**则返回**异常**
{%list%}
除了起始信号、停止信号，主机的每个信号都需要从机应答
{%endlist%}
{%right%}
根据芯片手册，m24c02一次可以写一个字节和十六个字节（一页）
{%endright%}
{%warning%}
m24c02的写入地址范围为0至256，且页写入存在页回卷，起始地址最好为16的倍数
{%endwarning%}
```c
//写入一个字节，addr范围为0至256
uint8_t m24c02_wirte_byte(uint8_t addr,uint8_t data){
  //发出起始信号
  iic_start();
  //发出器件地址，即M24C02_WADDR，如果没有收到应答信号，返回1
  iic_send_byte(M24C02_WADDR);
  if(iic_wait_ack(100)!=0) return 1;
  //发送写入位置，如果没有收到应答信号，返回2
  iic_send_byte(addr);
  if(iic_wait_ack(100)!=0) return 2;
  //发送写入数据，如果没有收到应答信号，返回3
  iic_send_byte(data);
  if(iic_wait_ack(100)!=0) return 3;
  //发送停止信号
  iic_end();
  return 0;
}
//写入十六个字节，addr范围为0至256
uint8_t m24c02_wirte_page(uint8_t addr,uint8_t *data){
  uint8_t i;
  //发出起始信号
  iic_start();
  //发出器件地址，即M24C02_WADDR
  iic_send_byte(M24C02_WADDR);
  //如果一定时间没有收到应答，则返回1
  if(iic_wait_ack(100)!=0) return 1;
  //发送写入位置，如果没有收到应答，返回2
  iic_send_byte(addr);
  if(iic_wait_ack(100)!=0) return 2;
  //一页大小为16字节，所以循环发送16个字节
  for(i=0;i<16;i++){
  //发送写入数据，如果没有收到应答，返回3
  iic_send_byte(data[i]);
  if(iic_wait_ack(100)!=0) return 3+i;
  }
  //发送停止信号
  iic_end();
  return 0;
}
```
**③读取函数**
>**概述**：先发送**起始信号**、**器件写地址**和**读取地址**，重发**起始信号**和**器件读地址**，随后**读数据**并发送**结束信号**
{%list%}
除了起始信号、停止信号，主机的每个信号都需要从机应答
{%endlist%}
{%warning%}
主机读取从机数据时，最后一个数据信号不需要应答
{%endwarning%}
```c
uint8_t m24c02_read_data(uint8_t addr,uint8_t *data,uint16_t len){
  uint8_t i;
  //发出起始信号
  iic_start();
  //发出器件地址，即M24C02_WADDR，如果没有收到应答信号，返回1
  iic_send_byte(M24C02_WADDR);
  if(iic_wait_ack(100)!=0) return 1;
  //发送读取位置，如果没有收到应答信号，返回2
  iic_send_byte(addr);
  if(iic_wait_ack(100)!=0) return 2;
  //发出起始信号
  iic_start();
  //发出读器件地址，即M24C02_RADDR，如果没有收到应答信号，返回3
  iic_send_byte(M24C02_RADDR);
  if(iic_wait_ack(100)!=0) return 3;
  //注意最后一个数据不需要应答
  for(i=0;i<len-1;i++){
    data[i] = iic_read_byte(1);
  }
  data[len] = iic_read_byte(0);
  //发送停止信号
  iic_end();
  return 0;
}
```
### 4.FLASH通信
#### 4.1引言
**①FMC**
>**概述**：全称为**闪存控制器**，提供了**片上闪存**需要的所有功能，`GD32F103C8T6`的**片上闪存**大小为`64K`
{%list%}
为了使用FMC，需要在RTE_Components.h中定义对应宏，并将gd32f10x_fmc.c加入工程
{%endlist%}
{%right%}
在闪存的前256K字节空间内，CPU执行指令零等待，在此范围外，会有较长延时
{%endright%}
```c
/* RTE_Components.h文件 */
#ifndef GD32F10X_RTE_H
#define GD32F10X_RTE_H

#define RTE_DEVICE_STDPERIPHERALS_GPIO
#define RTE_DEVICE_STDPERIPHERALS_MISC
#define RTE_DEVICE_STDPERIPHERALS_RCU
#define RTE_DEVICE_STDPERIPHERALS_USART
#define RTE_DEVICE_STDPERIPHERALS_DMA
#define RTE_DEVICE_STDPERIPHERALS_FMC

#endif
```
**②W25Q64**
>**概述**：一款**Flash存储芯片**，大小为`8M`，使用**SPI总线通讯协议**与**微控制器**通信
{%list%}
电路原理图如下，其使用PA4和PA5为片选线和时钟线，输入线和输出线分别为PA7和PA6
{%endlist%}
{%right%}
W25Q64以256字节为一页，4K为一个扇区，16个扇区为1块
{%endright%}
![数据读取](/image/bootloader_8.png)
**③片上闪存读写**
>**概述**：创建`flash.c`和`flash.h`文件并将`flash.c`加入工程，在`flash.c`调用**对应接口**读写**片上闪存**
{%list%}
以页为单位擦除，内存页大小为1kb，以四个字节为单位写入
{%endlist%}
{%right%}
每次读写前都要解锁片上闪存，并在操作完后锁上片上闪存
{%endright%}
{%warning%}
注意片上闪存的起始地址为0x08000000
{%endwarning%}
```c
#ifndef FLASH_H
#define FLASH_H
#include "stdint.h"
//函数声明
void gd32flash_erase(uint16_t start,uint16_t num);
void gd32flash_write(uint32_t addr,uint32_t *wdata,uint32_t num);
#endif
```
```c
#include "gd32f10x.h"
#include "flash.h"

//从第start页开始擦除num个页，内存页大小为1kb
void gd32flash_erase(uint16_t start,uint16_t num){
	uint16_t i;
	fmc_unlock();
	for(i=0;i<num;i++){
		fmc_page_erase((0x08000000 + start * 1024)+1024 * i);
	}
	fmc_lock();
}
//写片上内存
void gd32flash_write(uint32_t addr,uint32_t *wdata,uint32_t num){
	fmc_unlock();
	while(num){
		//该函数每次向addr写入四个字节
		fmc_word_program(addr,*wdata);
		num -= 4;
		addr += 4;
		wdata++;
	}
	fmc_lock();
}
```
#### 4.2SPI通信
**①准备工作**
>**概述**：创建`spi.c`和`spi.h`文件并将`spi.c`加入工程，在`spi.c`定义**初始化**函数
{%list%}
为了使用SPI，需要在RTE_Components.h中定义对应宏，并将gd32f10x_spi.c加入工程
{%endlist%}
{%right%}
在用户手册中搜索PA5，可知PA5属于SPI0
{%endright%}
{%warning%}
需要从外设手册中获取其支持的SPI工作模式，且SPI0的时钟频率不能高于外设最高频率
{%endwarning%}
```c
#ifndef GD32F10X_RTE_H
#define GD32F10X_RTE_H

#define RTE_DEVICE_STDPERIPHERALS_GPIO
#define RTE_DEVICE_STDPERIPHERALS_MISC
#define RTE_DEVICE_STDPERIPHERALS_RCU
#define RTE_DEVICE_STDPERIPHERALS_USART
#define RTE_DEVICE_STDPERIPHERALS_DMA
#define RTE_DEVICE_STDPERIPHERALS_FMC
#define RTE_DEVICE_STDPERIPHERALS_SPI

#endif
```
```c
#ifndef SPI_H
#define SPI_H

#include "stdint.h"
void    spi0_init(void);
uint8_t spi0_readwrite_byte(uint8_t txd);
void    spi0_write(uint8_t *wdata,uint16_t len);
void    spi0_read(uint8_t *rdata,uint16_t len);

#endif
```
```c
#include "gd32f10x.h"
#include "spi.h"
void spi0_init(void){
  //打开SPI0和GPLOA的时钟
  rcu_periph_clock_enable(RCU_SPI0);
  rcu_periph_clock_enable(RCU_GPIOA);
  //GPIO的初始化，5和7为输出引脚，6为输入引脚
  gpio_init(GPIOA,GPIO_MODE_AF_PP,GPIO_OSPEED_50MHZ,GPIO_PIN_5 | GPIO_PIN_7);
  gpio_init(GPIOA,GPIO_MODE_IN_FLOATING,GPIO_OSPEED_50MHZ,GPIO_PIN_6);
  //创建初始化所需要的结构体，详细可见gd32f10x_spi.c
  spi_parameter_struct spi0_init_struct;
  //设为主机模式、双线全双工、数据宽度为8位，片选软件实现
  spi0_init_struct.device_mode = SPI_MASTER;
  spi0_init_struct.trans_mode = SPI_TRANSMODE_FULLDUPLEX;
  spi0_init_struct.frame_size = SPI_FRAMESIZE_8BIT;
  spi0_init_struct.nss = SPI_NSS_SOFT;
  //先发送最高位、传统spi工作模式
  spi0_init_struct.endian = SPI_ENDIAN_MSB;
  spi0_init_struct.clock_polarity_phase = SPI_CK_PL_LOW_PH_1EDGE;
  //设置时钟频率除以几，SPI0属于APB2时钟控制单元，最高108M，器件的主频最高为133
  //所以选择除以2，最快的那个
  spi0_init_struct.prescale = SPI_PSC_2;
  //重置并设置SPI0
  spi_i2s_deinit(SPI0);
  spi_init(SPI0,&spi0_init_struct);
  //开启SPI0
  spi_enable(SPI0);
}
```
**②SPI读写**
>**概述**：检测`SPI0`**发送寄存器**和**接收寄存器**是否为空，当其为空时**发送/接收数据**
{%list%}
SPI通信协议规定主机发送一个数据，从机一定会回一个数据，想要读取数据也要发送一个数据
{%endlist%}
{%right%}
主机可以发送0xff用于获取从机的数据
{%endright%}
```c
//SPI读写字节
uint8_t spi0_readwrite_byte(uint8_t txd){
  //如果发送缓冲区不为空，空循环等待
  while(spi_i2s_flag_get(SPI0,SPI_FLAG_TBE)!=1);
  //发送数据
  spi_i2s_data_transmit(SPI0,txd);
  //如果接收缓冲区不为空，空循环等待
  while(spi_i2s_flag_get(SPI0,SPI_FLAG_RBNE)!=1);
  //接收数据
  return spi_i2s_data_receive(SPI0);
}
//将data数组的数据发送到SPI从机
void spi0_write(uint8_t *wdata,uint16_t len){
  uint16_t i;
  for(i=0;i<len;i++){
    spi0_readwrite_byte(wdata[i]);
  }
}
//将SPI从机数据读入rdata数组
void spi0_read(uint8_t *rdata,uint16_t len){
  uint16_t i;
  for(i=0;i<len;i++){
    rdata[i] = spi0_readwrite_byte(0xff);
  }
}
```
#### 4.3W25Q64通信
**①准备工作**
>**概述**：创建`w25q64.c`和`w25q64.h`文件并将`w25q64.c`加入工程
{%list%}
在w25q64.h定义软件片选，在w25q64.c定义初始化函数、询问函数和启动函数
{%endlist%}
{%right%}
根据W25Q64芯片手册，利用SPI0发送对应的指令字节实现对应的功能
{%endright%}
{%warning%}
使用W25Q64前，需要先确认其是否处于繁忙状态
{%endwarning%}
```c
#ifndef W25Q64_H
#define W25Q64_H
#include "stdint.h"
//软件片选，根据电路原理图，片选线即PA4为低电平表示被选中
#define CS_ENABLE    gpio_bit_reset(GPIOA,GPIO_PIN_4);
#define CS_DISENABLE gpio_bit_set(GPIOA,GPIO_PIN_4);
/* 函数声明 */
void w25q64_init(void);
void w25q64_wait_busy(void);
void w25q64_enable(void);
void w25q64_erase64k(uint8_t blocknum);
void w25q64_writepage(uint8_t *wbuf,uint16_t pagenum);
void w25q64_read(uint8_t *rbuf,uint32_t addr,uint32_t datalen);
#endif
```
```c
#include "gd32f10x.h"
#include "spi.h"
#include "w25q64.h"

void w25q64_init(void){
  //打开PA4的时钟并将PA4初始化为输出引脚
  rcu_periph_clock_enable(RCU_GPIOA);
  gpio_init(GPIOA,GPIO_MODE_OUT_PP,GPIO_OSPEED_50MHZ,GPIO_PIN_4);
  //关闭片选
  CS_DISENABLE;
  spi0_init();
}
void w25q64_wait_busy(void){
  uint8_t res;
  //读取状态寄存器，如果繁忙则一直读取
  do{
    //开始发送指令
    CS_ENABLE;
    //需要发送对应的指令才能查询状态寄存器
    //查器件手册可知，查看其是否繁忙，需要发送0x05，随后其返回状态
    spi0_readwrite_byte(0x05);
    res = spi0_readwrite_byte(0xff);
    //指令发送完毕
    CS_DISENABLE;
  }while((res&0x01)==0x01);
}
void w25q64_enable(void){
	//查手册可知，启动w25q64需要发送指令0x06
	w25q64_wait_busy();
	CS_ENABLE;
	spi0_readwrite_byte(0x06);
	CS_DISENABLE;
}
```
**②擦除函数**
>**概述**：启动`W25Q64`，将**擦除指令**和**起始地址**依次发送即可，其中**起始地址**采用**大端传输**
{%list%}
W25Q64一次可擦除的大小为4K、32K、64K和8M
{%endlist%}
{%right%}
W25Q64的目的存放A区程序，而GD32F103C8T6片内闪存大小为64K，所以以64K为操作单位即可
{%endright%}
{%warning%}
最后调用w25q64_wait_busy保证操作完成再退出
{%endwarning%}
```c
void w25q64_erase64k(uint8_t blocknum){
  uint8_t command[4];
  //擦除指令需要先发送0xD8，随后从高到低发送需要擦除的地址
  command[0] = 0xD8;
  command[1] = blocknum*64*1024>>16;
  command[2] = blocknum*64*1024>>8;
  command[3] = blocknum*64*1024>>0;
  //发送指令
  w25q64_enable();
  CS_ENABLE;
  spi0_write(command,4);
  CS_DISENABLE;
  //确保操作完成再退出
  w25q64_wait_busy();
}
```
**③读写函数**
>**概述**：类似的，启动`W25Q64`，发送**读写指令**以及**起始地址**，随后进行相关的数据操作
{%list%}
W25Q64写操作一次可以写入一页，即256个字节，读取则可以从任意地址读任意数量
{%endlist%}
```c
void w25q64_writepage(uint8_t *wbuf,uint16_t pagenum){
  uint8_t command[4];
  //需要先发送0x02，随后从高到低发送需要擦除的地址
  command[0] = 0x02;
  command[1] = pagenum*256>>16;
  command[2] = pagenum*256>>8;
  command[3] = pagenum*256>>0;
  //发送指令，并进行写操作
  w25q64_enable();
  CS_ENABLE;
  spi0_write(command,4);
  spi0_write(wbuf,256);
  CS_DISENABLE;
  //确保操作完成再退出
  w25q64_wait_busy();
}
void w25q64_read(uint8_t *rbuf,uint32_t addr,uint32_t datalen){
  uint8_t command[4];
  //需要先发送0x03，随后从高到低发送需要读取的起始地址
  command[0] = 0x03;
  command[1] = addr>>16;
  command[2] = addr>>8;
  command[3] = addr>>0;
  w25q64_wait_busy();
  CS_ENABLE;
  spi0_write(command,4);
  spi0_read(rbuf,datalen);
  CS_DISENABLE;
  //确保操作完成再退出
  w25q64_wait_busy();
}

```