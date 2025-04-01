---
title: STM32入门（二）
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
summary: 串行通信
---
# STM32入门
## STM32入门（二）
### 1.UART
#### 1.1通信协议
**①简介**
>**概述**：全称为**通用异步收发传输器**，**每个设备**都有一个`RX/TX`引脚，用于**接收/发送**数据，结构简图如下
{%list%}
UART通信为异步全双工通信，采用小端传输
{%endlist%}
>**小端传输**即先发送**低位**，**大端传输**即先发送**高位**
{%right%}
STM32串口还有CK、RTS和CTS引脚，CK用于同步模式，RTS和CTS用于硬件流控
{%endright%}
{%warning%}
UART通信只能实现一对一的数据传输，速度较慢
{%endwarning%}
![UART工作结构简图](/image/uart_1.png)
**②通信协议**
>**概述**：每个数据包由**起始位**、**数据位**、**校验位**和**停止位**组成，以一定的速率即**波特率**传输
{%list%}
常用波特率有9600、115200和921600
{%endlist%}
{%right%}
通常采用8N1，即八数据位、一停止位和无校验位，以下为八数据位、一停止位和奇校验位的示例波形
{%endright%}
{%warning%}
数据传输双方需要预先统一波特率，以便正确的传输数据
{%endwarning%}
>**起始位**：当线路空闲时，一直处于**逻辑**`1`状态，发送一个**逻辑**`0`表示开始传输数据

>**数据位**：紧接着**起始位**后，可以发送`4-8`位**数据位**

>**校验位**：如果采用**奇校验/偶校验**，**数据位**加上**校验位**后，应使`1`的位数为**奇数/偶数**

>**停止位**：发送`0.5/1/1.5/2`位**逻辑**`1`，表示数据**发送完毕**

![示例波形图](/image/uart_2.png)

**③RS232和RS485**
>**概述**：本质上是采用**不同电平**传输逻辑`1`和逻辑`0`的**UART协议**，波形图如下所示
{%list%}
UART逻辑1为2v~5v，逻辑0为0~0.8v，RS232逻辑1为+3v~+15v，逻辑0为-3v~-15v，RS485采用差分信号
{%endlist%}
>**差分信号**采用两根线`A`、`B`，当`A`的电平**高于**`B`的电平时，为逻辑`1`，当`A`的电平**低于**`B`电平时，为逻辑`0`
{%right%}
RS232和RS485的抗干扰能力更强，适合长距离传输，其中RS485为半双工通信，可以采用一主多从的通信方式
{%endright%}
![RS232和RS485波形图](/image/uart_3.png)
#### 1.2串口配置
**①模块结构**
>**概述**：`STM32`串口模块如下所示，主要由**数据寄存器**、**移位寄存器**、**状态寄存器**和**控制寄存器**组成
{%list%}
发送数据时，数据先进入发送数据寄存器，随后进入移位寄存器，最后一位一位发送出去，接受数据流程类似
{%endlist%}
{%right%}
状态寄存器的各个标志位指示了串口传输的状态，还能触发串口的全局中断
{%endright%}
>`TxE`为`1`表示**发送寄存器为空**，`TC`为`1`表示**发送寄存器和移位寄存器为空**，`RxNE`为`1`表示**接收寄存器非空**
{%warning%}
其余为错误标志位，PE为1表示奇偶校验错，FE为1表示帧格式错误，NE为1表示噪声错，ORE为1表示过载错
{%endwarning%}
![模块结构](/image/stm32_19.png)

