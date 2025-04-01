---
title: BootLoader（二）
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
## 基于单片机的BootLoader（二）
### 1.基础功能实现
#### 1.1分支判断
**①准备工作**
>**概述**：创建`main.h`，在`main.h`中定义**分区相关宏**，在`mian`函数中实现**基本架构**
{%list%}
GD32F103C8T6的片上闪存大小为64K，分配给B区20K，A区44K
{%endlist%}
{%right%}
A区下载新程序后，将更改的OTA标志存储在M24C02中，B区读取OTA标志，并判断是跳转到A区还是进行OTA更新
{%endright%}
```c
/* main.h */
#ifndef MAIN_H
#define MAIN_H
#include "stdint.h"

//分区相关宏定义
#define GD32_FLASH_BASE_ADDR 0x08000000                                           //FLASH起始地址
#define GD32_PAGE_SIZE       1024                                                 //FLASH扇区大小
#define GD32_PAGE_NUM        64                                                   //FLASH扇区总个数
#define GD32_B_PAGE_NUM      20                                                   //B区扇区个数
#define GD32_A_PAGE_NUM      GD32_PAGE_NUM - GD32_B_PAGE_NUM                      //A区扇区个数
#define GD32_A_SPACE         GD32_B_PAGE_NUM                                      //A区起始扇区编号
#define GD32_A_BASE_ADDR     GD32_FLASH_BASE_ADDR + GD32_PAGE_SIZE * GD32_A_SPACE //A区扇区起始地址

//OTA标志相关宏
#define OTA_SET_FLAG         0x12345678           //ota_info->ota_flag为该值时，触发OTA
#define OTA_FLAG_SIZE        sizeof(OTA_FLAG)     //OTA_FLAG的大小

//OTA标志，存放在M24C02中
typedef struct{
  uint32_t ota_flag;                              //OTA标志
}OTA_FLAG;

//共享变量
extern OTA_FLAG ota_info;
```
```c
/* main.c */
#include "delay.h"
#include "m24c02.h"
#include "spi.h"
#include "w25q64.h"
#include "main.h"
#include "boot.h"
#include "4g.h"
#pragma clang diagnostic ignored "-Winvalid-source-encoding"
//共享变量
OTA_FLAG ota_info;                         //OTA标志，存储在m24c02起始地址处

int main(void){
  //硬件初始化
  uart0_init(115200);
  delay_init();
  iic_init();
  w25q64_init();
  DMA_init();
  //读取ota_flag，进行分支判断
  m24c02_read_ota_info();
  bootloader_branch();
}
```
```c
/* m24c02.c，记得在m24c02.h添加对应函数声明 */
// 从M24C02中读取OTA标志 
void m24c02_read_ota_info(void){
  //清除旧标志
  memset(&ota_info,0,OTA_FLAG_SIZE);
  m24c02_read_data(0,(uint8_t *)&ota_info,OTA_FLAG_SIZE);
}
// 将更新后的OTA标志写入M24C02 
void m24c02_write_ota_info(void){
  uint8_t i;
  uint8_t *wptr;
  wptr = (uint8_t *)&ota_info;
  for(i=0;i<OTA_FLAG_SIZE/16;i++){
    m24c02_wirte_page(i*16,wptr+i*16);
    delay_ms(5);
  }
}
```
**②分区跳转**
>**概述**：创建`boot.c`和`boot.h`并将`boot.c`加入工程，在`boot.c`中实现相关函数如`bootloader_branch`
{%list%}
不需要OTA时，从A区起始地址读取主栈指针和A区程序入口，设置主栈并利用函数指针跳转到A区
{%endlist%}

```c
/* boot.h */
#ifndef BOOT_H
#define BOOT_H
#include "stdint.h"
//跳转指针
typedef void (*jump_ptr)(void);
//函数声明
void bootloader_branch(void);
void MSR_SP(uint32_t addr);
void bootloader_clear(void);
void jump_to_a(uint32_t addr);
uint8_t do_ota(void);
uint8_t bootloader_enter(uint8_t timeout);
void bootloader_info(void);
void bootloader_event(uint8_t *data,uint16_t datalen);
uint16_t xmodem_crc16(uint8_t *data,uint16_t datalen);
#endif
```
```c
/* boot.c */
#include "gd32f10x.h"
#include "uart.h"
#include "delay.h"
#include "m24c02.h"
#include "w25q64.h"
#include "main.h"
#include "boot.h"
#include "flash.h"

//a区跳转指针
jump_ptr load_a;
//更新后的分支判断
void bootloader_branch(void){
  if(ota_info.ota_flag == OTA_SET_FLAG){
    u0_printf("OTA更新\r\n");
  }else{
    u0_printf("跳转A分区");
    jump_to_a(GD32_A_BASE_ADDR);
  }
}
//设置主栈指针
void MSR_SP(uint32_t addr){
  __asm("MSR MSP, r0");
  __asm("BX r14")     ;  
}
//跳转到A区
void jump_to_a(uint32_t addr){
  //检查栈指针是否合法
  if((*(uint32_t *)addr) >= 0x20000000&&(*(uint32_t *)addr) <= 0x20004FFF){
    MSR_SP(*(uint32_t *)addr);
    load_a = (jump_ptr)*(uint32_t *)(addr+4);
    bootloader_clear();
    load_a();
  }
  u0_printf("跳转失败");
  bootloader_info();
}
//重置使用的外设
void bootloader_clear(void){
  usart_deinit(USART0);
  gpio_deinit(GPIOA);
  gpio_deinit(GPIOB);
}
```
**③OTA更新**
>**概述**：使用`W25Q64`的第一块存储`A`区**下载的新程序**，需要**OTA更新**时，`B`区将其烧写到**片上闪存**
{%list%}
为了更好地进行OTA更新，在OTA_FLAG中记录W25Q64各个程序块的长度，并定义update_a辅助OTA更新
{%endlist%}
>`update_a`中有一个**更新缓冲区**，每次从`W25Q64`取出`GD32_PAGE_SIZE`个字节，再写入**片上闪存**
{%right%}
使用状态机的裸机编程模式，当分支判断发现需要OTA更新时，只设置对应标志位以及update_a
{%endright%}
>在`main`函数中**检测标志位**并进行对应的处理
{%warning%}
在处理完对应状态事件后，要及时清除状态位，OTA更新成功后，要清除OTA标志并写入M24C02
{%endwarning%}
{%wrong%}
片上闪存是四字节对齐的，如果新程序字节数不是4的整数倍，则不能写入，否则会触发硬件错误
{%endwrong%}

