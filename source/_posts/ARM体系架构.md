---
title: ARM体系架构
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
  - 体系架构
  - ARM
  - 精简指令集
categories: 编程语言
keywords: 文章关键词
updated: ''
img: /medias/featureimages/16.webp
date:
summary: ARM体系架构
---
# 汇编语言
## ARM体系结构
### 1.引言
#### 1.1简介
**①处理器系列**
>**概述**：常见的**处理器系列**有`Cortex-M`、`Cortex-A`和`Cortex-R`系列，分别针对不同的**使用场景**
{%list%}
Cortex-M主要面向低功耗场景，Cortex-A主要面向高性能场景，Cortex-R主要面向高实时性场景
{%endlist%}
{%right%}
这里只关注Cortex-M和Cortex-A系列
{%endright%}
>相比`Cortex-M`，`Cortex-A`支持**MMU**、**虚拟内存管理**和**多核**，但是`Cortex-M`对**中断管理**进行了优化

**②指令集**
>**概述**：除了**ARM指令集**，还提供**Thumb指令集**，前者指令长度为**32位**，后者指令长度为**16位或32位**
{%list%}
Thumb指令集提供了更出色的代码密度，但是通常运行速度不如ARM指令集
{%endlist%}
{%right%}
某些处理器系列提供Thumb-2指令集，可以混合使用ARM指令集和Thumb指令集
{%endright%}
**③指令集切换**
>**概述**：通常采用`BX addr/addr+1`表示后续使用**ARM/Thumb指令集**
{%list%}
ARM处理器在处理异常时，不管处理器处于什么状态，则都将切换到ARM状态
{%endlist%}
>在**汇编文件**中，可以采用`.arm/.thumb`表示**后续指令**使用**ARM/Thumb指令集**

>使用`GCC`时，可以添加`-marm/-mthumb`**编译选项**表示使用**ARM/Thumb指令集**编译该文件
{%right%}
ARM指令和Thumb指令的最低位始终为0，所以采用该位作为ARM指令与Thumb指令的切换标志位
{%endright%}
#### 1.2Cortex-M系列
**①处理器状态**
>**概述**：有**异常模式**和**线程模式**两种运行模式，前者一直处于**特权级**，后者分为**特权级线程模式**和**用户级线程模式**
{%list%}
系统上电复位时处于特权级线程模式，通过手动修改CONTROL寄存器降级为用户级线程模式
{%endlist%}
>`CONTROL`寄存器用于定义**特权等级**和**堆栈指针**的选择
{%right%}
用户级线程模式不能修改CONTROL寄存器，需要触发异常中断，在中断中修改CONTROL寄存器来实现等级提升
{%endright%}
![处理器状态](/image/arm_2.png)
**②内部寄存器**
>**概述**：分为**通用寄存器**`R0-R12`、**堆栈寄存器**`SP`、**链接寄存器**`LR`、**程序计数器**`PC`和**程序状态寄存器**`xPSR`等
{%list%}
处理状态不同，SP分别指向主堆栈或线程堆栈，前者用于操作系统内核以及异常处理例程，后者用于应用程序代码
{%endlist%}
>`LR`在**调用函数**时保存函数的**返回地址**，在**中断服务程序**中用作`EXC_RETURN`,用于确定**中断结束后恢复状态**

>`PC`的**最低位**并不是地址，而是**Thumb状态位**，会被写到到`EPSR`的`T`位
{%right%}
除此之外，还有一些只能在特权级访问的寄存器CONTROL、BASEPRI、PRIMASK和FAULTMASK
{%endright%}
>这些寄存器用于设置**特权等级**和**屏蔽中断**等
{%warning%}
程序状态寄存器xPSR在用户级只能被访问，不能被修改
{%endwarning%}

#### 1.3Cortex-A系列
**①处理器状态**
>**概述**：有**用户模式**、**系统模式**、**管理员模式**、**终止模式**、**未定义指令模式**、**一般中断模式**和**快中断模式**
{%list%}
用户模式处于用户态，其余模式处于特权态，用户态需要通过中断/异常切换到特权态，特权态之间可以相互切换
{%endlist%}
{%right%}
类似的，Cortex-A通过修改CPSR的MODE域来进入其他模式
{%endright%}
![处理器状态](/image/arm_3.png)