**②初始化设置**
>**概述**：打开`GPIOA`和`USART1`的**时钟**，配置`TX`和`RX`引脚，并设置**串口相关状态**，如下所示，最后**使能串口**
{%list%}
在引脚分布表中（详细见数据手册P28），查看各个引脚的复用功能，USART1的TX和RX引脚分别对应PA9和PA10
{%endlist%}
{%right%}
在引脚分布表中，USART1的TX和RX引脚被重映射到PA6和PA7，如果需要使用这两个引脚，需要使用AFIO
{%endright%}
```c
typedef struct
{
  uint32_t USART_BaudRate;              //波特率
  uint16_t USART_WordLength;            //数据位+校验位宽度     
  uint16_t USART_StopBits;              //停止位宽度
  uint16_t USART_Parity;                //是否采用校验位
  uint16_t USART_Mode;                  //工作模式，只接受、只发送和接收和发送
  uint16_t USART_HardwareFlowControl;   //是否开启流控
} USART_InitTypeDef;
```
```c
void usart1_init(){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚，TX引脚设置为推挽输出
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_9;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //RX引脚设置为下拉输入
  gpio_init_struct.GPIO_Pin = GPIO_Pin_10;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPU;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //打开串口时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1,ENABLE);
  //初始化串口，设置波特率、硬件流控、收发模式、校验位、停止位和数据位
  USART_InitTypeDef usart_init_struct;
  usart_init_struct.USART_BaudRate = 115200;
  usart_init_struct.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
  usart_init_struct.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
  usart_init_struct.USART_Parity = USART_Parity_No;
  usart_init_struct.USART_Stop_Bits = USART_StopBits_1;
  usart_init_struct.USART_Word_Length = USART_WordLength_8b;
  USART_Init(USART1,&usart_init_struct);
  //使能串口
  USART_Cmd(USART1,ENABLE);
}
```
```c
void usart1_init(){
  //打开AFIO的时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO,ENABLE)
  //开启USART1的重映射
  GPIO_PinRemapConfig(GPIO_Remap_USART1,ENABLE)
  //配置PA6、PA7，并设置串口，略
}
```
**③收发数据**
>**概述**：如下所示，`uart_sendbytes`使用串口**发送多个字节**，`my_uart_receiveline`从串口**接收一行数据**
{%list%}
发送数据前，需要检查TXE标志位确认发送数据寄存器为空，并且等待发送完成
{%endlist%}
{%warning%}
接收串口数据时，需要设置一定的等待时间，并检查接收数组是否过界
{%endwarning%}
```c
//功能：通过串口发送多个字节
//USARTx：串口名称，如USART1, USART2, USART3 ...
//pData：要发送的数据（数组）
//Size：要发送数据的数量，单位是字节
void uart_sendbytes(USART_TypeDef *USARTx, const uint8_t *pData, uint16_t Size)
{
  if(Size <= 0) return;

  for(uint16_t i=0; i < Size; i++)
  {
    //等待发送数据寄存器为空
    while(USART_GetFlagStatus(USARTx, USART_FLAG_TXE) == RESET);
    //将要发送的数据写入发送寄存器中
    USART_SendData(USARTx, pData[i]);
  }
  //等待发送完成
  while(USART_GetFlagStatus(USARTx, USART_FLAG_TC) == RESET);
}
```
```c
//功能：通过串口接收一行数据
//USARTx：串口名称，如USART1, USART2, USART3 ...
//pStrOut：存放接收数据的缓冲区
//MaxLength：能接收的最大长度
//LineSeperator：行分隔符，LINE_SEPERATOR_CR：回车 \r
//                        LINE_SEPERATOR_LF：换行 \n
//                        LINE_SEPERATOR_CRLF：回车+换行 \r\n
//Timeout：超时时间，单位是毫秒，负数表示无限长
int my_uart_receiveline(USART_TypeDef *USARTx, char *pStrOut, uint16_t MaxLength, uint16_t LineSeperator, int Timeout)
{
  // 如果最大长度都不足以装下行分隔符-2
  if(MaxLength < 2 || ((LineSeperator == LINE_SEPERATOR_CRLF) && (MaxLength < 1)))
  {
    return -2;
  }
  //当规定时间内没有接收到对应的行分隔符，返回-1
  int ret = -1;
  uint32_t expireTime;

  Delay_Init(); // 要用到单片机当前时间，所以初始化延迟函数

  if(Timeout >= 0)
  {
    expireTime = GetTick() + Timeout; // 计算过期时间，过期时间 = 当前时间+Timeout
  }

  uint16_t i = 0;

  do
  {
    //当接收寄存器非空时，将其存入缓冲区，并检查是否接收到了行分隔符
    if(USART_GetFlagStatus(USARTx, USART_FLAG_RXNE) == SET)
    {
      char c = (char)USART_ReceiveData(USARTx);
      pStrOut[i++] = c;
      
      if(LineSeperator == LINE_SEPERATOR_CR && c == '\r') 
      {
        ret = 0;
        break;
      }
      else if(LineSeperator == LINE_SEPERATOR_LF && c == '\n')
      {
        ret = 0;
        break;
      }
      else if(i >= 2 && pStrOut[i-2] == '\r' && c == '\n')
      {
        ret = 0;
        break;
      }
      
      if(i == MaxLength) // 超过最大长度
      {
        ret = -2;
        break;
      }
    }
  }
  while(Timeout < 0 || GetTick() < expireTime); // 判断是否超时

  // 在字符串末尾增加'\0'
  if(i == MaxLength)
  {
    pStrOut[i-1] = '\0';
  }
  else
  {
    pStrOut[i] = '\0';
  }
  return ret;
}
```
### 2.IIC
#### 2.1通信协议
**①简介**
>**概述**：全称为**内部集成电路**，主要由**时钟线**`SCL`和**数据线**`SDA`组成，结构简图如下所示
{%list%}
IIC通信为同步半双工通信，采用大端传输，可以实现一对多的数据传输，速度比UART快，比SPI慢
{%endlist%}
>设备被分为**主设备**和**从设备**，主设备**发起和主导**通信（控制`SCL`线），**同一时刻**只能有一个主设备
{%right%}
SCL和SDA线都接上拉电阻，且所有的SCL和SDA引脚都被设置为开漏输出，从而实现逻辑线与，进行一对多的通信
{%endright%}
>**逻辑线与**：以`SCL`为例，只要有**一个设备**的`SCL`引脚为**低电平**，`SCL`线将从**高电平变为低电平**
{%warning%}
只有主设备才能控制SCL线，从设备SCL引脚均被置为1，当一个设备控制SDA线时，其他设备的SDA引脚都置为1
{%endwarning%}

