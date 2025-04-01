---
title: STM32入门（一）
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
summary: 基础外设
---
# STM32入门
## STM32入门（一）
### 1.STM32工程构建
#### 1.1准备工作
**①资料下载**
>**概述**：在[keil官网](https://www.keil.arm.com/devices/)下载**芯片支持包**，在[STM32官网](https://www.st.com.cn/zh/embedded-software/stm32-standard-peripheral-libraries.html)下载**标准外设库**，在[FreeRTOS官网](https://freertos.org/)中下载**源码**
{%list%}
采用的芯片型号为STM32F103C8T6，在keil官网搜索STM32F103，在STM32官网点击F1即可找到对应资料
{%endlist%}
{%right%}
还可在STM32官网下载对应的参考手册和数据手册，搜索STM32F103C8即可
{%endright%}
>**数据手册**给出**性能指标和参数**，**参考手册**给出**芯片使用方式**

![所需资料](/image/stm32_1.png)

**②Keil安装**
>**概述**：在[keil官网](https://www.keil.com/demo/eval/arm.htm)下载**ARM版本Keil**，具体**安装和破解**过程可参考[参考文章](https://blog.csdn.net/lemou1211/article/details/128907850)
{%list%}
由于STM32F103C8T6标准库需要使用ARM_Compiler_5编译，而MDK5.37开始，不再默认安装，需要独立安装
{%endlist%}
>**安装教程**可参考[ARM_Compiler_5安装](https://blog.csdn.net/u010160146/article/details/136332704)
{%warning%}
ARM_Compiler_5的安装路径需为{$Keil安装目录}\ARM\ARM_Compiler_5.06u7，否则会出现证书问题
{%endwarning%}
![keil安装](/image/stm32_2.png)
#### 1.2空白工程构建
**①文件提取**
>**概述**：创建**工程文件夹**，并创建**子文件夹**`CMSIS`、`FWLIB`、`MYLIB`和`USER`，从**标准库**中提取相关文件
{%list%}
CMSIS存放内核函数及启动引导文件，FWLIB存放标准库，MYLIB存放自己的库，USER存放主函数和工程文件等
{%endlist%}
>`CMSIS`：`Libraries\CMSIS\CM3\CoreSupport`和`Libraries\CMSIS\CM3\DeviceSupport\ST\STM32F10x`下的所有文件

>`FWLIB`：`Libraries\STM32F10x_StdPeriph_Driver`中的`inc`和`src`文件夹

>`USER`：`Project\STM32F10x_StdPeriph_Template`中**除了文件夹**的所有文件

![CMSIS](/image/stm32_3.png)
![FWLIB](/image/stm32_4.png)
![USER](/image/stm32_5.png)
**②Keil工程构建**
>**概述**：点击`project`新建工程，新建分组`CMSIS`、`USER`、`FWLIB`、`STARTUP`和`MYLIB`并**添加对应文件**
{%list%}
创建工程过程中需要选择芯片包，所以在新建工程前需要单击Keil.STM32F1xx_DFP.2.4.1.pack下载对应芯片包
{%endlist%}
{%right%}
在分组中添加的文件都在对应文件夹中，STARTUP分组文件位于CMSIS\startup\arm下
{%endright%}
>其中`startup_stm32f10x_ld.s`和`startup_stm32f10x_md.s`需要进行**一定的设置**，并清除`main.c`文件，如下所示
{%warning%}
编译前需要在项目设置的target选项卡中检查编译器版本是否为5
{%endwarning%}
![芯片包选择](/image/stm32_6.png)
![新建分组](/image/stm32_7.png)
![项目设置](/image/stm32_8.png)
![文件设置](/image/stm32_9.png)
![项目编译](/image/stm32_10.png)

#### 1.3FreeRTOS移植
**①文件提取**
>**概述**：在**项目文件夹**下添加`FreeRTOS`文件夹，并创建`inc`、`src`和`portable`子文件夹，从源码中提取**相关文件**
{%list%}
inc存放头文件，src存放源文件，portable存放移植相关文件
{%endlist%}
{%right%}
FreeRTOSConfig.h为FreeRTOS的配置文件，需要自己创建，可以从官方提供的示例文件夹中找到
{%endright%}
>`inc`：`FreeRTOS\Source\include`下**所有头文件**和`FreeRTOSConfig.h`文件

>`src`：`FreeRTOS\Source\include`下所有**源文件**

>`portable`：`FreeRTOS\Source\portable`下`Keil`、`MemMang`和`RVDS\ARM_CM3`子文件夹所有**头文件和源文件**

![inc](/image/stm32_12.png)
![src](/image/stm32_13.png)
![portable](/image/stm32_14.png)
**②Keil工程设置**
>**概述**：创建`FreeRTOS/source`和`FreeRTOS/portable`分组并**添加对应源文件**，添加**头文件路径**并**设置回调函数**
{%list%}
有port.c可知，FreeRTOS定义了自己的PendSV、SVC和SysTick中断函数，需要进行一定的修改
{%endlist%}
{%right%}
将STM32的PendSV、SVC中断处理函数注释掉，并使用FreeRTOS提供的，在SysTick_Handler调用FreeRTOS版本
{%endright%}
{%warning%}
为了在main函数中使用FreeRTOS，需要包含FreeRTOS.h头文件
{%endwarning%}
![新建分组](/image/stm32_11.png)
```c
/* port.c */
/*
 * Exception handlers.
 */
void xPortPendSVHandler( void );
void xPortSysTickHandler( void );
void vPortSVCHandler( void );
```
```c

/* stm32f01x_it.c */
/*
void SVC_Handler(void)
{
}
*/
/*
void PendSV_Handler(void)
{
}
*/
void SysTick_Handler(void)
{
  #if (INCLUDE_xTaskGetSchedulerState  == 1 )
    if (xTaskGetSchedulerState() != taskSCHEDULER_NOT_STARTED)
    {
  #endif  /* INCLUDE_xTaskGetSchedulerState */  
      xPortSysTickHandler();
  #if (INCLUDE_xTaskGetSchedulerState  == 1 )
    }
  #endif  /* INCLUDE_xTaskGetSchedulerState */
}
```
```c
/* FreeRTOSConfig.h */
//回调函数替换
#define xPortPendSVHandler PendSV_Handler
#define vPortSVCHandler SVC_Handler
extern void xPortSysTickHandler(void);
```
```c
/* main.c */
#include "stm32f10x.h"
#include "FreeRTOS.h"
int main(){
	
}
```
### 2.基础外设
#### 2.1引言
**①型号**
>**概述**：以`STM32F103C8T6`为例，`M32`表示其为**32位**单片机，其**产品系列**为`F103`，**规格**为`C8T6`
{%list%}
STM32主要有G、F、H、L和W系列，F系列最为常见，其中F1系列使用M3内核，主频为72MHz
{%endlist%}
{%right%}
规格指示了引脚数量、FLASH容量、封装类型和温度范围
{%endright%}
>`C`表示**引脚数量**为`48`，`8`表示**FLASH容量**为`64K`，`T`表示**封装类型**为`LQFP`，`6`表示**温度范围**为`-40~85°C`

**②引脚**
>**概述**：在**数据手册**中找到**封装方式**为`LQFP`、**引脚数量**为`48`的**引脚分布图**，如下所示
{%list%}
可分为GPIO引脚、VDD供电引脚、VSS接地引脚、NRST复位引脚、VBAT备用电池引脚、BOOT0启动模式选择引脚
{%endlist%}
{%right%}
编号为1的引脚在芯片上会有一个圆圈提示，并沿着逆时针方向递增
{%endright%}
![引脚分布](/image/stm32_15.png)
**③外设分布**
>**概述**：在**数据手册**中找到**外设分布图**，详细如下
{%list%}
大部分外设分别被挂载到AP1和APB2总线上，在配置外设时需要注意使用对应的接口
{%endlist%}
![外设分布](/image/stm32_16.png)
#### 2.2系统时钟
**①时钟源**
>**概述**：可分为**高速内部时钟**`HSI`、**高速外部时钟**`HSE`、**低速内部时钟**`LSI`和**低速外部时钟**`LSE`
{%list%}
时钟源用于提供时钟信号，其中内部时钟源的精度和稳定性较低，主要用于启动外部时钟或低精度场合
{%endlist%}
{%right%}
低速时钟源主要用于低功耗场合和和外设，如看门狗定时器和实时钟
{%endright%}
![时钟源](/image/stm32_17.png)
**②时钟树**
>**概述**：不同外设使用的**时钟源**和**频率**不同，需要使用**分频器**和**倍频器**控制
{%list%}
时钟线HCLK为AHB的一部分，外设的时钟通常由HCLK提供
{%endlist%}
![时钟树](/image/stm32_18.png)
**③时钟配置**
>**概述**：初始时，`STM32F103C8T6`使用`HSI`为**时钟源**，且`AHB`、`APB1`和`APB2`的**分频器**均为`/1`
{%list%}
在跳转到main函数之前，启动文件执行了SystemInit函数，配置了时钟树，并开启了指令预取
{%endlist%}
>`SystemInit`将**时钟源**改为**经过锁相环乘以九**的`HSE`，且`AHB`、`APB1`和`APB2`的**分频器**分别为`/1`、`/1`和`/2`
{%right%}
指令预取即在CPU处理指令时，FLASH将后续指令提前存入一个缓冲区，CPU从该缓冲区中取指执行
{%endright%}
{%warning%}
指令预取的配置需要在SYSCLK<=24MHz时进行
{%endwarning%}
```c
void SystemInit (void)
{
  /* Reset the RCC clock configuration to the default reset state(for debug purpose) */
  /* Set HSION bit */
  RCC->CR |= (uint32_t)0x00000001;

  /* Reset SW, HPRE, PPRE1, PPRE2, ADCPRE and MCO bits */
#ifndef STM32F10X_CL
  RCC->CFGR &= (uint32_t)0xF8FF0000;
#else
  RCC->CFGR &= (uint32_t)0xF0FF0000;
#endif /* STM32F10X_CL */   
  
  /* Reset HSEON, CSSON and PLLON bits */
  RCC->CR &= (uint32_t)0xFEF6FFFF;

  /* Reset HSEBYP bit */
  RCC->CR &= (uint32_t)0xFFFBFFFF;

  /* Reset PLLSRC, PLLXTPRE, PLLMUL and USBPRE/OTGFSPRE bits */
  RCC->CFGR &= (uint32_t)0xFF80FFFF;

#ifdef STM32F10X_CL
  /* Reset PLL2ON and PLL3ON bits */
  RCC->CR &= (uint32_t)0xEBFFFFFF;

  /* Disable all interrupts and clear pending bits  */
  RCC->CIR = 0x00FF0000;

  /* Reset CFGR2 register */
  RCC->CFGR2 = 0x00000000;
#elif defined (STM32F10X_LD_VL) || defined (STM32F10X_MD_VL) || (defined STM32F10X_HD_VL)
  /* Disable all interrupts and clear pending bits  */
  RCC->CIR = 0x009F0000;

  /* Reset CFGR2 register */
  RCC->CFGR2 = 0x00000000;      
#else
  /* Disable all interrupts and clear pending bits  */
  RCC->CIR = 0x009F0000;
#endif /* STM32F10X_CL */
    
#if defined (STM32F10X_HD) || (defined STM32F10X_XL) || (defined STM32F10X_HD_VL)
  #ifdef DATA_IN_ExtSRAM
    SystemInit_ExtMemCtl(); 
  #endif /* DATA_IN_ExtSRAM */
#endif 

  /* Configure the System clock frequency, HCLK, PCLK2 and PCLK1 prescalers */
  /* Configure the Flash Latency cycles and enable prefetch buffer */
  SetSysClock();

#ifdef VECT_TAB_SRAM
  SCB->VTOR = SRAM_BASE | VECT_TAB_OFFSET; /* Vector Table Relocation in Internal SRAM. */
#else
  SCB->VTOR = FLASH_BASE | VECT_TAB_OFFSET; /* Vector Table Relocation in Internal FLASH. */
#endif 
}
```
#### 2.3GPIO
**①简介**
>**概述**：称为**通用输入输出端口**，**引脚电平**通常为`0~3.3V`，**结构简图**如下所示
{%list%}
GPIO通常被分为很多组，每组有多个GPIO引脚，STM32F103C8T6将其分为A、B、C、D四组，每组16个引脚
{%endlist%}
{%right%}
每组GPIO都有对应外设，通过读写该外设寄存器控制该组GPIO引脚
{%endright%}
{%warning%}
一个寄存器可以控制多个GPIO引脚，所以在修改一个引脚配置时不能影响其他引脚
{%endwarning%}
>通常是先**读取寄存器**，再修改读取值的**某一位**，最后**写回寄存器**

![GPIO结构简图](/image/gpio_1.png)
**②输入模式**
>**概述**：有**浮空输入**、**上拉输入**、**下拉输入**和**模拟输入**四种模式，**输出电路**简图如下
{%list%}
模拟输入模式用于读取模拟信号，不经过施密特触发器，其余三种模式经过施密特触发器被转化为高低电平
{%endlist%}
{%right%}
通常使用浮空输入模式，当输入信号较弱，容易受到干扰时，选择上拉输入模式
{%endright%}
>**浮空输入**：不使用**上拉/下拉电阻**，当引脚为**高电平/低电平**时，输入值为`1/0`，**无输入**时输入值**不稳定**

>**上拉输入**：使用**上拉电阻**，当引脚为**高电平/低电平**时，输入值为`1/0`，**无输入**时输入值为`1`

>**下拉输入**：使用**下拉电阻**，当引脚为**高电平/低电平**时，输入值为`1/0`，**无输入**时输入值为`0`

![输入电路简图](/image/gpio_2.png)

**③输出模式**
>**概述**：有**通用推挽输出**、**通用开漏输出**、**推挽复用输出**和**开漏复用输出**四种模式，**输入电路**简图如下
{%list%}
通用表示输出信号直接来自于CPU，复用表示输出信号来自于其他片上外设
{%endlist%}
{%right%}
推挽输出模式可以将引脚视作为一个电源，开漏输出模式可以将引脚视作为一个开关，需要外接电源才能正常工作
{%endright%}
{%warning%}
输出速度不能太快，因为信号变化需要一定的上升时间和下降时间，输出速度太快会导致保持时间过短
{%endwarning%}
>通常选择**满足要求的最小值**，以**减少耗电**并避免`EMI`问题

>**推挽输出**：使用`P-MOS`和`N-MOS`，当输出为`1/0`时，`P-MOS/N-MOS`导通，引脚为**高电平/低电平**

>**开漏输出**：只使用`N-MOS`，当输出为`1/0`时，`N-MOS`**阻塞/导通**，引脚为**高阻态/低电平**

![输出电路简图](/image/gpio_3.png)