```c
/* main.h */
//状态机标志位
#define UPDATA_A_FLAG        0x00000001                                           //需要更新A区
//OTA标志
typedef struct{
  uint32_t ota_flag;                              //OTA标志
  uint32_t app_len[11];                           //W25Q64各个程序块的长度，0号用于OTA更新，剩余块用于存储其余程序                             
}OTA_FLAG;
//更新管理
typedef struct{
  uint8_t  updata_buf[GD32_PAGE_SIZE]; //每次下载1024字节，放在该缓冲区中
  uint32_t w25q64_block_num;           //记录要读取的w25q64块编号
}update_manage;
//共享变量
extern OTA_FLAG ota_info;
extern update_manage update_a;
extern uint32_t boot_status_flag;
```
```c
/* main.c */
//共享变量
OTA_FLAG ota_info;                         //OTA标志，存储在m24c02起始地址处
update_manage update_a;                    //OTA更新辅助结构
uint32_t boot_status_flag;                 //程序状态

int main(void){
  //硬件初始化
  uart0_init(115200);
  delay_init();
  iic_init();
  w25q64_init();
  DMA_init();
  //读取ota_flag，进行分支判断
  m24c02_read_ota_info();
  bootloader_branch();
  while(1){
    if(boot_status_flag&UPDATA_A_FLAG){
      do_ota();
      ota_info.ota_flag = 0;
      //OTA更新成功，重置OTA标志并重启
      m24c02_writde_ota_info();
      NVIC_SystemReset();
    }
  }
}
```
```c
/* boot.c */
//更新后的分支判断
void bootloader_branch(void){
  if(ota_info.ota_flag == OTA_SET_FLAG){
    u0_printf("OTA更新\r\n");
    boot_status_flag |= UPDATA_A_FLAG;
    update_a.w25q64_block_num = 0;
  }else{
    u0_printf("跳转A分区");
    jump_to_a(GD32_A_BASE_ADDR);
  }
}
uint8_t do_ota(void){
  uint8_t i;
  //此时，A区程序已经将需要更新的软件下载到了w25q64的第一个区块中
  u0_printf("长度%d字节\r\n",ota_info.app_len[update_a.w25q64_block_num]);
  //flash是四字节对齐的，如果更新软件字节数不是4的整数倍，则不能写入
  //同时清除OTA状态
  if(ota_info.app_len[update_a.w25q64_block_num]%4!=0){
    u0_printf("长度错误\r\n");
    boot_status_flag &= ~UPDATA_A_FLAG;
    return 1;
  }
  //擦除flah
  gd32flash_erase(GD32_A_SPACE,GD32_A_PAGE_NUM);

  for(i=0;i<ota_info.app_len[update_a.w25q64_block_num]/GD32_PAGE_SIZE;i++){
    //读取一页内容到更新缓冲区中
    w25q64_read(update_a.updata_buf,update_a.w25q64_block_num*64*1024+i*1024,GD32_PAGE_SIZE);
    //将缓冲区内容写入flash
    gd32flash_write(GD32_A_BASE_ADDR+i*GD32_PAGE_SIZE,(uint32_t*)update_a.updata_buf,GD32_PAGE_SIZE);
  }
  //读取不足一页的内容，如果有的话
  if(ota_info.app_len[update_a.w25q64_block_num]/GD32_PAGE_SIZE % 1024 != 0){
    //读取剩余内容到更新缓冲区中
    w25q64_read(update_a.updata_buf,update_a.w25q64_block_num*64*1024+i*1024,ota_info.app_len[update_a.w25q64_block_num]/GD32_PAGE_SIZE % 1024);
    //将缓冲区内容写入flash
    gd32flash_write(GD32_A_BASE_ADDR+i*GD32_PAGE_SIZE,(uint32_t*)update_a.updata_buf,ota_info.app_len[update_a.w25q64_block_num]/GD32_PAGE_SIZE % 1024);
  }
  return 0;
}
```
#### 1.2串口命令行
**①命令行启动**
>**概述**：启动时，在**规定时间**内输入**特定字符**`w`则进入命令行，反之进行**OTA更新**或者**跳转到`A`区**
{%list%}
每次进入命令行都提示用户输入对应命令，拟定有以下命令
{%endlist%}
{%right%}
命令可能会导致程序进入不同的状态
{%endright%}
```c
/* boot.c */
//加入串口命令行的分支判断
void bootloader_branch(void){
  if(bootloader_enter(20) == 0){
    if(ota_info.ota_flag == OTA_SET_FLAG){
      u0_printf("OTA更新\r\n");
      boot_status_flag |= UPDATA_A_FLAG;
      update_a.w25q64_block_num = 0;
    }else{
      u0_printf("跳转A分区");
      jump_to_a(GD32_A_BASE_ADDR);
    }
  }
  //没有超时或者跳转失败就进入命令行
  u0_printf("进入命令行");
  bootloader_info();
}
//判断是否进入进入串口命令行
uint8_t bootloader_enter(uint8_t timeout){
  u0_printf("%dms内输入小写字母 w ，进入命令行",timeout);
  while(timeout--){
    delay_ms(100);
    if(U0_RxBuf[0]=='w'){
      return 1;
    }
  }
  return 0;
}
//打印命令行信息
void bootloader_info(void){
  u0_printf("\r\n");
  u0_printf("[1]擦除A区\r\n");
  u0_printf("[2]重启\r\n");
  u0_printf("[3]IAP更新\r\n");
  u0_printf("[4]下载程序到外部flash\r\n");
  u0_printf("[5]设置版本号\r\n");
  u0_printf("[6]查询版本号\r\n");
  u0_printf("[7]加载外部flash程序\r\n");
  u0_printf("[8]设置服务器链接信息\r\n");
}
```
```c
/* main.h */
//状态机标志位
#define UPDATA_A_FLAG        0x00000001                                           //需要更新A区
#define IAP_XMODEM_C         0x00000002                                           //启动Xmodem协议传输
#define IAP_XMODEM_D         0x00000004                                           //接收到数据包，开始接收数据，将数据保存到片上闪存
#define LOAD_TO_FLASH        0x00000008                                           //使用Xmodem协议下载到W25Q64中
#define IAP_XMODEM_D_FLASH   0x00000010                                           //同IAP_XMODEM_D，但是将数据保存到W25Q64中
#define SET_VERSION          0x00000020                                           //设置版本号
#define LOAD_FROM_FLASH      0x00000040                                           //从W25Q64中加载程序
#define SET_LIN_INFO         0x00000080                                           //设置OTA链接
```
**②命令处理**
>**概述**：读取`USART0`的输入并调用`bootloader_event`进行**不同的处理**
{%list%}
USART0输入不仅仅有用户输入的命令，还有传输的数据包等
{%endlist%}
{%right%}
根据程序状态以及输入的长度和关键词等进行对应的处理
{%endright%}
```c
/* main.c */
int main(void){
  /* 初始化以及分支跳转，略 */
  while(1){
    delay_ms(10);
    //读取串口0输入，并调用bootloader_event
    if(U0_RxBufMan.URxDataOut != U0_RxBufMan.URxDataIn){
      bootloader_event(U0_RxBufMan.URxDataOut->start,U0_RxBufMan.URxDataOut->end-U0_RxBufMan.URxDataOut->start+1);
      U0_RxBufMan.URxDataOut++;
      if(U0_RxBufMan.URxDataOut == U0_RxBufMan.URxDataEnd)
        U0_RxBufMan.URxDataOut = &U0_RxBufMan.URxBufPtrs[0];
    }
    //需要进行OTA升级
    if(boot_status_flag&UPDATA_A_FLAG){
      do_ota();
      ota_info.ota_flag = 0;
      m24c02_write_ota_info();
      NVIC_SystemReset();
    }
  }
}
```
```c
/* 处理各种命令 */
void bootloader_event(uint8_t *data,uint16_t datalen){
  if(boot_status_flag == 0){
    if((datalen == 1)&&(data[0]=='1')){
      u0_printf("擦除A区\r\n");
      gd32flash_erase(GD32_A_SPACE,GD32_A_PAGE_NUM);
    }
    else if((datalen == 1)&&(data[0]=='2')){
      NVIC_SystemReset();
    }
    else if((datalen == 1)&&(data[0]=='3')){
      u0_printf("通过Xmodem协议，串口IAP下载A区程序，请使用bin文件\r\n");
      gd32flash_erase(GD32_A_SPACE,GD32_A_PAGE_NUM);
      boot_status_flag |= (IAP_XMODEM_C | IAP_XMODEM_D);
      update_a.xmodem_timeout = 0;
      update_a.xmodem_data_num  = 0;
    }
    else if((datalen == 1)&&(data[0]=='4')){
      u0_printf("下载程序到外部flah，输入需要使用的块编号（1-9）\r\n");
      boot_status_flag |= LOAD_TO_FLASH;
    }
    else if((datalen == 1)&&(data[0]=='5')){
      u0_printf("设置版本号\r\n");
      boot_status_flag |= SET_VERSION;
    }
    else if((datalen == 1)&&(data[0]=='6')){
      u0_printf("查询版本号\r\n");
      m24c02_read_ota_info();
      u0_printf("版本号:&s\r\n",ota_info.ota_ver);
    }
    else if((datalen == 1)&&(data[0]=='7')){
      u0_printf("使用外部flash程序，输入需要使用的块编号（1-9）\r\n");
      boot_status_flag |= LOAD_FROM_FLASH;
    }
    else if((datalen == 1)&&(data[0]=='8')){
      u0_printf("设置服务器链接信息\r\n");
      boot_status_flag |= SET_LIN_INFO;
    }
  }
  else if(boot_status_flag&SET_VERSION){
    if(datalen == 26){
      int temp;
      if(sscanf((char*)data,"VER-%d.%d.%d-%d-%d-%d-%d.%d",&temp,&temp,&temp,&temp,&temp,&temp,&temp,&temp)==8){
        memset(ota_info.ota_ver,0,32);
        memcpy(ota_info.ota_ver,data,26);
        m24c02_write_ota_info();
        u0_printf("版本号正确\r\n");
        boot_status_flag &= ~SET_VERSION;
      }else{
        u0_printf("版本号格式错误\r\n");
      }
    }else{
      u0_printf("版本号长度错误\r\n");
    }
  }
  else if(boot_status_flag&LOAD_FROM_FLASH){
    if(datalen == 1){
      if((data[0]>=0x31)&&(data[0]<=0x39)){
        update_a.w25q64_block_num = data[0] - 0x30;
        boot_status_flag &= ~LOAD_FROM_FLASH;
        boot_status_flag |= UPDATA_A_FLAG;
      }else{
        u0_printf("编号错误");
      }
    }else{
      u0_printf("数据长度错误");
    }
  }
}
```
**③版本号设置**
>**概述**：`B`区程序需要将**版本号**存入`M24C02`，便于`A`区判断是否需要**从服务端下载程序**
{%list%}
在结构体OTA_FLAG中添加数组以记录版本号
{%endlist%}
```c
/* main.h */
typedef struct{
	uint32_t ota_flag;
	uint32_t app_len[11];                                                           //存放每个程序的长度，0存放OTA更新程序
	uint8_t  ota_ver[32];                                                           //存放版本号
}OTA_FLAG;
```
```c
/* 处理各种命令 */
void bootloader_event(uint8_t *data,uint16_t datalen){
  /* 其余逻辑略 */
  else if(boot_status_flag&SET_VERSION){
    if(datalen == 26){
      int temp;
      if(sscanf((char*)data,"VER-%d.%d.%d-%d-%d-%d-%d.%d",&temp,&temp,&temp,&temp,&temp,&temp,&temp,&temp)==8){
        memset(ota_info.ota_ver,0,32);
        memcpy(ota_info.ota_ver,data,26);
        m24c02_write_ota_info();
        u0_printf("版本号正确\r\n");
        boot_status_flag &= ~SET_VERSION;
      }else{
        u0_printf("版本号格式错误\r\n");
      }
    }else{
      u0_printf("版本号长度错误\r\n");
    }
  }
}
```
**④加载外部FLASH程序**
>**概述**：`W25Q64`的第`2`至`11`个块存储**其他程序**，需要使用的时候将其加载到**片上闪存**即可
{%right%}
本质上就是修改了update_a.w25q64_block_num并触发UPDATA_A_FLAG
{%endright%}
```c
/* 处理各种命令 */
void bootloader_event(uint8_t *data,uint16_t datalen){
  /* 其余逻辑，略 */
  else if(boot_status_flag&LOAD_FROM_FLASH){
    if(datalen == 1){
      if((data[0]>=0x31)&&(data[0]<=0x39)){
        update_a.w25q64_block_num = data[0] - 0x30;
        boot_status_flag &= ~LOAD_FROM_FLASH;
        boot_status_flag |= UPDATA_A_FLAG;
      }else{
        u0_printf("编号错误");
      }
    }else{
      u0_printf("数据长度错误");
    }
  }
}

```