![IIC工作结构简图](/image/iic_1.png)
**②通信协议**
>**概述**：每个数据帧由**起始位**、**数据位**、**应答位**和**停止位**组成
{%list%}
起始时SCL线和SDA线都处于逻辑1状态，接收到起始信号后，SCL线开始产生时钟信号
{%endlist%}
{%right%}
发送的第一个数据位前7位为设备地址，第8位为读写位，1表示读，0表示写
{%endright%}
{%warning%}
接收应答位前，接收方将SDA引脚置1释放SDA线，发送方将SDA引脚置0发送应答信号
{%endwarning%}
>每个设备都有一个**设备地址**，其中有几个**保留地址**有特殊作用，如**广播地址**`0x00`

>**起始位**：`SCL`线为**逻辑**`1`期间，**主设备**将`SDA`线由**逻辑**`1`变为**逻辑**`0`，表示**开始通信**

>**数据位**：**开始通信**或者**接收到应答信号**后，**主设备/从设备**发送`8`位**数据位**

>**应答位**：每接收一个**数据位**，**主设备/从设备**都会发送`1`位**应答位**，若为**逻辑**`0`，表示接收**成功**

>**停止位**：`SCL`线为**逻辑**`1`期间，**主设备**将`SDA`线由**逻辑**`0`变为**逻辑**`1`，表示**结束通信**

![示例波形图](/image/iic_2.png)
**③读写操作**
>**读操作**：如下所示，先使用一个**写操作**写入**读地址**，随后**重新开始**读操作，**读取数据**

>**写操作**：如下所示，发送**设备地址和读写位**后，将**第二个数据位**作为**写地址**，随后**写入数据**
{%list%}
读操作执行写操作写入地址后，不需要结束位
{%endlist%}
{%right%}
读写操作将第二个数据位作为读写起始地址，指示从哪开始读写
{%endright%}
{%warning%}
注意读取数据和写入数据时的发送方和应答方是不同的，前者的发送方为从设备，后者发送方为主设备
{%endwarning%}
![读写操作](/image/iic_3.png)