**②内部寄存器**
>**概述**：类别同`Cortex-M`，但是每种**特权模式**都有自己的某些**备份寄存器**，会有对应的**后缀**
{%list%}
异常模式有自己的SP、LR和SPSR寄存器，SP指向自己的栈，LR/SPSR保存异常处理完毕后的返回地址/程序状态
{%endlist%}
{%right%}
快中断模式有自己的通用寄存器，省去了一部分保存现场的时间
{%endright%}
{%warning%}
每种异常模式只能访问用户态的寄存器以及对应的备份寄存器
{%endwarning%}
![内部处理器](/image/arm_1.png)
### 2.常用指令
#### 2.1引言
**①程序状态寄存器**
>**概述**：表示**当前程序状态**，主要关注**条件标志位**和**控制位**，含义如下表所示
{%list%}
条件标志位由最近的能影响条件标志位的指令决定，一条指令可能影响多个标志位
{%endlist%}
{%right%}
程序状态寄存器还有mode域，用于指示当前CPU状态
{%endright%}
| 标志位 | 含义                                               | 作用                         |
|--------|----------------------------------------------------|------------------------------|
| **N**  | 运算结果为负数，置为`1`                            | 表示最近的算术/逻辑结果为负数 |
| **Z**  | 运算结果为零，置为`1`                              | 表示最近的算术/逻辑结果为零   |
| **C**  | 运算中发生了进位或借位，置为`1`                     | 表示加法中的进位或减法中的借位 |
| **V**  | 若有符号运算发生溢出（结果超出范围），置为`1`        | 表示有符号运算发生溢出       |
| **I**  | 禁用常规中断，`I`为`1`时禁用IRQ                    | 控制是否允许常规中断   |
| **F**  | 禁用快速中断，`F`为`1`时禁用FIQ                    | 控制是否允许快速中断   |
| **T**  | 如果当前处理器在Thumb模式，置为`1 `                | 控制处理器执行32位或16位指令 |

**②一般语法格式**
>**概述**：一般语法格式为`<指令助记符>{<执行条件>}{S} <目标寄存器>,<操作数>{,<第二个操作数>}`
{%list%}
<>内的项是必须的，{}内的项是可选的，S表示该指令会影响到程序状态寄存器的条件标志位
{%endlist%}
{%right%}
执行条件根据程序状态寄存器的条件标志位决定是否执行该指令，具体如下所示
{%endright%}
| **条件码**     | **含义**                  | **CPSR 标志位要求**                      | **条件码**     | **含义**                      | **CPSR 标志位要求**                      |
|----------------|---------------------------|-----------------------------------------|----------------|-------------------------------|-----------------------------------------|
| **EQ**         | 相等                      | `Z = 1`                                 | **CS**         | 有进位                         | `C = 1`                                 |
| **NE**         | 不等于                    | `Z = 0`                                 | **CC**         | 无进位                         | `C = 0`                                 |
| **MI**         | 负数                      | `N = 1`                                 | **PL**         | 非负数                         | `N = 0`                                 |
| **VS**         | 溢出                      | `V = 1`                                 | **VC**         | 无溢出                         | `V = 0`                                 |
| **HI**         | 无符号数大于              | `C = 1 && Z = 0`                       | **LS**         | 无符号数小于等于               | `C = 0 \|\| Z = 1`                     |
| **GE**         | 有符号数大于等于        | `N = V`                                 | **LT**         | 有符号数小于                   | `N ≠ V`                                 |
| **GT**         | 有符号数大于              | `Z = 0 && N = V`                       | **LE**         | 有符号数小于等于             | `Z = 1 \|\| N ≠ V`                     |
| **AL**         | 无条件执行                | 无条件                                  | **NV**         | 不执行                         | 无条件                                 |

**③伪指令**
>**概述**：可以像**ARM指令**一样使用，在**汇编过程**中会被转化为一个或多个**等效的真实指令**
{%list%}
常用的伪指令有PUSH、POP和LDR Rd,=label等
{%endlist%}
{%right%}
使用真实指令LDR R0,#val还需要判断val是否为立即数，此时可以采用LDR R0,=#val伪指令
{%endright%}
>如果`val`为**有效立即数**，该**伪指令**被转化为`MOV R0,#val`，反之转化为以下代码
```nasm
...
LDR R0,[PC,#offset] ;从对应位置读取改值
...
Label DCD val       ;一开始程序将val保存到某个位置
...
```