#### 1.3IAP更新
**①Xmodem协议**
>**概述**：是一种**串口通信**中广泛用到的**异步文件传输协议**，以`128`字节块的形式传输数据，支持**CRC校验**
{%list%}
每个数据包由数据头、数据包编号、数据包编号反码、数据块和CRC校验码组成
{%endlist%}
>`SOH`为`0x01`，`ACK`为`0X06`，`NAK`为`0x15`，`EOT`为`0x04`
{%warning%}
Xmodem需要对每个数据包块进行确认，并且在其出错时进行重发，效率较低
{%endwarning%}
{%right%}
除此之外，还有1k-Xmodem、Ymodem和Zmodem协议，协议内容和Xmodem类似，但是进行了对应改进
{%endright%}
![Xmodem协议传输协议流程](/image/bootloader_9.png)
**②CRC16校验**
>**概述**：本质上是利用**异或运算**、**一个个`8`位数据**和**一个多项式**将初始值不断更新，从而获取**CRC校验码**
{%list%}
每个协议的CRC校验使用的初始值和多项式是不同的，可以去特定网站获取
{%endlist%}
>[CRC在线计算](https://www.lddgo.net/encrypt/crc)，**代码实现**如下所示
{%right%}
对于一个数据包，如果发送方和接收方计算出的CRC校验码一致，则表明数据传输无误
{%endright%}
```c
uint16_t xmodem_crc16(uint8_t *data,uint16_t datalen){
  uint8_t i;
  uint16_t crc_init = 0x0000;
  uint16_t crc_poly = 0x1021;
  //对于每个8位数据，都要进行以下循环
  while(datalen--){
    //计算初始值，将8位数据右移八位与初始值进行位异或运算
    crc_init = *data << 8 ^crc_init;
    for(i = 0;i < 8;i++){
      //检查更新后初始值的最高位，若为1，则右移一位并与多项式进行异或运算，反之仅右移一位
      if(crc_init&0x8000)
        crc_init = (crc_init<<1)^crc_poly;
      else
        crc_init = (crc_init<<1);
    }
    data++;
  }
  return crc_init;
}
```
**③启动Xmodem传输**
>**概述**：在**串口命令行**输入`3`/`4`启动传输，设置**对应标志位**，**接收方**开始以**一定频率**发送`C`
{%list%}
3命令和4命令的区别仅仅在于Xmodem数据包的写入位置
{%endlist%}
{%right%}
4分支中，只需要进行一些简单处理，设置IAP_XMODEM_D_FLASH提示将数据包写入W25Q64并触发IAP即可
{%endright%}
```c
/* main.h */
//更新管理
typedef struct{
	uint8_t  updata_buf[GD32_PAGE_SIZE]; //每次下载1024字节，放在该缓冲区中
	uint32_t w25q64_block_num;           //0号block用于OTA，其余存储其他程序
	uint32_t xmodem_data_num;
	uint32_t xmodem_timeout;             //发送C的间隔时间
	uint32_t xmodem_crc;                 //CRC校验码
}update_manage;
```
```c
/* boot.c */
void bootloader_event(uint8_t *data,uint16_t datalen){
  if(boot_status_flag == 0){
    if((datalen == 1)&&(data[0]=='1')){
      u0_printf("擦除A区\r\n");
      gd32flash_erase(GD32_A_SPACE,GD32_A_PAGE_NUM);
    }
    else if((datalen == 1)&&(data[0]=='2')){
      NVIC_SystemReset();
    }
    else if((datalen == 1)&&(data[0]=='3')){
      u0_printf("通过Xmodem协议，串口IAP下载A区程序，请使用bin文件\r\n");
      //擦除A区
      gd32flash_erase(GD32_A_SPACE,GD32_A_PAGE_NUM);
      //设置标志位并初始化update_a
      boot_status_flag |= (IAP_XMODEM_C | IAP_XMODEM_D);
      update_a.xmodem_timeout = 0;
      update_a.xmodem_data_num  = 0;
    }
    else if((datalen == 1)&&(data[0]=='4')){
      u0_printf("下载程序到外部flah，输入需要使用的块编号（1-9）\r\n");
      boot_status_flag |= LOAD_TO_FLASH;
    }
  }
}
  else if(boot_status_flag&LOAD_TO_FLASH){
    if(datalen == 1){
      if((data[0]>=0x31)&&(data[0]<=0x39)){
        //记录存入的W25Q64区块号
        update_a.w25q64_block_num = data[0] - 0x30;
        //设置对应标志位，并设置IAP_XMODEM_D_FLASH提示将其存入W25Q64
        boot_status_flag |= (IAP_XMODEM_C | IAP_XMODEM_D | IAP_XMODEM_D_FLASH);
        //初始化数据并清除
        update_a.xmodem_timeout = 0;
        update_a.xmodem_data_num  = 0;
        ota_info.app_len[update_a.w25q64_block_num] = 0;
        w25q64_erase64k(update_a.w25q64_block_num);
        //清除LOAD_TO_FLASH
        boot_status_flag &= ~LOAD_TO_FLASH;
        u0_printf("通过Xmodem协议，下载程序到外部flash第%d个块，请使用bin文件\r\n",update_a.w25q64_block_num);
      }else{
        u0_printf("编号错误");
      }
    }else{
      u0_printf("数据长度错误");
    }
  }
```
```c
int main(void){
  /* 初始化和分支判断，略 */
  while(1){
    //每次延时10ms
    delay_ms(10);
    //如果串口0缓冲区不为空，则说明用户输入了命令
    if(U0_RxBufMan.URxDataOut != U0_RxBufMan.URxDataIn){
      bootloader_event(U0_RxBufMan.URxDataOut->start,U0_RxBufMan.URxDataOut->end-U0_RxBufMan.URxDataOut->start+1);
      U0_RxBufMan.URxDataOut++;
      if(U0_RxBufMan.URxDataOut == U0_RxBufMan.URxDataEnd)
        U0_RxBufMan.URxDataOut = &U0_RxBufMan.URxBufPtrs[0];
    }
    //进行IAP更新，每隔一秒发送C
    if(boot_status_flag&IAP_XMODEM_C){
      if(update_a.xmodem_timeout>=100){
        u0_printf("C");
        update_a.xmodem_timeout = 0;
      }
      update_a.xmodem_timeout++;
    }
    //需要进行OTA升级
    if(boot_status_flag&UPDATA_A_FLAG){
      do_ota();
      ota_info.ota_flag = 0;
      m24c02_write_ota_info();
      NVIC_SystemReset();
    }
  }
}
```
**④数据传输**
>**概述**：接收到数据包后，**停止发送**`C`，将数据包存入**缓冲区**，并写入**片上闪存**或**外部FLASH**
{%list%}
对数据包进行校验并将正确的数据包写入缓冲区，当缓冲区满，将整个缓冲区写入片上闪存/外部FLASH
{%endlist%}
{%right%}
写入数据时，根据IAP_XMODEM_D_FLASH的设置与否写入不同位置
{%endright%}
{%warning%}
数据发送完毕还需要判断缓冲区是否还有不足一个缓冲区的数据
{%endwarning%}
```c
/*  */
void bootloader_event(uint8_t *data,uint16_t datalen){
  /* 其他if逻辑，略 */
  else if(boot_status_flag&IAP_XMODEM_D){
    //如果接收到了帧头，停止发送C，并计算crc校验码
    if((datalen == 133)&&(data[0]==0x01)){
      boot_status_flag &= ~IAP_XMODEM_C;
      update_a.xmodem_crc = xmodem_crc16(&data[3],128);
      //如果校验成功
      if(update_a.xmodem_crc == data[131]*256+data[132]){
        update_a.xmodem_data_num++;
        memcpy(&update_a.updata_buf[((update_a.xmodem_data_num -1)%(GD32_PAGE_SIZE/128))*128],&data[3],128);
        //凑满一个扇区了
        if(update_a.xmodem_data_num%(GD32_PAGE_SIZE/128) == 0){
          if((boot_status_flag&IAP_XMODEM_D_FLASH)){
            uint8_t i;
            for(i=0;i<4;i++){
              w25q64_writepage(&update_a.updata_buf[i*256],((update_a.xmodem_data_num/8-1)*4+i)+(update_a.w25q64_block_num*64*1024/256));
            }
          }else{
            gd32flash_write(GD32_A_BASE_ADDR+((update_a.xmodem_data_num%(GD32_PAGE_SIZE/128))-1)*GD32_PAGE_SIZE,(uint32_t*)update_a.updata_buf,GD32_PAGE_SIZE);
          }
        }
        u0_printf("\x06");
      }else{
        u0_printf("\x15");
      }
    }
    //数据发送完毕
    if((datalen == 1)&&(data[0]==0x04)){
      u0_printf("\x06");
      //收尾
      if(update_a.xmodem_data_num%(GD32_PAGE_SIZE/128) != 0){
        if((boot_status_flag&IAP_XMODEM_D_FLASH)){
          uint8_t i;
          for(i=0;i<4;i++){
            w25q64_writepage(&update_a.updata_buf[i*256],((update_a.xmodem_data_num/8)*4+i)+(update_a.w25q64_block_num*64*1024/256));
          }
        }else{
          gd32flash_write(GD32_A_BASE_ADDR+((update_a.xmodem_data_num%(GD32_PAGE_SIZE/128)))*GD32_PAGE_SIZE,(uint32_t*)update_a.updata_buf,(update_a.xmodem_data_num%(GD32_PAGE_SIZE/128))*128);
        }
      }
      //清除状态并更新数据
      boot_status_flag &= ~IAP_XMODEM_D;
      if(boot_status_flag&IAP_XMODEM_D_FLASH){
        boot_status_flag &= ~IAP_XMODEM_D_FLASH;
        ota_info.app_len[update_a.w25q64_block_num] = update_a.xmodem_data_num*128;
        m24c02_write_ota_info();
        delay_ms(100);
        bootloader_info();
      }else{
        delay_ms(100);
        NVIC_SystemReset();
      }
    }
  }
}

```
### 2.4G模块通信
#### 2.1模块设置
**①WH-GM5**
>**概述**：一款`2G+Cat1`模块，用于提供稳定的**低功耗无线连接**，还可提供**定时心跳**功能，其**电路原理图**如下所示
{%list%}
其复位引脚为PB2，PB0和PB1用于指示链接A和B的连接情况，PB10和PB11作为输出和输入引脚
{%endlist%}
>`PB0`和`PB1`为**高电平**时说明**对应链接**连接成功
{%right%}
根据GD32F103手册，查询得PB10和PB11对应串口2，对应DMA0的通道2
{%endright%}
![WH-GM5电路原理图](/image/bootloader_10.png)

**②初始化**
>**概述**：创建`4g.c`和`4g.h`文件，并将`4g.c`加入工程，**初始化该设备**并在`uart.c`中设置并其使用的`USART2`
{%list%}
PB0默认为低电平，采用下拉输入方式
{%endlist%}
{%right%}
拉高模块复位引脚PB2后，需要给予一定的延时等待模块进行复位，随后拉低复位引脚
{%endright%}
```c
/* 4g.h */
#ifndef GD_4G_H
#define GD_4G_H
#include "stdint.h"
void gd4g_init(void);
void u2_event(uint8_t *data,uint16_t datalen);
#endif

```
```c
/* 4g.c */
#include "gd32f10x.h"
#include "main.h"
#include "uart.h"
#include "4g.h"
#include "delay.h"
#include "boot.h"
#pragma clang diagnostic ignored "-Winvalid-source-encoding"
void gd4g_init(void){
  rcu_periph_clock_enable(RCU_GPIOB);                               //打开GPIO时钟
  gpio_init(GPIOB,GPIO_MODE_IPD,GPIO_OSPEED_50MHZ,GPIO_PIN_0);      //设置PB0，监控linka，采用下拉输入方式
  gpio_init(GPIOB,GPIO_MODE_OUT_PP,GPIO_OSPEED_50MHZ,GPIO_PIN_2);   //设置PB2，控制4g模块的复位

  //4g模块复位
  u0_printf("4G模块复位中，请稍等...");
  gpio_bit_set(GPIOB ,GPIO_PIN_2);
  //给予复位所需要的延时
  delay_ms(500);
  gpio_bit_reset(GPIOB ,GPIO_PIN_2);
}
```
**③收发数据**
>**概述**：类似`USART0`，为`USART2`设置**DMA**和**缓冲区**等
{%list%}
在USART0初始化函数中已经进行中断分组，在这里就不需要了
{%endlist%}

```c
/* uart.h */
//串口2的接收数组长度和单次最大接收值
#define U2_RX_SIZE 2048
#define U2_TX_SIZE 2048
#define U2_RX_MAX  256
//共享数据
extern RxBuf_Manage U2_RxBufMan;
extern uint8_t U2_RxBuf[U2_RX_SIZE];
//函数声明
void uart2_init(uint32_t bandrate);
void U2_RxBufMan_init(void);
void u2_printf(char *format,...);
```
```c
/* uart.c */
//串口2的接收/发送数组以及对应管理结构体
uint8_t U2_RxBuf[U2_RX_SIZE];
uint8_t U2_TxBuf[U2_TX_SIZE];
RxBuf_Manage U2_RxBufMan;

void uart2_init(uint32_t bandrate){
	//打开串口2和GPLOB的时钟
	rcu_periph_clock_enable(RCU_USART2);
	rcu_periph_clock_enable(RCU_GPIOB);
	//GPIO的初始化，分别为发送和接收引脚
	gpio_init(GPIOB,GPIO_MODE_AF_PP,GPIO_OSPEED_50MHZ,GPIO_PIN_10);
	gpio_init(GPIOB,GPIO_MODE_IN_FLOATING,GPIO_OSPEED_50MHZ,GPIO_PIN_11);
	
	//重置串口2
	usart_deinit(USART2);
  //设置串口波特率、数据位、校验位和停止位
	usart_baudrate_set(USART2,bandrate);
	usart_word_length_set(USART2,USART_WL_8BIT);
	usart_parity_config(USART2,USART_PM_NONE);
	usart_stop_bit_set(USART2,USART_STB_1BIT);
	//配置收发模式
	usart_transmit_config(USART2,USART_TRANSMIT_ENABLE);
	usart_receive_config(USART2,USART_RECEIVE_ENABLE);
	//DMA设置
	usart_dma_receive_config(USART2,USART_RECEIVE_DMA_ENABLE);
	//打开串口2的空闲中断，在此之前需要打开串口2的所有中断
	nvic_irq_enable(USART2_IRQn,0,0);
	usart_interrupt_enable(USART2,USART_INT_IDLE);

	U2_RxBufMan_init();
  //打开串口
	usart_enable(USART2);
}
void DMA_init(void){
  /* 打开DMA0时钟以及串口0对应通道设置，略 */
  //重置通道2
  dma_deinit(DMA0,DMA_CH2);
  //外设地址，即串口2数据寄存器地址
  dma0_init_struct.periph_addr = USART2+4;
  //源地址数据长度，设置为1字节
  dma0_init_struct.periph_width = DMA_PERIPHERAL_WIDTH_8BIT;
  //数据接收地址，即数据缓冲区
  dma0_init_struct.memory_addr = (uint32_t)U2_RxBuf;
  //目的地址数据长度，同上定义为一字节
  dma0_init_struct.memory_width = DMA_MEMORY_WIDTH_8BIT ;
  //本次dma可接受的数量，达到后表示dma完成
  dma0_init_struct.number = U2_RX_MAX+1;
  //dma中断优先级设置
  dma0_init_struct.priority = DMA_PRIORITY_HIGH ;
  //外设地址递增量，这里一直使用串口，所以不变
  dma0_init_struct.periph_inc = DMA_PERIPH_INCREASE_DISABLE;
  //接收地址需要递增
  dma0_init_struct.memory_inc = DMA_MEMORY_INCREASE_ENABLE;
  //传递方向定义为外设到内存
  dma0_init_struct.direction  = DMA_PERIPHERAL_TO_MEMORY;
  //初始化DMA并打开串口2对应的通道
  dma_init(DMA0,DMA_CH2,&dma0_init_struct);
  dma_circulation_disable(DMA0,DMA_CH2);
  dma_channel_enable(DMA0,DMA_CH2);
}
void U2_RxBufMan_init(void){
  //初始时，IN指针和OUT指针都指向管理数组的第一项
  U2_RxBufMan.URxDataIn = &U2_RxBufMan.URxBufPtrs[0];
  U2_RxBufMan.URxDataOut = &U2_RxBufMan.URxBufPtrs[0];
  //初始时，IN指针的start成员指向接收数组的起始位置
  U2_RxBufMan.URxDataIn->start = U2_RxBuf;

  U2_RxBufMan.URxDataEnd = &U2_RxBufMan.URxBufPtrs[NUM-1];
  U2_RxBufMan.URxDataSum = 0;
}
```
```c
/* uart.c */
void u2_printf(char *format,...){
  uint16_t i;
  //使用valist结构读取不确定参数，并进行初始化
  va_list listdata;
  va_start(listdata,format);
  //将参数格式化到输出数组中
  vsprintf((char *)U2_TxBuf,format,listdata);
  va_end(listdata);
  for(i = 0;i < strlen((const char*)U2_TxBuf);i++){
    //当串口的发送寄存器不为空，需要一直空循环等待
    while(usart_flag_get(USART2,USART_FLAG_TBE)!=1);
    //传递数据
    usart_data_transmit(USART2,U2_TxBuf[i]);
  }
  //当串口发送完毕才能退出
  while(usart_flag_get(USART2,USART_FLAG_TC)!=1);
}
```
```c
/* gd32f10x_it.c */
void USART2_IRQHandler(void){
  //验证串口0是否产生空闲中断，这里读取的寄存器为USART_CTL0，而不是状态寄存器
  if(usart_interrupt_flag_get(USART2,USART_INT_FLAG_IDLE)!=0){
    //清除空闲中断的标志位，查手册可得，需要先读取串口0的标志位，再读取数据寄存器
    usart_flag_get(USART2,USART_FLAG_IDLEF);
    usart_data_receive(USART2);
    
    //增加uart.c中U2_RxBufMan的累加值URxDataSum
    //需要调用dma_transfer_number_get得到这次没有接收到的接收的数据量
    U2_RxBufMan.URxDataSum += (U2_RX_MAX+1)-dma_transfer_number_get(DMA0,DMA_CH2);
    //更新IN指针指向的RxBufPtr，将其end部分指向缓冲区的数据末尾
    U2_RxBufMan.URxDataIn->end = &U2_RxBuf[U2_RxBufMan.URxDataSum-1];
    //将IN指针指向下一个RxBufPtr，表示待接收新的文件
    U2_RxBufMan.URxDataIn++;
    //如果IN指针等于END指针，则立马回卷
    if(U2_RxBufMan.URxDataIn == U2_RxBufMan.URxDataEnd){
      U2_RxBufMan.URxDataIn = &U2_RxBufMan.URxBufPtrs[0];
    }
    //如果剩余空间大于一次可接受数据的最大值，才能继续接收
    //反之则回卷
    if(U2_RX_SIZE - U2_RxBufMan.URxDataSum >= U2_RX_MAX){
      //设置新的RxBufPtr的start
      U2_RxBufMan.URxDataIn->start = &U2_RxBuf[U2_RxBufMan.URxDataSum];
    }else{
      U2_RxBufMan.URxDataIn->start = U2_RxBuf;
      U2_RxBufMan.URxDataSum = 0;
    }
    //更新dma相关属性
    dma_channel_disable(DMA0,DMA_CH2);
    dma_transfer_number_config(DMA0,DMA_CH2,U2_RX_MAX+1);
    dma_memory_address_config(DMA0,DMA_CH2,(uint32_t)U2_RxBufMan.URxDataIn->start);
    dma_channel_enable(DMA0,DMA_CH2);
  }
}
```
**④模块设置**
>**概述**：进入**临时指令模式**，根据**用户手册**发送**对应命令**设置链接和心跳包等
{%list%}
模块复位成功后，会主动给单片机发送对应数据，根据用户手册进行响应从而进入临时指令模式
{%endlist%}
{%right%}
在阿里云物联网平台创建产品和设备后，使用MQTT连接参数中的mqttHostUrl和port作为链接地址
{%endright%}
```c
/* mian.c */
int main(void){
  /* 其他初始化略 */
  uint8_t i;
  uart2_init(115200);
  gd4g_init();
  /* 分支判断略 */
  while(1){
    delay_ms(10);
    //如果串口0缓冲区不为空，则说明接收到PC端信息
    if(U0_RxBufMan.URxDataOut != U0_RxBufMan.URxDataIn){
      bootloader_event(U0_RxBufMan.URxDataOut->start,U0_RxBufMan.URxDataOut->end-U0_RxBufMan.URxDataOut->start+1);
      U0_RxBufMan.URxDataOut++;
      if(U0_RxBufMan.URxDataOut == U0_RxBufMan.URxDataEnd)
        U0_RxBufMan.URxDataOut = &U0_RxBufMan.URxBufPtrs[0];
    }
    //如果串口2接收缓冲区不为空，则说明接收到4G模块的信息
    if(U2_RxBufMan.URxDataOut != U2_RxBufMan.URxDataIn){
      u0_printf("本次接收%d字节数据",U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);
      for(i=0;i<(U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);i++){
        u0_printf("%c",U2_RxBufMan.URxDataOut->start[i]);
      }
      u2_event(U2_RxBufMan.URxDataOut->start,U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);
      U2_RxBufMan.URxDataOut++;
      if(U2_RxBufMan.URxDataOut == U2_RxBufMan.URxDataEnd)
        U2_RxBufMan.URxDataOut = &U2_RxBufMan.URxBufPtrs[0];
    }
    /* 其他功能略 */
  }
}
```
```c
/* 4g.c */
void u2_event(uint8_t *data,uint16_t datalen){
  //如果4g模块复位成功，串口2会收到zfk字符串
  if((datalen == 3)&&(memcmp(data,"zfk",3)==0)){
      u0_printf("4G模块复位成功，处于透传模式");
      //进入指令模式，串口需要给模块发送+++
      u2_printf("+++");
  }
  //模块+++收到后给串口发送a，此时串口需要再发送a
  if((datalen == 1)&&(memcmp(data,"a",1)==0)){
    u2_printf("a");
  }
  //模块收到a后，会给串口发送+ok\r\n
  if((datalen == 5)&&(memcmp(data,"+ok\r\n",5)==0)){
    u0_printf("进入临时指令模式");
    bootloader_info();
  }
}
```
```c
/* boot.c */
void bootloader_info(void){
  u0_printf("\r\n");
  u0_printf("[1]擦除A区\r\n");
  u0_printf("[2]重启\r\n");
  u0_printf("[3]IAP更新\r\n");
  u0_printf("[4]下载程序到外部flah\r\n");
  u0_printf("[5]设置版本号\r\n");
  u0_printf("[6]查询版本号\r\n");
  u0_printf("[7]加载外部flash程序\r\n");
  u0_printf("[8]设置服务器链接信息\r\n");
}
void bootloader_event(uint8_t *data,uint16_t datalen){
  /* 其他逻辑略 */
  if(boot_status_flag == 0){
    else if((datalen == 1)&&(data[0]=='8')){
      u0_printf("设置服务器链接信息\r\n");
      boot_status_flag |= SET_LIN_INFO;
    }
  }
  else if(boot_status_flag&SET_LIN_INFO){
    u2_printf("AT+SOCKA=%s\r\n",data);
    delay_ms(30);
    u2_printf("AT+SOCKAEN=ON\r\n");
    delay_ms(30);
    u2_printf("AT+SOCKBEN=OFF\r\n");
    delay_ms(30);
    u2_printf("AT+SOCKCEN=OFF\r\n");
    delay_ms(30);
    u2_printf("AT+SOCKDEN=OFF\r\n");
    delay_ms(30);
    //自定义心跳包
    u2_printf("AT+HEART=ON,NET,USER,60,C000\r\n");
    delay_ms(30);
    u2_printf("AT+S\r\n");
    delay_ms(30);
    boot_status_flag &= ~SET_LIN_INFO;
	}
}
```
#### 2.2MQTT协议通信
**①准备工作**
>**概述**：基于`B`区程序构建`A`区程序，添加`mqtt.c`和`mqtt.h`文件，并将`mqtt.c`加入工程
{%list%}
在阿里云物联网平台创建产品和设备后，从设备界面处获取MQTT连接参数，如下所示
{%endlist%}
{%warning%}
从这之后就是A区程序了
{%endwarning%}
```json
//设备连接参数
{
"clientId":"k1uz3OMeDAF.D001|securemode=2,signmethod=hmacsha256,
timestamp=1731915658047|","username":"D001&k1uz3OMeDAF",
"mqttHostUrl":"iot-06z00elwhtgt067.mqtt.iothub.aliyuncs.com",
"passwd":"a8877314262e49f7c70bd92cd6e0f925d94f5b25a2ff8954bb82cea91e0021e0",
"port":1883
}
```
```c
/* mqtt.c */
#ifndef MQTT_H
#define MQTT_H
#include "stdint.h"
//mqtt连接参数
#define CLIENTID "k1uz3OMeDAF.D001|securemode=2,signmethod=hmacsha256,timestamp=1731915658047|"
#define USERNAME "D001&k1uz3OMeDAF"
#define PASSWORD "a8877314262e49f7c70bd92cd6e0f925d94f5b25a2ff8954bb82cea91e0021e0"

//mqtt协议管理结构体
typedef struct{
  //发送报文
  uint8_t  pack_buf[512];  //报文缓冲区
  uint16_t message_id;     //报文标识符
  uint16_t fixed_len;      //固定报文长度
  uint16_t variable_len;   //可变报文长度
  uint16_t payload_len;    //负载报文长度
  uint16_t remain_len;     //剩余报文长度
}mqtt_manage;
//共享数据
extern mqtt_manage aliyun_mqtt;
void mqtt_connect(void);
void mqtt_subcrib(char *topic);
void mqtt_deal_publish(uint8_t *data,uint16_t data_len);
void mqtt_push_publish0(char *topic ,char *data);
void mqtt_push_publish1(char *topic ,char *data);
#endif
```
```c
/* mqtt.c */
#include "mqtt.h"
#include "uart.h"
#include "main.h"
#include "gd32f10x.h"
#include "string.h"
#include "w25q64.h"
#include "4g.h"
#pragma clang diagnostic ignored "-Winvalid-source-encoding"
mqtt_manage aliyun_mqtt;

```
**②连接报文**
>**概述**：根据`MQTT`协议构建**连接报文**，并通过`USART2`发送给**4G模块**
{%list%}
连接报文没有规定的报文标识符，在构建连接报文时将其初始化为1
{%endlist%}
{%warning%}
填充报文缓冲区时注意缓冲区下标的递增
{%endwarning%}
```c
/* mqtt.c */
//构建连接报文
void mqtt_connect(void){
  //连接报文没有规定的报文标识符，在此初始化为1
  aliyun_mqtt.message_id = 1;
  //固定报头长度先取1，计算剩余长度时再递增
  aliyun_mqtt.fixed_len = 1;
  //可变报头长度固定为10
  aliyun_mqtt.variable_len = 10;
  //负载记录了clientid、用户名和密码，每个字符串前面使用两个字节记录这个字符串有多长
  aliyun_mqtt.payload_len = 2 + strlen(CLIENTID) + 2 + strlen(USERNAME) + 2 + strlen(PASSWORD);
  aliyun_mqtt.remain_len = aliyun_mqtt.variable_len + aliyun_mqtt.payload_len;
  //固定报头第一个字节为0x10
  aliyun_mqtt.pack_buf[0] = 0x10;
  //记录剩余长度
  do{
    //剩余长度小于128，使用一个字节保存即可
    if(aliyun_mqtt.remain_len/128 == 0){
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = aliyun_mqtt.remain_len;
    }else{
      //如果有进位，则将最高位置为1
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = (aliyun_mqtt.remain_len%128) | 0x80;
    }
    aliyun_mqtt.fixed_len++;
    aliyun_mqtt.remain_len = aliyun_mqtt.remain_len/128;
  }while(aliyun_mqtt.remain_len);
  //可变报头设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+0] = 0x00;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+1] = 0x04;

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2] = 0x4D;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+3] = 0x51;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+4] = 0x54;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+5] = 0x54;

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+6] = 0x04;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+7] = 0xC2;

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+8] = 0x00;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+9] = 0x64;

  //负载设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+10] = strlen(CLIENTID)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+11] = strlen(CLIENTID)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+12],CLIENTID,strlen(CLIENTID));
  aliyun_mqtt.fixed_len += strlen(CLIENTID);

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+12] = strlen(USERNAME)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+13] = strlen(USERNAME)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+14],USERNAME,strlen(USERNAME));
  aliyun_mqtt.fixed_len += strlen(USERNAME);

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+14] = strlen(PASSWORD)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+15] = strlen(PASSWORD)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+16],PASSWORD,strlen(PASSWORD));
  aliyun_mqtt.fixed_len += strlen(PASSWORD);
  //发送报文
  u2_send_data(aliyun_mqtt.pack_buf,aliyun_mqtt.fixed_len + aliyun_mqtt.variable_len + aliyun_mqtt.payload_len);
}
```

**③订阅报文**
>**概述**：根据`MQTT`协议构建**订阅报文**，并通过`USART2`发送给**4G模块**
{%list%}
每隔订阅报文的可变报头保存报文标识符，使用报文标识符后需要递增
{%endlist%}
```c
/* mqtt.c */
void mqtt_subcrib(char *topic){
  aliyun_mqtt.fixed_len = 1;  
  //可变报头长度固定为2，保存报文标识符
  aliyun_mqtt.variable_len = 2;
  //负载由UTF-8字符串topic以及服务等级
  aliyun_mqtt.payload_len = 2 + strlen(topic) + 1;
  aliyun_mqtt.remain_len = aliyun_mqtt.variable_len + aliyun_mqtt.payload_len;

  aliyun_mqtt.pack_buf[0] = 0x82;
  //记录剩余长度
  do{
    //剩余长度小于128，使用一个字节保存即可
    if(aliyun_mqtt.remain_len/128 == 0){
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = aliyun_mqtt.remain_len;
    }else{
      //如果有进位，则必须添加一个标志位
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = (aliyun_mqtt.remain_len%128) | 0x80;
    }
    aliyun_mqtt.fixed_len++;
    aliyun_mqtt.remain_len = aliyun_mqtt.remain_len/128;
  }while(aliyun_mqtt.remain_len);

  //可变报头设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+0] = aliyun_mqtt.message_id/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+1] = aliyun_mqtt.message_id%256;
  aliyun_mqtt.message_id++;
  //负载设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2] = strlen(topic)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+3] = strlen(topic)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+4],topic,strlen(topic));
  aliyun_mqtt.fixed_len += strlen(topic);

  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+4] = 0;
  //发送报文
  u2_send_data(aliyun_mqtt.pack_buf,aliyun_mqtt.fixed_len + aliyun_mqtt.variable_len + aliyun_mqtt.payload_len);
}
```
**④发布报文**
>**概述**：根据`MQTT`协议构建**发布报文**，并通过`USART2`发送给**4G模块**
{%list%}
阿里云支持QoS服务等级0和1，后者有报文标识符，前者没有
{%endlist%}
```c
void mqtt_push_publish0(char *topic ,char *data){
  aliyun_mqtt.fixed_len = 1;
  //可变报头为UTF-8字符串topic
  aliyun_mqtt.variable_len = 2 + strlen(topic);
  //负载由平台提供
  aliyun_mqtt.payload_len = strlen(data);
  aliyun_mqtt.remain_len = aliyun_mqtt.variable_len + aliyun_mqtt.payload_len;
  //第一个字节固定为0x30
  aliyun_mqtt.pack_buf[0] = 0x30;
  //记录剩余长度
  do{
    //剩余长度小于128，使用一个字节保存即可
    if(aliyun_mqtt.remain_len/128 == 0){
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = aliyun_mqtt.remain_len;
    }else{
      //如果有进位，则必须添加一个标志位
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = (aliyun_mqtt.remain_len%128) | 0x80;
    }
    aliyun_mqtt.fixed_len++;
    aliyun_mqtt.remain_len = aliyun_mqtt.remain_len/128;
  }while(aliyun_mqtt.remain_len);
  //可变报头设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+0] = strlen(topic)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+1] = strlen(topic)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2],topic,strlen(topic));
  aliyun_mqtt.fixed_len += strlen(topic);
  //负载设置
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2],data,strlen(data));
  //发送报文
  u2_send_data(aliyun_mqtt.pack_buf,aliyun_mqtt.fixed_len + aliyun_mqtt.variable_len + aliyun_mqtt.payload_len);
}
void mqtt_push_publish1(char *topic ,char *data){

  aliyun_mqtt.fixed_len = 1;
  //可变报头为UTF-8字符串topic
  aliyun_mqtt.variable_len = 2 + 2 + strlen(topic);
  //负载由平台提供
  aliyun_mqtt.payload_len = strlen(data);
  aliyun_mqtt.remain_len = aliyun_mqtt.variable_len + aliyun_mqtt.payload_len;
  //第一个字节固定为0x32
  aliyun_mqtt.pack_buf[0] = 0x32;
  //记录剩余长度
  do{
    //剩余长度小于128，使用一个字节保存即可
    if(aliyun_mqtt.remain_len/128 == 0){
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = aliyun_mqtt.remain_len;
    }else{
      //如果有进位，则必须添加一个标志位
      aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len] = (aliyun_mqtt.remain_len%128) | 0x80;
    }
    aliyun_mqtt.fixed_len++;
    aliyun_mqtt.remain_len = aliyun_mqtt.remain_len/128;
  }while(aliyun_mqtt.remain_len);

  //可变报头设置
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+0] = strlen(topic)/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+1] = strlen(topic)%256;
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2],topic,strlen(topic));
  aliyun_mqtt.fixed_len += strlen(topic);
  //报文标识符
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+2] = aliyun_mqtt.message_id/256;
  aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+3] = aliyun_mqtt.message_id%256;
  aliyun_mqtt.message_id++;
  //负载设置
  memcpy(&aliyun_mqtt.pack_buf[aliyun_mqtt.fixed_len+4],data,strlen(data));
  //发送报文
  u2_send_data(aliyun_mqtt.pack_buf,aliyun_mqtt.fixed_len + aliyun_mqtt.variable_len + aliyun_mqtt.payload_len);
}
```

#### 2.3OTA升级
**①连接状态检测**
>**概述**：使用**外部中断**读取`PB0`电平变化，当其由**低电平变为高电平**表示连接成功
{%list%}
跳转到A区后，WH-GM5会被重置，如果用户不发送+++模块会不断尝试连接链接
{%endlist%}
{%right%}
当模块和阿里云连接成功后，立马发送连接报文
{%endright%}
{%warning%}
如果把GPIO用作EXTI外部中断时，还需要开启AFIO时钟
{%endwarning%}
```c
/* 4g.c */
void u2_event(uint8_t *data,uint16_t datalen){
  //A区程序重启模块，并开启外部中断
  if((datalen == 3)&&(memcmp(data,"zfk",3)==0)){
    u0_printf("4G模块复位成功，等待连接服务器成功...\r\n");
    //打开时钟
    rcu_periph_clock_enable(RCU_AF);
    //复位外部中断
    exti_deinit();
    //配置EXTI_0，设置为上升沿和下降沿都会触发中断
    exti_init(EXTI_0,EXTI_INTERRUPT,EXTI_TRIG_BOTH);
    //设置EXTI_0的中断源为PB0
    gpio_exti_source_select(GPIO_PORT_SOURCE_GPIOB,GPIO_PIN_SOURCE_0);
    //使能外部中断
    exti_interrupt_enable(EXTI_0);
    //打开外部中断并设置其优先级
    nvic_irq_enable(EXTI0_IRQn,0,0);
  }
}
```
```c
/* gd32f10x_it.c */
//外部中断0的服务函数
void EXTI0_IRQHandler(void){
  //如果产生外部中断
  if(exti_interrupt_flag_get(EXTI_0) != 0){
    //清除标志位
    exti_interrupt_flag_clear(EXTI_0);
    //根据PB0电平判断连接状态
    if(gpio_input_bit_get(GPIOB,GPIO_PIN_0) == 1){
      //连接服务器成功后立马发送连接报文
      u0_printf("连接服务器成功\r\n");
      mqtt_connect();
    }else{
      u0_printf("服务器连接断开\r\n");
    }
  }
}

```
```c
/* main.c */
int main(void){
  //初始化
  uint8_t i;
  uart2_init(115200);
  uart0_init(921600);
  delay_init();
  iic_init();
  w25q64_init();
  gd4g_init();
  //分支判断
  m24c02_read_ota_info();

  while(1){
    //如果串口2接收缓冲区不为空，则说明用户输入了命令
    if(U2_RxBufMan.URxDataOut != U2_RxBufMan.URxDataIn){
      u0_printf("本次接收%d字节数据",U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);
      for(i=0;i<(U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);i++){
        u0_printf("%02x",U2_RxBufMan.URxDataOut->start[i]);
      }
      u0_printf("\r\n");
      u2_event(U2_RxBufMan.URxDataOut->start,U2_RxBufMan.URxDataOut->end-U2_RxBufMan.URxDataOut->start+1);
      U2_RxBufMan.URxDataOut++;
      if(U2_RxBufMan.URxDataOut == U2_RxBufMan.URxDataEnd)
        U2_RxBufMan.URxDataOut = &U2_RxBufMan.URxBufPtrs[0];
    }
  }
}
```
**②报文发送**
>**概述**：`u2_printf`输出为**格式化的字符串**，不能用于发送报文，需要重新写一个**发送函数**
{%list%}
类似地，使用DMA和DMA完成中断进行报文的发送，串口2的发送寄存器对应DMA0的通道1
{%endlist%}
{%right%}
串口的数据寄存器实际上包含了两个寄存器TDR和RDR，分别用于发送和接收
{%endright%}
>**发送数据**时，写入数据会**自动存储**在TDR中，**读取数据**时，会**自动提取**`RDR`数据
{%warning%}
初始化DMA时先不设置发送源地址和发送数量，等到真正发送即main函数中再设置
{%endwarning%}
```c
/* uart.h */
//发送数组管理
typedef struct{
	uint16_t UTxDataSum;       //累计发送数量
	uint16_t UTxState;         //0表示发送空闲，1表示发送忙碌
	BufPtr UTxBufPtrs[NUM];    //发送缓冲区管理数组
	BufPtr *UTxDataIn,*UTxDataOut,*UTxDataEnd;
}TxBuf_Manage;
//共享数据
extern TxBuf_Manage U2_TxBufMan;
extern uint8_t U2_TxBuf[U2_TX_SIZE];
```
```c
/* uart.c */
uint8_t U2_TxBuf[U2_TX_SIZE];
TxBuf_Manage U2_TxBufMan;
//串口2发送函数，将数据填入发送缓冲区并且设置IN指针
void u2_send_data(uint8_t *data,uint16_t data_len){
  //若缓冲区长度不够，需要进行回卷
  if(U2_TX_SIZE - U2_TxBufMan.UTxDataSum >= data_len){
    U2_TxBufMan.UTxDataIn->start = &U2_TxBuf[U2_TxBufMan.UTxDataSum];
  }else{
    U2_TxBufMan.UTxDataSum = 0;
    U2_TxBufMan.UTxDataIn->start = U2_TxBuf;
  }
  //拷贝数据到发送缓冲区，并标记结束位置
  memcpy(U2_TxBufMan.UTxDataIn->start,data,data_len);
  U2_TxBufMan.UTxDataSum += data_len;
  U2_TxBufMan.UTxDataIn->end = &U2_TxBuf[U2_TxBufMan.UTxDataSum-1];
  //IN指针回卷判断
  U2_TxBufMan.UTxDataIn++;
  if(U2_TxBufMan.UTxDataIn == U2_TxBufMan.UTxDataEnd){
    U2_TxBufMan.UTxDataIn = &U2_TxBufMan.UTxBufPtrs[0];
  }
}
/* uart.c */
void DMA_init(void){
  //dma初始化所需的结构体，详细可见gd32f10x_dma.h文件
  dma_parameter_struct dma0_init_struct;
  //打开DMA的时钟
  rcu_periph_clock_enable(RCU_DMA0);

  /* 通道2初始化，略 */

  //串口2的发送通道
  dma_deinit(DMA0,DMA_CH1);
  //外设地址，即串口0数据寄存器地址
  dma0_init_struct.periph_addr = USART2+4;
  //搜索注释可在gd32f10x_dma.h中找到对应参数，设置为1字节
  dma0_init_struct.periph_width = DMA_PERIPHERAL_WIDTH_8BIT;
  //数据源地址，初始化为U2_TxBuf，发送时再设置
  dma0_init_struct.memory_addr = (uint32_t)U2_TxBuf;
  //同上定义为一字节
  dma0_init_struct.memory_width = DMA_MEMORY_WIDTH_8BIT ;
  //发送量初始化为0，发送前再修改为对应的数量
  dma0_init_struct.number = 0;
  //dma中断优先级设置，可在gd32f10x_dma.h中找到对应参数
  dma0_init_struct.priority = DMA_PRIORITY_HIGH ;
  //外设地址递增量，这里一直使用串口，所以不变
  dma0_init_struct.periph_inc = DMA_PERIPH_INCREASE_DISABLE;
  //接收地址需要递增
  dma0_init_struct.memory_inc = DMA_MEMORY_INCREASE_ENABLE;
  //传递方向定义为外设到内存
  dma0_init_struct.direction  = DMA_MEMORY_TO_PERIPHERAL;
  //初始化DMA并打开串口0对应的通道，详细可见gd32f10x_dma.c文件
  dma_init(DMA0,DMA_CH1,&dma0_init_struct);
  dma_circulation_disable(DMA0,DMA_CH1);
  //初始时关闭，等发送时再打开
  dma_channel_disable(DMA0,DMA_CH1);
  //打开DAM0的完成中断
  dma_interrupt_enable(DMA0,DMA_CH1,DMA_INT_FTF);
  nvic_irq_enable(DMA0_Channel1_IRQn,0,0);
}
void U2_TxBufMan_init(void){
  //初始时，IN指针和OUT指针都指向管理数组的第一项
  U2_TxBufMan.UTxDataIn = &U2_TxBufMan.UTxBufPtrs[0];
  U2_TxBufMan.UTxDataOut = &U2_TxBufMan.UTxBufPtrs[0];
  //初始时，IN指针的start成员指向接收数组的起始位置
  U2_TxBufMan.UTxDataIn->start = U2_TxBuf;
  U2_TxBufMan.UTxDataEnd = &U2_TxBufMan.UTxBufPtrs[NUM-1];
  U2_TxBufMan.UTxDataSum = 0;	

  U2_TxBufMan.UTxState = 0;
}
```
```c
/* mian.c */
int main(void){
  /* 初始化和分支判断，略 */
  while(1){
    /*接收逻辑，略 */
    //如果串口2发送缓冲区不为空，占用发送通道并修改DMA的源地址、发送，最后打开DMA
    if((U2_TxBufMan.UTxDataOut != U2_TxBufMan.UTxDataIn)&&(U2_TxBufMan.UTxState == 0)){
      u0_printf("本次接收%d字节数据",U2_TxBufMan.UTxDataOut->end-U2_TxBufMan.UTxDataOut->start+1);
      for(i=0;i<(U2_TxBufMan.UTxDataOut->end-U2_TxBufMan.UTxDataOut->start+1);i++){
        u0_printf("%02x",U2_TxBufMan.UTxDataOut->start[i]);
      }
      u0_printf("\r\n");
      //占用发送通道
      U2_TxBufMan.UTxState =1;
      //dma参数设置
      dma_memory_address_config(DMA0,DMA_CH1,(uint32_t)U2_TxBufMan.UTxDataOut->start);
      dma_transfer_number_config(DMA0,DMA_CH1,U2_TxBufMan.UTxDataOut->end-U2_TxBufMan.UTxDataOut->start+1);
      dma_channel_enable(DMA0,DMA_CH1);
      U2_TxBufMan.UTxDataOut++;
      if(U2_TxBufMan.UTxDataOut == U2_TxBufMan.UTxDataEnd)
        U2_TxBufMan.UTxDataOut = &U2_TxBufMan.UTxBufPtrs[0];
    }
  }
}
```
```c
//DMA发送完成中断关闭DMA并释放发送通道
void DMA0_Channel1_IRQHandler(void){
  //如果数据发送完成
  if(dma_interrupt_flag_get(DMA0,DMA_CH1,DMA_INT_FLAG_FTF) != 0){
    dma_interrupt_flag_clear(DMA0,DMA_CH1,DMA_INT_FLAG_FTF);
    dma_channel_disable(DMA0,DMA_CH1);
    u0_printf("数据发送完成\r\n");
    U2_TxBufMan.UTxState =0;
  }
}
```
**③订阅主题**
>**概述**：在**发送连接报文**后，如果收到了**正确的响应**则发送对应的**订阅报文**关注对应主题，并**上报版本号**
{%list%}
如下所示，阿里云OTA升级流程如下
{%endlist%}
>详细见[阿里云OTA升级说明](https://help.aliyun.com/zh/iot/user-guide/ota-update?spm=a2c4g.11186623.help-menu-30520.d_2_2_7_3_8.4ae74b92x2kCTt&scm=20140722.H_89307._.OR_help-V_1)
{%right%}
添加对应的标志位用于提示MQTT连接成功和发生OTA事件
{%endright%}
![阿里云OTA升级流程](/image/bootloader_11.png)
```c
/* main.c */
//标志位
#define MQTT_CONNECT_OK      0x00000001                         //需要更新A区
#define OTA_EVENT            0x00000002                         //发生OTA事件
```
```c
void u2_event(uint8_t *data,uint16_t datalen){
  /* 其他逻辑，略 */
  //如果connect报文接收成功
  if((datalen == 4)&&(data[0] == 0x20)){
    u0_printf("收到CONNACK报文\r\n");
    if(data[3] == 0x00){
      u0_printf("CONNECT报文成功连接服务器\r\n");
      boot_status_flag |= MQTT_CONNECT_OK;
      //用于获取升级包信息
      mqtt_subcrib("/ota/device/upgrade/k1uz3OMeDAF/D001");
      //用于获取分片下载响应
      mqtt_subcrib("/sys/k1uz3OMeDAF/D001/thing/file/download_reply");
      //上报设备软件版本号
      ota_version();
    }else{
      u0_printf("CONNECT报文错误，准备重启\r\n");
      NVIC_SystemReset();
    }
  }
  //如果topic订阅成功
  if((datalen == 5)&&(data[0] == 0x90)){
    u0_printf("收到SUBACK报文\r\n");
    if((data[datalen-1] == 0x00)||(data[datalen-1] == 0x01)){
      u0_printf("SUBCRIBE订阅报文成功\r\n");
    }else{
      u0_printf("SUBCRIBE订阅报文错误，准备重启\r\n");
      NVIC_SystemReset();
    }
  }
}
```
```c
void ota_version(void){
  char temp[128];
  memset(temp,0,128);
  sprintf(temp,"{\"id\": \"1\",\"params\": {\"version\": \"%s\"}}",ota_info.ota_ver);
  mqtt_push_publish1("/ota/device/inform/k1uz3OMeDAF/D001",temp);
}
```
**④启动OTA**
>**概述**：当接收到服务端**PUBLISH报文**后需要根据**报文类型**进行对应的处理
{%list%}
去除PUBLISH报文中的无用信息如固定报头、剩余长度和UTF-8长度字节，并从中提取关键词获取有效信息
{%endlist%}
{%right%}
服务端设置OTA后，客户端会收到对应PUBLISH报文，其负载格式如下，从中提取关键数据，并启动OTA分片下载
{%endright%}
>在**监控运维->OTA升级**中添加**OTA升级包**，并启动升级包的**验证功能**主动推送给**指定版本的设备**

{%warning%}
将负载写入程序中时，需要删除各个参数之间的空格和换行符
{%endwarning%}
```c
/* mqtt.h */
//mqtt协议管理结构体
typedef struct{
  //存储报文
  uint8_t  pack_buf[512];
  uint16_t message_id;       //报文标识符
  uint16_t fixed_len;        //固定报文长度
  uint16_t variable_len;     //可变报文长度
  uint16_t payload_len;      //负载报文长度
  uint16_t remain_len;       //剩余报文长度
  //存储阿里云推送报文关键信息以及OTA关键参数
  uint8_t  cmd_buf[512];     //阿里云推送报文缓冲区
  int      size;             //OTA升级包大小
  int      streamid;         //OTA升级包ID
  uint8_t  ota_ver_temp[32]; //OTA升级包版本号
  int      counter;          //总共需要分多少此下载
  int      num;              //第几次下载
  int      cur_down_len;     //当前下载长度
}mqtt_manage;
```
```c
/* 4g.c */
void u2_event(uint8_t *data,uint16_t datalen){
  /* 其他逻辑略 */
  //接收到PUBLISH报文
  if((data[0] == 0x30)&&(boot_status_flag & MQTT_CONNECT_OK)){
    u0_printf("收到等级0的PUBLSIH报文\r\n");
    mqtt_deal_publish(data,datalen);
  }
}
```
```c
/* mqtt.c */
void mqtt_deal_publish(uint8_t *data,uint16_t data_len){
  uint8_t i;
  //清除剩余长度
  for(i=1;i<5;i++){
    if((data[i]&0x80) == 0)
      break;
  }
  //提取命令
  memset(aliyun_mqtt.cmd_buf,0,512);
  memcpy(aliyun_mqtt.cmd_buf,&data[1+i+2],data_len-1-2-i);
  u0_printf("%s\r\n",aliyun_mqtt.cmd_buf);
  //提取关键词
  //如果收到的时升级包信息，从中提取升级包大小、升级包版本和升级包ID
  if(strstr((char*)aliyun_mqtt.cmd_buf,"/ota/device/upgrade/k1uz3OMeDAF/D001")){
    if(sscanf((char*)aliyun_mqtt.cmd_buf,"/ota/device/upgrade/k1uz3OMeDAF/D001{\"code\":\"1000\",\"data\":{\"size\":%d,\"version\":\"%26s\",\"isDiff\":1,\"signMethod\":\"MD5\",\"dProtocol\":\"mqtt\",\"streamId\":%d,\"streamFileId\":1,\"md5\":\"%*16s\",\"digestsign\":\"%*22s\",\"sign\":\"%*16s\",\"module\":\"MCU\",\"extData\":{\"key1\":\"value1\",\"key2\":\"value2\"}},\"id\":%*d,\"message\":\"success\"}",&aliyun_mqtt.size,aliyun_mqtt.ota_ver_temp,&aliyun_mqtt.streamid) == 3){
      u0_printf("OTA固件大小:%d\r\n",aliyun_mqtt.size);
      u0_printf("OTA固件ID:%d\r\n",aliyun_mqtt.streamid);
      u0_printf("OTA固件版本号:%s\r\n",aliyun_mqtt.ota_ver_temp);
      boot_status_flag |= OTA_EVENT;
      //擦除0号块
      w25q64_erase64k(0);
      //计算下载次数
      if(aliyun_mqtt.size%256 == 0){
        aliyun_mqtt.counter = aliyun_mqtt.size/256;
      }else{
        aliyun_mqtt.counter = aliyun_mqtt.size/256+1;
      }
      //初始化第一次下载
      aliyun_mqtt.num = 1;
      aliyun_mqtt.cur_down_len = 256;
      //启动OTA下载
      ota_down(aliyun_mqtt.cur_down_len,(aliyun_mqtt.num-1)*256+aliyun_mqtt.cur_down_len);
    }else{
      u0_printf("提取OTA下载命令错误");
    }
  }
}
```
```json
//阿里云升级包信息推送格式
{
  "code":"1000",
  "data":{
      "size":432945,
      "version":"2.0.0",
      "isDiff":1,
      "signMethod":"MD5",
      "dProtocol":"mqtt",
      "streamId":1397345,
      "streamFileId":1,
      "md5":"93230c3bde425***",
      "digestsign":"A4WOP***SYHJ6DDDJD9***",
      "sign":"93230c3bde425***",
      "module":"MCU",
      "extData":{
          "key1":"value1",
          "key2":"value2"
      }
  },
  "id":1507707025,
  "message":"success"
}
```
**⑤分片下载**
>**概述**：`ota_down`发送**下载请求**后，会收到阿里云发送的**数据包**，格式如下，需要从中提取**程序数据**
{%list%}
向阿里云发送分片下载请求后，为了获取对应响应，需要订阅相关主题
{%endlist%}
{%right%}
下载完毕后，设置OTA更新标志和版本号并将其写入M24C02
{%endright%}
{%warning%}
每次使用ota_down发送PUBLISH报文后需要进行一定的延时，太快阿里云不响应
{%endwarning%}
![阿里云分片下载响应格式](/image/bootloader_12.png)
```c
void u2_event(uint8_t *data,uint16_t datalen){
  /* 其他逻辑，略 */
  //如果connect报文接收成功
  if((datalen == 4)&&(data[0] == 0x20)){
    u0_printf("收到CONNACK报文\r\n");
    if(data[3] == 0x00){
      u0_printf("CONNECT报文成功连接服务器\r\n");
      boot_status_flag |= MQTT_CONNECT_OK;
      //用于获取升级包信息
      mqtt_subcrib("/ota/device/upgrade/k1uz3OMeDAF/D001");
      //用于获取分片下载响应
      mqtt_subcrib("/sys/k1uz3OMeDAF/D001/thing/file/download_reply");
      //上报设备软件版本号
      ota_version();
    }else{
      u0_printf("CONNECT报文错误，准备重启\r\n");
      NVIC_SystemReset();
    }
  }
}
```
```c
/* 4g.c */
//启动OTA分片下载
void ota_down(int size,int offset){
  char temp[128];
  memset(temp,0,128);
  //需要指定OTA升级包ID、请求大小和偏移
  sprintf(temp,"{\"id\": \"1\",\"params\": {\"fileInfo\":{\"streamId\":%d,\"fileId\":1},\"fileBlock\":{\"size\":%d,\"offset\":%d}}}",aliyun_mqtt.streamid,size,offset);
  //发送请求topic
  u0_printf("当前是第%d/%d次下载",aliyun_mqtt.num,aliyun_mqtt.counter);
  mqtt_push_publish0("/sys/k1uz3NhkSDU/D001/thing/file/download",temp);
  //阿里云延迟，不能发送请求太快
  delay_ms(300);
}

```
```c
void mqtt_deal_publish(uint8_t *data,uint16_t data_len){
  /* 其余逻辑，略 */
  if(strstr((char*)aliyun_mqtt.cmd_buf,"/sys/k1uz3OMeDAF/D001/thing/file/download_reply")){
    //从尾部去除CRC校验码提取数据并写入w25q640号块
    w25q64_writepage(&data[data_len - aliyun_mqtt.cur_down_len -2],aliyun_mqtt.num-1);

    aliyun_mqtt.num++;
    if(aliyun_mqtt.num < aliyun_mqtt.counter){
      aliyun_mqtt.cur_down_len = 256;
      ota_down(aliyun_mqtt.cur_down_len,(aliyun_mqtt.num-1)*256+aliyun_mqtt.cur_down_len);
    }else if(aliyun_mqtt.num == aliyun_mqtt.counter){
      if(aliyun_mqtt.size%256 == 0){
        aliyun_mqtt.cur_down_len = 256;
        ota_down(aliyun_mqtt.cur_down_len,(aliyun_mqtt.num-1)*256+aliyun_mqtt.cur_down_len);
      }else{
        aliyun_mqtt.cur_down_len = aliyun_mqtt.size%256;
        ota_down(aliyun_mqtt.cur_down_len,(aliyun_mqtt.num-1)*256+aliyun_mqtt.cur_down_len);
      }
    }else{
      u0_printf("OTA下载完毕\r\n");
      memset(ota_info.ota_ver,0,32);
      //记录版本号并设置OTA标志提示
      memcpy(ota_info.ota_ver,aliyun_mqtt.ota_ver_temp,26);
      ota_info.app_len[0] = aliyun_mqtt.size;
      ota_info.ota_flag = OTA_SET_FLAG;
      m24c02_write_ota_info();
      NVIC_SystemReset();
    }
  }
}
```
```json
//阿里云数据请求格式
{
  "id": "123456",
  "version": "1.0",
  "params": {
      "fileInfo":{
          "streamId":1234565,
          "fileId":1
      },
      "fileBlock":{
          "size":256,
          "offset":2
      }
  }
}
```





