#### 2.2IIC配置
**①模块结构**
>**概述**：`STM32`的IIC模块如下所示，主要由**数据寄存器**、**移位寄存器**、**状态寄存器**和**控制寄存器**组成
{%list%}
发送数据时，数据先进入发送数据寄存器，随后进入移位寄存器，最后一位一位发送出去，接收数据流程类似
{%endlist%}
{%right%}
状态寄存器的各个标志位指示了IIC传输的状态，还能触发IIC的全局中断
{%endright%}
>`TxE`为`1`表示**发送寄存器为空**，`RxNE`为`1`表示**接收寄存器非空**，`BTF`为`1`表示**发送寄存器和移位寄存器为空**
{%warning%}
发送对应信号后需要检查是否发送完成以及被成功应答
{%endwarning%}
>`SB`为`1`表示**起始信号发送完毕**，`AF`为`1`表示**未收到应答**，`ADDR`为`1`表示**寻址成功**，`BUSY`为`1`表示**总线忙**

![模块结构](/image/stm32_20.png)
**②初始化**
>**概述**：打开`GPIOB`和`IIC1`的**时钟**，配置`SCL`和`SDA`引脚，并设置**IIC相关状态**，如下所示，最后**使能IIC**
{%list%}
在引脚分布表中（详细见数据手册P28），查看各个引脚的复用功能，IIC1的TX和RX引脚分别对应PB6和PB7
{%endlist%}
{%right%}
STM32F103支持的最大波特率为400kbps，当波特率小于100kbps为标准速度模式，大于100kbps为快速模式
{%endright%}
>在**快速模式**下还需要设置**时钟信号占空比**，即一个时钟周期**低电压:高电压**的时间比例
```c
typedef struct
{
  uint32_t I2C_ClockSpeed;           //波特率，最大为400kbps
  uint16_t I2C_Mode;                 //工作模式，即作为主设备/从设备/主从设备均可     
  uint16_t I2C_DutyCycle;            //时钟信号占空比
  //以下参数只有作为从设备时才需要设置
  uint16_t I2C_OwnAddress1;          //自身的设备地址，根据I2C_AcknowledgedAddress设置
  uint16_t I2C_Ack;                  //使能或者关闭响应
  uint16_t I2C_AcknowledgedAddress;  //寻址模式，即地址位长度，可以为为7/10位
}I2C_InitTypeDef;
```
```c
void my_iic_init(void){
  //打开GPIOB时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB,ENABLE);

  //初始化引脚，PB6和PB7均设置为复用开漏模式
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_6 | GPIO_Pin_7;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_OD;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);

  //打开IIC时钟并复位
  RCC_APB1PeriphClockCmd(RCC_APB2Periph_I2C1,ENABLE);
  RCC_APB1PeriphResetCmd(RCC_APB2Periph_I2C1,ENABLE);
  RCC_APB1PeriphResetCmd(RCC_APB2Periph_I2C1,DISABLE);
  //设置IIC
  I2C_InitTypeDef iic_init_struct;
  iic_init_struct.I2C_ClockSpeed = 400000;            //波特率，自动进入快速模式
  iic_init_struct.I2C_Mode = I2C_Mode_I2C;            //模式采用标准IIC模式
  iic_init_struct.I2C_DutyCycle = I2C_DutyCycle_2;    //占空比采用2:1
  I2C_Init(I2C1,&iic_init_struct);

  //使能IIC
  I2C_Cmd(I2C1,ENABLE);
}
```
**③收发数据**
>**概述**：代码如下所示，`my_iic_sendbytes`用于**发送多个字节**，`my_iic_receivebytes`用于**接收多个字节**
{%list%}
收发数据前需要等待总线空闲，且发送起始位、地址位和数据位后需要检查其是否发送成功
{%endlist%}
{%warning%}
接收数据时，需要在对应数据接收之前发送ACK和NAK，并在最后一个数据接收之前发送停止信号
{%endwarning%}
```c
int my_iic_sendbytes(I2C_TypeDef* I2Cx,uint8_t Addr,uint8_t *pData,uint16_t Size){
  //等待总线空闲
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_BUSY) == SET);

  //发送起始位并检查起始位是否发送成功
  I2C_GenerateSTART(I2Cx,ENABLE);
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_SB) == RESET);

  //发送地址并检查地址是否发送成功
  I2C_ClearFlag(I2Cx,I2C_FLAG_AF);
  I2C_SendData(I2Cx,Addr & 0xfe);
  while(1){
    //成功和从设备建立通信
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_ADDR) == SET) break;
    //地址接收失败
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_AF) == SET){
      I2C_GenerateSTOP(I2Cx,ENABLE);
      return -1;
    }
  }
  //清除ADDR标志位
  I2C_ReadRegister(I2Cx,I2C_Register_SR1);
  I2C_ReadRegister(I2Cx,I2C_Register_SR2);

  //发送数据，发送每个数据前检查上个数据是否发送成功并等待发送寄存器为空
  for(uint16_t i = 0;i<Size;i++){
    while(1){
      //上个数据没有被接收
      if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_AF) == SET){
        I2C_GenerateSTOP(I2Cx,ENABLE);
        return -2;
      }
      //等待发送寄存器为空
      if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_TXE) == SET){
        break;
      }
    }
    I2C_SendData(I2Cx,pData[i]);
  }
  //发送完数据后，检查最后一个数据是否接收成功
  while(1){
    //上个数据没有被接收
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_AF) == SET){
      I2C_GenerateSTOP(I2Cx,ENABLE);
      return -2;
    }
    //数据发送完成
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_BTF) == SET){
      break;
    }
  }
  //结束通信
  I2C_GenerateSTOP(I2Cx,ENABLE);
  return 0;
}
```
```c
int my_iic_receivebytes(I2C_TypeDef* I2Cx,uint8_t Addr,uint8_t *pBuffer,uint16_t Size){
  //等待总线空闲
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_BUSY) == SET);

  //发送起始位并检查是否发送成功
  I2C_GenerateSTART(I2Cx,ENABLE);
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_SB) == RESET);

  //发送地址并检查是否发送成功
  I2C_ClearFlag(I2Cx,I2C_FLAG_AF);
  I2C_SendData(I2Cx,Addr | 0x01);
  while(1){
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_ADDR) == SET) break;
    if(I2C_GetFlagStatus(I2Cx,I2C_FLAG_AF) == SET){
      I2C_GenerateSTOP(I2Cx,ENABLE);
      return -1;
    }
  }
  //必须在读取数据接收完成前发送NAK和停止信号
  if(Size == 1){
  //清除ADDR标志位
  I2C_ReadRegister(I2Cx,I2C_Register_SR1);
  I2C_ReadRegister(I2Cx,I2C_Register_SR2);
  //发送NAK
  I2C_AcknowledgeConfig(I2Cx,DISABLE);
  //发送停止位
  I2C_GenerateSTOP(I2Cx,ENABLE);
  //等待RxNE置位，数据接收完成
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_RxNE) == RESET);
  //读取数据
  pBuffer[0] = I2C_ReceiveData(I2Cx);
  }
  else if(Size == 2){
  //清除ADDR
  I2C_ReadRegister(I2Cx,I2C_Register_SR1);
  I2C_ReadRegister(I2Cx,I2C_Register_SR2); 
  //发送ACK
  I2C_AcknowledgeConfig(I2Cx,ENABLE);
  //等待接收完成
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_RxNE) == RESET);
  //读取第一个字节
  pBuffer[0] = I2C_ReceiveData(I2Cx);
  //发送NAK
  I2C_AcknowledgeConfig(I2Cx,DISABLE);
  //发送停止位
  I2C_GenerateSTOP(I2Cx,ENABLE);
  //等待接收完成
  while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_RxNE) == RESET);
  //读取第二个字节
  pBuffer[1] = I2C_ReceiveData(I2Cx);
  }
  else{
    //清除ADDR（先读SR1，再读SR2）
    I2C_ReadRegister(I2Cx,I2C_Register_SR1);
    I2C_ReadRegister(I2Cx,I2C_Register_SR2);
    //接收前Size-1个字节
    for(uint16_t i = 0;i<Size-1;i++){
    //发送ACK
    I2C_AcknowledgeConfig(I2Cx,ENABLE);
    //等待接收完成
    while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_RxNE) == RESET);
    //读取第一个字节
    pBuffer[i] = I2C_ReceiveData(I2Cx);  
    }
    //发送NAK
    I2C_AcknowledgeConfig(I2Cx,DISABLE);
    //发送停止位
    I2C_GenerateSTOP(I2Cx,ENABLE);
    //等待接收完成
    while(I2C_GetFlagStatus(I2Cx,I2C_FLAG_RxNE) == RESET);
    //读取最后一个字节
    pBuffer[Size] = I2C_ReceiveData(I2Cx);  
  }
  return 0;
}
```
#### 2.3软件IIC
**①引言**
>**概述**：使用两个`GPIO`引脚作为`SCL`和`SDA`，并根据**IIC通信协议**发送对应波形
{%list%}
编写软件IIC前，需要初始化对应引脚并提供延时函数
{%endlist%}
{%right%}
软件IIC可以选择任意两个GPIO引脚实现通信，移植方便，适用于
{%endright%}
{%warning%}
软件IIC通信速度较慢，需要占用CPU资源，且不支持从机模式和中断机制
{%endwarning%}
```c
void my_siic_init(void){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_0 | GPIO_Pin_1;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_Out_OD;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_2MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
}
void scl_write(uint8_t level){
  if(0 == level){
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_RESET);
  }else{
    GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_SET);
  }
}
void sda_write(uint8_t level){
  if(0 == level){
    GPIO_WriteBit(GPIOA,GPIO_Pin_1,Bit_RESET);
  }else{
    GPIO_WriteBit(GPIOA,GPIO_Pin_1,Bit_SET);
  }
}
uint8_t sda_read(void){
  if(GPIO_ReadInputDataBit(GPIOA,GPIO_Pin_1) == Bit_SET){
    return 1;
  }else{
    return 0;
  }
}
void delay_us(uint32_t us){
  uint32_t n = us*8;
  for(uint32_t i = 0;i<n;i++);
}
```
**②起始和终止信号**
>**概述**：代码如下所示，在`SCL`线为高时，**拉低/高**`SDA`线发送**起始信号/终止信号**
{%list%}
以4us为一个周期
{%endlist%}
{%right%}
发送停止信号前需要先拉低SDA线，因为终止信号需要将SDA线由低变高
{%endright%}
{%warning%}
改变SDA线前，需要暂时拉低SCL线1/4个周期
{%endwarning%}
```c
//起始信号
void siic_send_start(void){
  //初始时SCL和SDA线均为高电平
  scl_write(1);
  sda_write(1);
  delay_us(1);
  //拉低SDA发送起始信号
  sda_write(0);
  delay_us(1);
}
//终止信号
void siic_send_end(void){
  //拉低SCL线1/4周期，使得SDA线可以改变
  scl_write(0);
  delay_us(1);
  //拉低SDA线1/4周期，为发送停止信号做准备
  sda_write(0);
  delay_us(1);
  //拉高SCL线1/4周期，为发送停止信号做准备
  scl_write(1);
  delay_us(1);
  //拉高SDA线1/4周期，发送停止信号
  sda_write(1);
  delay_us(1);
}
```
**③发送数据**
>**概述**：代码如下所示，`siic_send_byte`用于发送**一个字节**，`siic_send_bytes`用于发送**多个字节**
{%list%}
每次发送一个字节，需要将SDA拉高以释放总线，并使用一个周期读取应答信号
{%endlist%}
```c
//发送一个字节
uint8_t siic_send_byte(uint8_t byte){
  //注意这里必须是有符号数i
  for(int8_t i = 7;i >= 0;i--){
    //拉低SCL线以便设置SDA线
    scl_write(0);
    //读取第i位并设置SDA线并延迟1/2个周期
    if((byte & (0x01 << i)) == 1){
      sda_write(1);
    }else{
      sda_write(0);
    }
    delay_us(2);并延迟1/2个周期
    //拉高SCL线发送数据位
    scl_write(1);
    delay_us(2);
  }
  //发送完数据，读取NAK或者ACK
  //拉低SCL线以变改变SDA线，拉高SDA线释放总线，维持1/2个周期
  scl_write(0);
  sda_write(1);
  delay_us(2);
  //拉高SCL线并维持1/2个周期
  scl_write(1);
  delay_us(2);
  //读取SDA，如果位低电平则为ACK，反之为NAK
  return sda_read();
}
```
**④接收数据**
>**概述**：代码如下所示，`siic_receive_byte`用于发送**一个字节**，`siic_send_bytes`用于发送**多个字节**
{%list%}
每接收一个字节，需要根据情况发送ACK/NAK
{%endlist%}
```c
//接收一个字节
uint8_t siic_receive_byte(uint ack){
  uint8_t byte = 0;
  for(int8_t i = 7;i > 0;i--){
    //拉低SCL线，拉高SDA线释放SDA线，并延迟1/2周期等待发送方准备数据
    scl_write(0);
    sda_write(1);
    delay_us(2);
    //拉高SCL线，并延迟1/2周期读取数据
    scl_write(1);
    delay_us(2);
    if(sda_read() == 1)
    byte |= 0x01 << i;
  }
  //拉低SCL线，并根据ack的值拉高/拉低SDA线发出ACK/NAK，延迟1/2个周期
  scl_write(0);
  if(ack){
    sda_write(0);
  }else{
    sda_write(1);
  }
  delay_us(2);
  //拉高scl，发出应答信号延迟1/2个周期
  scl_write(1);
  delay_us(2);
  return byte;
}
```
### 3.SPI
#### 3.1通信协议
**①简介**
>**概述**：全称为**串行外设接口**，主要由**时钟线**`SCLK`、**输出线**`SDO`、**输入线**`SDI`和**片选线**`SS`组成，结构简图如下
{%list%}
为同步全双工通信，可以实现一对多的数据传输，速度最快，需要较多的线口
{%endlist%}
{%right%}
提供并控制时钟的设备为主设备，其他设备为从设备，主设备通过片选线来确定要通信的从设备
{%endright%}
>由于主设备控制**时钟线**，所以`SPI`允许数据**一位一位**的传送，甚至允许**暂停**