#### 2.2寻址方式
**①立即数寻址**
>**概述**：操作数在指令中**直接给出**，需要添加`#`前缀，如`MOV R0, #10`表示`R0 = 10`
{%list%}
一条ARM指令长度为32位，需要将一些位表示操作码和条件码等，通常只有12位的长度用于表示立即数
{%endlist%}
{%right%}
为了表示更大范围的数，将其拆分为8位常数和4位旋转位移值，8位常数按照旋转位移值的两倍进行循环位移
{%endright%}
>如`0x23000000`可以看作一个`8`位常数`0x00000023`循环右移`8`位得到
{%warning%}
立即数有一定的限制，在使用前需要判断其是否合法
{%endwarning%}
**②寄存器寻址**
>**概述**：操作数在**寄存器中**，如`MOV R1,R2`表示`R0 = R1`
{%list%}
采用寄存器寻址时，可以将寄存器中的值先移位再执行对应操作，如MOV  R0,R2,LSL #3表示R0 = R2 * 8
{%endlist%}
{%right%}
使用{}可以一次性操作多个寄存器，如PUSH {R0, R1}，表示依次将R0和R1压入栈中
{%endright%}
**③寄存器间接寻址**
>**概述**：操作数的**内存地址**在**寄存器中**，如`LDR R0,[R1]`表示将地址`R1`处的值赋予`R0`
{%list%}
使用寄存器间接寻址时，可以给得到的地址加上偏移量，如LDR R0,[R1,#4]表示将地址R1+4处的值赋予R0
{%endlist%}
>可以在`[R1,#4]`后添加`!`，表示**寻址后**将`R1`修改为`R1+4`
{%right%}
还可以在读取地址后修改地址寄存器的值，如LDR R0, [R1], #4表示将地址R1处的值赋予R0后R1的值减4
{%endright%}
#### 2.3数据处理指令
**①加减法**
>**概述**：格式为`OP Rd,Rn,Rm/#val`，`OP`为`ADD`表示**加法**，为`SUB`表示**减法**
{%list%}
ADD R0,R1,R2表示R0 = R1+R2
{%endlist%}
**②位运算**
>**概述**：格式为`OP Rd,Rn,Rm/#val`，`OP`为`AND`表示按位进行**与运算**，为`ORR`表示**或运算**，为`EOR`表示**异或运算**
{%list%}
AND R0,R1,#(1<<3)表示R0 = R1&(1<<3)，即将第三位置一
{%endlist%}
**③移位运算**
>**概述**：格式为`OP Rd,Rn,#val`，`OP`为`LSL/LSR`表示**逻辑左/右移**，为`ROR`表示**循环右移**
{%list%}
LSL R0,R1,#3表示R0 = R1<<3
{%endlist%}
{%right%}
ARM没有专门的循环左移指令，使用旋转右移(32-n)位来模拟左移循环左移n位
{%endright%}
**④比较指令**
>**概述**：格式为`CMP Rd,Rn`，比较`R0`和`R1`的值
{%right%}
实际上是执行R0-R1，并设置条件标志
{%endright%}
#### 2.4数据读写指令
**①寄存器读写**
>**概述**：格式为`MOV Rd,Rn/#val`，表示将**寄存器**`Rn`的值/**立即数**`val`存入**寄存器**`Rd`
{%list%}
MOV R0,R1表示R0 = R1
{%endlist%}
{%warning%}
MOV指令只能读取一个寄存器，不能读取内存
{%endwarning%}
**②内存读写**
>**概述**：格式为`OP Rd,[Rn,#offset]`/`OP Rd,[Rn],#offset`，`OP`为`LDR`表示**读内存**，为`STR`表示**写内存**
{%list%}
LDR/STR指令通常用于读写32位数据，可以增加B/H后缀表示读写一/两个字节
{%endlist%}
>`LDRB R0,[R1]`表示将地址`[R1]`处的**字节**加载到`R0`的**低八位**，并将`R0`其余位**清零**

>`STRB R0,[R1]`表示将`R0`的**低八位**写入地址`[R1]`处

**③批量内存读写**
>**概述**：格式为`OP{mode} Rn{!},{reglist}`，`OP`为`LDM`表示**读内存**，为`STM`表示**写内存**
{%list%}
mode表示读写内存的工作模式，!表示每次读写内存后会更新`Rn`的值，寄存器列表从左到右对应地址从低到高
{%endlist%}
{%right%}
常用读写模式有IB/IA和DB/DA，分别表示每次传输前/后增加地址和每次传输前/后减少地址
{%endright%}
{%warning%}
注意寄存器列表从左到右对应地址从低到高，所以增加地址是从左向右存，而减少地址是从右向左存
{%endwarning%}
#### 2.5跳转指令
**①相对跳转**
>**概述**：格式为`B/BL label`，`label`为一个表示目标地址的**标志**
{%list%}
可以跳到以当前PC为基址，前后32MB的地址空间范围
{%endlist%}
{%right%}
BL会将返回地址存入LR寄存器中
{%endright%}

**②绝对跳转**
>**概述**：格式为`BX/BLX Rd`，会根据**跳转地址**的`BIT0`**切换指令集**
{%list%}
为绝对跳转，可以跳转到32位的全部地址空间，同上BLX会将返回地址存入LR寄存器中
{%endlist%}
{%right%}
还可以可以使用MOV PC，#val或者LDR PC,=0x30008000实现绝对跳转
{%endright%}
{%warning%}
使用绝对跳转需要注意运行地址和链接地址不一致的问题
{%endwarning%}

### 3.异常与中断
#### 3.1引言
**①硬件系统**
>**概述**：主要由**中断源**、**中断控制器**和**CPU**组成
{%list%}
中断源产生中断、中断控制器管理中断，CPU处理中断
{%endlist%}
>不同处理器使用的**中断控制器**不同，`Cortex-M`处理器常用`NVIC`，`Cortex-A`处理器常用`GIC`
{%right%}
为了使得中断可以被CPU响应，需要分别对中断源、中断控制器和CPU进行中断使能设置
{%endright%}
**②中断优先级**
>**概述**：由**一些位**表示，利用**优先级分组**，指示哪些位用于**主优先级**，剩余位为**子优先级**
{%list%}
高主优先级中断可以抢占低主优先级中断，主优先级相同的情况下，高子优先级中断不能抢占低子优先级中断
{%endlist%}
{%right%}
如果主优先级和子优先级相同，则比较它们的硬件中断编号，中断编号越小，优先级越高
{%endright%}
{%warning%}
整个系统执行过程中，只能设置一次中断分组，通常在系统初始化函数/主函数中被调用
{%endwarning%}
```c
/*
* STM32F103的中断分组配置 
* 配置中断优先级分组：抢占优先级和子优先级
* 形参如下：
* @arg NVIC_PriorityGroup_0: 		0 bit  for 抢占优先级
* 									4 bits for 子优先级
* @arg NVIC_PriorityGroup_1:	 	1 bit  for 抢占优先级
* 									3 bits for 子优先级
* @arg NVIC_PriorityGroup_2: 		2 bits for 抢占优先级
* 									2 bits for 子优先级
* @arg NVIC_PriorityGroup_3: 		3 bits for 抢占优先级
* 									1 bit  for 子优先级
* @arg NVIC_PriorityGroup_4: 		4 bits for 抢占优先级
* 									0 bit  for 子优先级
* @ 注意 如果优先级分组为 0，则抢占优先级就不存在，优先级就全部由子优先级控制
*/
void NVIC_PriorityGroupConfig(uint32_t NVIC_PriorityGroup)
{
  	/* 检查参数*/
  	assert_param(IS_NVIC_PRIORITY_GROUP(NVIC_PriorityGroup));
    /* 设置优先级分组*/ 
    SCB->AIRCR = AIRCR_VECTKEY_MASK | NVIC_PriorityGroup;
}
```
**③中断编程步骤**
>**概述**：以`STM32F103`为例，主要步骤为**使能外设中断**、**配置**`NVIC`和**编写中断处理函数**
{%list%}
不同外设的使能步骤不同，如STM32F103的GPIO不仅仅要配置GPIO，还需要配置外部中断管理器
{%endlist%}
{%right%}
配置NVIC主要是创建并初始化NVIC_InitTypeDef结构体
{%endright%}
{%warning%}
NVIC_IRQChannel不可以写错，写错了不会报错，只会导致不响应中断
{%endwarning%}
>`STM32F103`所有**中断源**定义在`stm32f10x.h`的`IRQn_Type`结构体中
```c
/* misc.h */
typedef struct
{
  uint8_t NVIC_IRQChannel;                      /*!< 中断源 */
  uint8_t NVIC_IRQChannelPreemptionPriority;    /*!< 抢占优先级 */
  uint8_t NVIC_IRQChannelSubPriority;         	/*!< 子优先级*/
  FunctionalState NVIC_IRQChannelCmd;           /*!< 中断使能或者失能 */   
} NVIC_InitTypeDef;
```
```c
/* 以EXTI2_IRQn为例配置NVIC结构体 */
NVIC_InitTypeDef NVIC_InitStructure;
NVIC_InitStructure.NVIC_IRQChannel = EXTI2_IRQn;              //使能按键外部中断通道
NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 0x02;  //抢占优先级 2，
NVIC_InitStructure.NVIC_IRQChannelSubPriority = 0x02;         //子优先级 2 
NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;               //使能外部中断通道
NVIC_Init(&NVIC_InitStructure);                               //初始化 NVIC
```
#### 3.2Cortex-M中断系统
**①简介**
>**概述**：中断发生时，硬件**自动保存现场并分辨异常中断**，随后跳转到对应**中断处理函数**，最后硬件**自动恢复现场**
{%list%}
中断发生时，硬件自动将调用者应该保存的寄存器以及返回地址压入主栈中
{%endlist%}
>根据ARM**过程调用标准**，`R0-R3`、`R12`、`LR`和`PSR`为**调用者保存的寄存器**，`R4-R11`为**被调用者保存的寄存器**
{%right%}
不同于函数调用，中断处理函数会将LR设置一特殊值，当返回时检测到LR为特殊值，硬件会自动恢复现场
{%endright%}
![硬件工作](/image/arm_4.png)
**②中断向量表**
>**概述**：`STM32F103`的**中断向量表**如下所示，可见其给**每个中断**都设置了**对应的表项**
{%list%}
Cortex-M的中断向量表首项为主栈顶部的地址
{%endlist%}
```nasm
__Vectors   DCD __initial_sp       ; Top of Stack
            DCD Reset_Handler      ; Reset Handler
            DCD NMI_Handler        ; NMI Handler
            DCD HardFault_Handler  ; Hard Fault Handler
            DCD MemManage_Handler  ; MPU Fault Handler
            DCD BusFault_Handler   ; Bus Fault Handler
            DCD UsageFault_Handler ; Usage Fault Handler
            DCD 0                  ; Reserved
            DCD 0                  ; Reserved
            DCD 0                  ; Reserved
            DCD 0                  ; Reserved
            DCD SVC_Handler        ; SVCall Handler
            DCD DebugMon_Handler   ; Debug Monitor Handler
            DCD 0                  ; Reserved
            DCD PendSV_Handler     ; PendSV Handler
            DCD SysTick_Handler    ; SysTick Handler
            /* 以下代码省略 */
__Vectors_End
```
**③中断处理函数**
>**概述**：以`FreeRTOS`中的`PendSV`中断处理函数为例，如下所示
{%list%}
中断处理函数需要保存被调用者应该保存的现场r4-r11到对应的栈中，即保存现场
{%endlist%}
{%right%}
注意区分中断处理函数手动保存的现场和硬件保存的现场是不同的
{%endright%}
```c
__asm void xPortPendSVHandler( void )
{
  extern uxCriticalNesting;
  extern pxCurrentTCB;
  extern vTaskSwitchContext;
  /* 确保使用的寄存器在调用时保持对齐 */
  PRESERVE8
  /* 将线程栈顶指针读入r0 */
  mrs r0, psp
  isb
  /* 将pxCurrentTCB的地址读取到r3 */
  ldr r3, =pxCurrentTCB
  /* 将当前任务的TCB地址读取到r2 */
  ldr r2, [ r3 ]
  /* 将寄存器r4到r11的值压入当前任务的栈中，即保存上下文，并更新r0 */
  stmdb r0 !, { r4 - r11 } 
  /* 将新的栈顶指针保存到TCB中 */
  str r0, [ r2 ] 
  /* 将r3和r14压入中断栈中 */
  /* r3为变量pxCurrentTCB的地址，r14为链接寄存器，存储中断返回地址 */
  stmdb sp !, { r3, r14 }
  /* 屏蔽所有中断 */
  mov r0, #configMAX_SYSCALL_INTERRUPT_PRIORITY
  msr basepri, r0
  dsb
  isb
  /* 调用函数vTaskSwitchContext决定下一个要运行的任务，并使能响应中断 */
  bl vTaskSwitchContext
  mov r0, #0
  msr basepri, r0
  /* 弹出r3，r14，此时r3为新任务的TCB指针的地址 */
  ldmia sp !, { r3, r14 }
  /* 将切换后任务的TCB地址读入r1，并将切换后任务的栈地址读入r0 */
  ldr r1, [ r3 ]
  ldr r0, [ r1 ] 
  /* 恢复现场，设置栈指针，最后跳转运行 */
  ldmia r0 !, { r4 - r11 } 
  msr psp, r0
  isb
  bx r14
  nop
}
```
#### 3.3Cortex-A中断系统
**①简介**
>**概述**：中断发生时，硬件自动保存`PC`和`CPSR`，随后修改`CPSR`进入**对应模式**并跳转到**中断向量表对应地址**
{%list%}
硬件将PC和CPSR保存到对应的LR_xxx和SPSR_xxx中，最后自动将SPSR_xxx恢复到CPSR，PC需要手动恢复
{%endlist%}
{%right%}
Cortex-M硬件自动完成的部分，Cortex-A将其放到对应入口函数中完成，
{%endright%}


**②中断向量表**
>**概述**：`Cortex-A`的中断向量表更加简洁，存放的不是**具体的中断处理函数**，而是CPU**异常模式的入口**
{%list%}
对应入口函数会保存现场，随后读取指定的寄存器判断异常中断并调用对应的处理函数，最后恢复现场
{%endlist%}
```nsam
.global _start                  

_start:
    ldr pc,=Reset_Handler       ; 复位中断 
    ldr pc,=Undfined_Handler    ; 未定义指令中断 
    ldr pc,=SVC_Handler         ; SVC中断 
    ldr pc,=PrefAbort_Handler   ; 预取终止中断
    ldr pc,=DataAbort_Handler   ; 数据终止中断
    ldr pc,=NotUsed_Handler     ; 未使用中断
    ldr pc,=IRQ_Handler         ; IRQ中断
    ldr pc,=FIQ_Handler         ; FIQ(快速中断)未定义中断
```
**③入口函数**
>**概述**：如下为常用的**一般中断入口函数**模板
{%list%}
同理，do_irq如果是汇编函数，也需要手动保存r4-r11
{%endlist%}
{%warning%}
因为流水线机制，最后将LR_xxx赋予PC时需要先进行一定的偏移，具体偏移量需要查手册
{%endwarning%}
>如下，当`0X2000`的指令执行时，`PC`已经指向`0X2008`，返回执行时应该**执行译址的指令**`0X2004`，所以需要偏移
```nasm
;ARM指令流水线
0X2000  MOV R1,R0     ; 执行
0X2004  MOV R2,R3     ; 译址
0X2008  MOV R4,R5     ;取址PC
```
```nasm
IRQ_Handler:

    ;保存现场
    PUSH {r0-r3, r12, lr}

    ;获取中断号并保存在R0寄存器中
    mrc p15,4,r1,c15,c0,0
    add r1,r1,#0X2000
    ldr r0,[r1,#0xC]

    ;根据do_irq，根据中断号调用对应的中断处理函数
    BL   do_irq

    ;恢复现场      
    POP  {r0-r3, r12, lr}
    SUBS pc,lr,#4     
```