![SPI工作结构简图](/image/spi_1.png)
**②通信协议**
>**概述**：对数据帧的格式**没有具体规定**，只需要设置**时钟极性**`CPOL`和**时钟相位**`CPHA`即可
{%list%}
时钟极性即时钟线空闲时为高电平还是低电平，时钟相位即在时钟线上升沿还是下降沿采集数据，详细如下所示
{%endlist%}
{%right%}
具体的数据帧格式由从设备规定，根据规定发送对应的数据帧即可
{%endright%}
{%warning%}
SPI通信过程中，主设备向从设备写一次数据，从设备就会回一次数据，从设备回复的数据可以被读取，也可以丢弃
{%endwarning%}
>以`93C46`存储器为例，其**指令格式**为`1:[操作码]:[地址码]:[数据码]`，**读操作码**为`10`，**写操作码**为`01`

![通信协议](/image/spi_2.png)
#### 3.2SPI配置
**①模块结构**
>**概述**：`STM32`的**SPI模块**如下所示，主要由**数据寄存器**、**移位寄存器**、**状态寄存器**和**控制寄存器**组成
{%list%}
发送数据时，数据先进入发送数据寄存器，随后进入移位寄存器，最后一位一位发送出去，接收数据流程类似
{%endlist%}
{%right%}
状态寄存器的各个标志位指示了SPI传输的状态，还能触发SPI的全局中断
{%endright%}
>`TxE`为`1`表示**发送寄存器为空**，`RxNE`为`1`表示**接收寄存器非空**

![模块结构](/image/stm32_21.png)

**②初始化**
>**概述**：打开`GPIOA`和`SPI1`的**时钟**，配置**相关引脚**，并设置**SPI1相关状态**，如下所示，最后**使能SPI1**
{%list%}
在引脚分布表中（详细见数据手册P28），SPI1的SCK、MISO和MOSI引脚分别对应PA5、PA6和PA7
{%endlist%}
{%right%}
数据宽度、时钟极性、时钟相位、分频系数和比特位传输顺序需要根据从设备的手册决定，以W25Q64为例
{%endright%}
{%warning%}
即使作为主机，也要设置其NSS，用于支持多主机模式，通常设置为软件实现，并将其设置为高电平
{%endwarning%}
>**多主机模式**：主机的`NSS`引脚被拉低时**变为从机**
```c
typedef struct
{
  uint16_t SPI_Direction;         //SPI通信方向
  uint16_t SPI_Mode;              //SPI模式，即作为主机还是从机
  uint16_t SPI_DataSize;          //数据宽度
  uint16_t SPI_CPOL;              //时钟极性
  uint16_t SPI_CPHA;              //时钟相位 
  uint16_t SPI_NSS;               //软件NSS/硬件NSS 
  uint16_t SPI_BaudRatePrescaler; //波特率分频器的分频系数
  uint16_t SPI_FirstBit;          //比特位的传输顺序    
}SPI_InitTypeDef;
```
```c
void my_spi1_init(){
  //打开GPIO时钟
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA,ENABLE);
  //初始化引脚，SCK和MOSI引脚设置为复用推挽输出
  GPIO_InitTypeDef gpio_init_struct;
  gpio_init_struct.GPIO_Pin = GPIO_Pin_5 | 7;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_AF_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_50MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //MISO配置为输入上拉
  gpio_init_struct.GPIO_Pin = GPIO_Pin_6;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_IPU;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_50MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //PA0配置为通用推挽输出
  gpio_init_struct.GPIO_Pin = GPIO_Pin_0;
  gpio_init_struct.GPIO_Mode = GPIO_Mode_OUT_PP;
  gpio_init_struct.GPIO_Speed = GPIO_Speed_50MHz;
  GPIO_Init(GPIOA,&gpio_init_struct);
  //关闭片选
  GPIO_WriteBit(GPIOA,GPIO_Pin_0,Bit_SET);
  //SPI配置
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_SPI1,ENABLE);
  SPI_InitTypeDef spi_init_struct;
  spi_init_struct.SPI_Direction = SPI_Direction_2Lines_FullDuplex; //双线全双工
  spi_init_struct.SPI_Mode = SPI_Mode_Master;                      //主机模式
  spi_init_struct.SPI_DataSize = SPI_DataSize_8b;                  //长度为8比特
  spi_init_struct.SPI_CPOL = SPI_CPOL_Low;                         //低极性
  spi_init_struct.SPI_CPHA = SPI_CPHA_1Edge;                       //第一边缘采集
  spi_init_struct.SPI_NSS = SPI_NSS_Soft;                          //软件NSS实现
  spi_init_struct.SPI_BaudRatePrescaler = SPI_BaudRatePrescaler_2  //分频系数选择2
  spi_init_struct.SPI_FirstBit = SPI_FirstBit_MSB;                 //先传最高有效位
  SPI_Init(SPI1,&spi_init_struct);
  //设置软件NSS
  SPI_NSSInternalSoftwareConfig(SPI1,SPI_NSSInternalSoft_Set)
}
```
**③数据收发**
>**概述**：如下所示，`spi_master_transmitreceive_bytes`用于**接收和发送多个字节**
{%list%}

{%endlist%}
{%right%}

{%endright%}
```c
void spi_master_transmitreceive_bytes(SPI_TypeDef* SPIx,const uint8_t *pdata_tx,uint8_t *pdata_rx,uint16_t size){
  //判断参数是否合理
  if(size <= 0) return;
  //使能SPI
  SPI_Cmd(SPIx,ENABLE);
  //写入第一个字节
  SPI_I2S_SendData(SPIx,pdata_tx[0]);
  for(uint16_t i = 0;i < size - 1;i++){
    //上一个字节进入移位寄存器，即开始发送上一个字节
    while(SPI_I2S_GetFlagStatus(SPIx,SPI_I2S_FLAG_TXE) == RESET);
    //写入下一个字节
    SPI_I2S_SendData(SPIx,pdata_tx[i+1]);
    //等待接受寄存器非空，即上一个字节发送完毕
    while(SPI_I2S_GetFlagStatus(SPIx,SPI_I2S_FLAG_TXE) == RESET);
    //接收上一个字节对应的字节
    pdata_rx[i] = SPI_I2S_ReceiveData(SPIx);
  }
  //读出最后一个字节
  while(SPI_I2S_GetFlagStatus(SPIx,SPI_I2S_FLAG_TXE) == RESET);
  pdata_rx[size-1] = SPI_I2S_ReceiveData(SPIx);
  //断开总开关
  SPI_Cmd(SPIx,DISABLE);
}
```
