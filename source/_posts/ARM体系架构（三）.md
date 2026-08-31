---
title: ARM体系架构（三）
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
  - ARM体系架构
categories: 编程语言
keywords: 文章关键词
updated: ''
img: /medias/featureimages/20.webp
date:
summary: A32/T32常用指令
---
# 处理器架构
## ARM体系架构
### ARM体系架构（三）
#### 常用指令
**①数据传输**
>**概述**：主要用于在**立即数**、**寄存器**和**内存**之间传递数据，常用指令有`MOV`、`ADR`、`LDR`、`STR`、`PUSH`和`POP`等
{%list%}
ARM采用典型的Load/Store架构，运算主要在寄存器之间进行，内存数据需先装入寄存器再进行运算
{%endlist%}
>`MOV`主要用于**给寄存器赋值**，基本语法为`MOV Rd, Operand`，表示`Rd = Operand`

>`ADR`主要用于**给寄存器赋予某个标签对应的地址**，基本语法为`ADR Rd, label`，表示`Rd = &label`

>`LDR`主要用于**从内存中读取数据到寄存器**，基本语法为`LDR Rd, [Rn]`，表示`Rd = Memory[Rn]`

>`STR`主要用于**将寄存器中的数据写入内存**，基本语法为`STR Rd, [Rn]`，表示`Memory[Rn] = Rd`

>`PUSH`主要用于**将一个或多个寄存器的数据压入栈中**，基本语法为`PUSH {register_list}`

>`POP`主要用于**从栈中恢复一个或多个寄存器的数据**，基本语法为`POP {register_list}`
{%right%}
LDM/STM用于在连续内存与多个寄存器之间批量传送数据，并通过IA/IB/DA/DB指定地址变化方式
{%endright%}
>`LDM`主要用于**从连续内存中批量读取数据到多个寄存器**，基本语法为`LDM Rn{!}, {register_list}`

>`STM`主要用于**将多个寄存器的数据批量写入连续内存**，基本语法为`STM Rn{!}, {register_list}`

>`!`表示**基址回写**，即批量访存结束后，把**最终计算得到的地址**重新写回**基址寄存器**`Rn`

>`I/D`表示**地址递增/减**，`A/B`表示**访问后/前变化**，缺省采用`IA`即**先访问随后`Rn`递增**
{%warning%}
LDR和STR默认读写32位数据，可通过添加B/H指定数据宽度，LDR还可通过SB/SH指定符号扩展
{%endwarning%}
>`STRB/STRH r0, [r1]`表示把`r0`的**低**`8/16`位写入内存`Memory[r1]`

>`LDRB/LDRH r0, [r1]`表示从`r1`指向的**内存地址**中读取`8/16`位，并将其**零扩展**为`32`位后写入整个`r0`

>`LDRSB/LDRSH r0, [r1]`表示从`r1`指向的**内存地址**中读取`8/16`位，并将其**符号扩展**为`32`位后写入整个`r0`

>**零扩展**表示高位补`0`，**符号扩展**表示高位补**符号位**，`0xFF`对应扩展分别为`0x000000FF`和`0xFFFFFFFF`
{%wrong%}
上述指令主要操作核心寄存器R0-R15，CPSR和SPSR等特殊寄存器需要通过MRS/MSR访问
{%endwrong%}
```nasm
; 1.寄存器与地址
MOV R1, R0            ; R1 = R0
MOV R1, #0x10         ; R1 = 0x10
MVN R1, R0            ; R1 = ~R0
MOVW R1, #0x5678      ; R1低16位 = 0x5678，高16位清0
MOVT R1, #0x1234      ; R1高16位 = 0x1234，低16位保持不变
ADR R1, label         ; R1 = &label，取得label对应的地址

; 2.特殊寄存器
MRS R2, PSP           ; R2 = PSP
MSR PSP, R3           ; PSP = R3

; 3.读取内存
LDR R1, [R0]          ; 从R0指向的内存读取32位数据到R1
LDRB R1, [R0]         ; 读取8位数据，零扩展为32位后写入R1
LDRH R1, [R0]         ; 读取16位数据，零扩展为32位后写入R1
LDRSB R1, [R0]        ; 读取8位有符号数据，符号扩展为32位后写入R1
LDRSH R1, [R0]        ; 读取16位有符号数据，符号扩展为32位后写入R1
LDR R1, [R0, #4]      ; 从R0+4地址读取32位数据到R1，R0不变
LDR R1, [R0, #4]!     ; 先R0 = R0+4，再从新R0地址读取32位数据到R1
LDR R1, [R0], #4      ; 先从R0地址读取32位数据到R1，再R0 = R0+4

; 4.批量读取
LDMIA R0!, {R1-R4}    ; 从R0开始向高地址连续读取4个32位数据到R1-R4，结束后R0 = R0+16
LDMIB R0!, {R1-R4}    ; 从R0+4开始向高地址连续读取4个32位数据到R1-R4，结束后R0 = R0+16
LDMDA R0!, {R1-R4}    ; 向低地址方向读取连续数据到R1-R4，结束后R0 = R0-16
LDMDB R0!, {R1-R4}    ; 基址先向低地址移动再读取连续数据到R1-R4，结束后R0 = R0-16
POP {R0-R3, PC}       ; 从栈中恢复R0-R3和PC，语义上对应LDMIA SP!, {R0-R3, PC}

; 5.写入内存
STR R1, [R0]          ; 将R1的32位数据写入R0指向的内存
STRB R1, [R0]         ; 将R1低8位写入R0指向的内存
STRH R1, [R0]         ; 将R1低16位写入R0指向的内存
STR R1, [R0, #4]      ; 将R1写入R0+4地址，R0不变
STR R1, [R0, #4]!     ; 先R0 = R0+4，再将R1写入新R0地址
STR R1, [R0], #4      ; 先将R1写入R0地址，再R0 = R0+4

; 6.批量写入
STMIA R0!, {R1-R4}    ; 从R0开始向高地址连续写入R1-R4，结束后R0 = R0+16
STMIB R0!, {R1-R4}    ; 从R0+4开始向高地址连续写入R1-R4，结束后R0 = R0+16
STMDA R0!, {R1-R4}    ; 向低地址方向连续写入R1-R4，结束后R0 = R0-16
STMDB R0!, {R1-R4}    ; 基址先向低地址移动再连续写入R1-R4，结束后R0 = R0-16
PUSH {R0-R3, LR}      ; 将R0-R3和LR压入栈，语义上对应STMDB SP!, {R0-R3, LR}
```
**②数据运算**
>**概述**：主要用于对**寄存器中的数据**进行**算术**、**逻辑**及**移位**处理，常用指令有`ADD`、`SUB`、`MUL`、`AND`和`LSL`等
{%list%}
ARM数据运算通常以寄存器或立即数为操作数，并可将移位与算术或逻辑运算组合执行
{%endlist%}
>`ADD`表示**加法运算**，基本语法为`ADD Rd, Rn, Operand`，表示`Rd = Rn + Operand`

>`SUB`表示**减法运算**，基本语法为`SUB Rd, Rn, Operand`，表示`Rd = Rn - Operand`

>`MUL`表示**乘法运算**，基本语法为`MUL Rd, Rn, Rm`，表示`Rd = Rn × Rm`，只保留乘积的低`32`位

>`SDIV/UDIV`表示**有符号/无符号整数除法**，基本语法为`SDIV/UDIV Rd, Rn, Rm`，表示`Rd = Rn ÷ Rm`

>`AND`表示**按位与运算**，基本语法为`AND Rd, Rn, Operand`，表示`Rd = Rn & Operand`

>`ORR`表示**按位或运算**，基本语法为`ORR Rd, Rn, Operand`，表示`Rd = Rn | Operand`

>`EOR`表示**按位异或运算**，基本语法为`EOR Rd, Rn, Operand`，表示`Rd = Rn ^ Operand`

>`BIC`表示**按位清除指定比特**，基本语法为`BIC Rd, Rn, Operand`，表示`Rd = Rn & ~Operand`
{%right%}
移位与旋转指令常用于乘除2的幂、位操作和地址计算，也可与其他指令组合使用
{%endright%}
>`LSL`表示**逻辑左移**，基本语法为`LSL Rd, Rn, Operand`，表示`Rd = Rn << Operand`，低位补`0`

>`LSR`表示**逻辑右移**，基本语法为`LSR Rd, Rn, Operand`，表示`Rd = Rn >> Operand`，高位补`0`

>`ASR`表示**算术右移**，基本语法为`ASR Rd, Rn, Operand`，右移时**高位补符号位**

>`ROR`表示**循环右移**，基本语法为`ROR Rd, Rn, Operand`，**移出的低位重新进入高位**

>`ADD R0, R1, R2, LSL #2`表示`R0 = R1 + (R2 << 2)`

{%warning%}
ADD/SUB/MUL的普通形式只保留32位运算结果，更宽的整数运算需要配合ADC/SBC或长乘法指令
{%endwarning%}
>`ADC`表示**带进位加法**，基本语法为`ADC Rd, Rn, Operand`，表示`Rd = Rn + Operand + C`

>`SBC`表示**带借位减法**，基本语法为`SBC Rd, Rn, Operand`，表示`Rd = Rn - Operand - (1-C)`

>`UMULL`表示**无符号长乘法**，基本语法为`UMULL RdLo, RdHi, Rn, Rm`，表示`{RdHi, RdLo} = Rn × Rm`

>`SMULL`表示**有符号长乘法**，基本语法为`SMULL RdLo, RdHi, Rn, Rm`，表示`{RdHi, RdLo} = Rn × Rm`
{%wrong%}
上述指令都只会改变目标寄存器，如果需要更新N/Z/C/V条件标志还需要添加S后缀
{%endwrong%}
**③比较测试**
>**概述**：主要用于**比较或测试数据**并更新`N/Z/C/V`等条件标志位，常用指令有`CMP`、`CMN`、`TST`和`TEQ`
{%list%}
比较测试指令通常不保存运算结果，只会更新条件标志位，供后续条件执行和分支判断使用
{%endlist%}
>`CMP`用于**比较两个数的大小**，基本语法为`CMP Rn, Operand`，内部执行`Rn - Operand`并更新条件标志

>`CMN`用于**比较负值**，基本语法为`CMN Rn, Operand`，内部执行`Rn + Operand`并更新条件标志

>`TST`用于**按位测试**，基本语法为`TST Rn, Operand`，内部执行`Rn & Operand`并更新条件标志

>`TEQ`用于**按位相等测试**，基本语法为`TEQ Rn, Operand`，内部执行`Rn ^ Operand`并更新条件标志
{%right%}
条件标志位负责记录运算结果状态，条件码则根据这些状态决定某条指令是否执行
{%endright%}
>`N`表示结果的**符号状态**，**结果最高位**为`1`时置位，即`32`位结果的`bit31`为`1`时`N = 1`

>`Z`表示结果的**零状态**，当运算结果**全部**为`0`时置位，即结果为`0`时`Z = 1`

>`C`表示**进位/无借位状态**，当**加法产生最高位进位**或者**减法未发生借位时**`Z = 1`

>`V`表示**有符号溢出状态**，当**有符号运算结果超出当前位宽可表示范围**时`V = 1`
{%warning%}
条件标志仅在特定指令执行时更新，并保持到下一次被改写，使用条件码前应确认其来源
{%endwarning%}
```nasm
; 1.数值比较
CMP R0, R1            ; 计算R0-R1并更新条件标志，不保存结果
CMP R0, #10           ; 将R0与10比较，内部计算R0-10
CMN R0, R1            ; 计算R0+R1并更新条件标志，不保存结果
CMN R0, #1            ; 计算R0+1并更新条件标志

; 2.位状态测试
TST R0, #0x01         ; 计算R0 & 0x01，测试bit0是否为1
TST R0, R1            ; 计算R0 & R1，并根据结果更新条件标志
TEQ R0, R1            ; 计算R0 ^ R1，相等时结果为0并使Z=1
TEQ R0, #0xFF         ; 计算R0 ^ 0xFF，并根据结果更新条件标志

; 3.条件标志
CMP R0, R1            ; R0=R1时Z=1，R0-R1结果最高位为1时N=1
CMP R0, #0            ; 常用于判断R0是否等于0、是否为负数
TST R0, #0x08         ; bit3为0时结果为0，Z=1
TEQ R0, R1            ; R0与R1完全相同时异或结果为0，Z=1

; 4.条件码与标志判断
BEQ label             ; Equal，相等，Z=1时跳转
BNE label             ; Not Equal，不相等，Z=0时跳转
BCS label             ; Carry Set，无符号大于等于，C=1时跳转
BCC label             ; Carry Clear，无符号小于，C=0时跳转
BHI label             ; Higher，无符号大于，C=1且Z=0时跳转
BLS label             ; Lower or Same，无符号小于等于，C=0或Z=1时跳转
BMI label             ; Minus，结果为负，N=1时跳转
BPL label             ; Plus，结果非负，N=0时跳转
BVS label             ; Overflow Set，发生有符号溢出，V=1时跳转
BVC label             ; Overflow Clear，未发生有符号溢出，V=0时跳转
BGE label             ; Greater or Equal，有符号大于等于，N=V时跳转
BLT label             ; Less Than，有符号小于，N≠V时跳转
BGT label             ; Greater Than，有符号大于，Z=0且N=V时跳转
BLE label             ; Less or Equal，有符号小于等于，Z=1或N≠V时跳转
```
**④分支跳转**
>**概述**：主要用于**改变程序执行流**，实现**条件判断**、**循环**及**函数调用**，常用指令有`B`、`BL`、`BX`和`BLX`
{%list%}
B表示分支跳转，L表示保存返回地址到LR用于支持返回，X表示支持A32/T32指令状态切换
{%endlist%}
>`B`的基本语法为`B label`，表示跳转到`label`处继续执行

>`BL`的基本语法为`BL label`，在跳转到`label`的同时将**返回地址**保存到`LR`

>`BX`的基本语法为`BX Rm`，表示跳转到`Rm`**保存的地址**，并根据**目标地址**决定使用`A32/T32`状态

>`BLX`的基本语法为`BLX Rm/label`，在跳转并支持`A32/T32`状态切换的同时，将**返回地址**保存到`LR`
{%right%}
跳转分为相对跳转和绝对跳转，前者通过PC + offset计算目标地址，后者使用完整地址目标
{%endright%}
>`B/BL/BLX label`的机器码通常保存的不是`label`的**完整地址**，而是**目标相对当前`PC`的偏移量**
{%warning%}
相对跳转不依赖代码的绝对位置，但跳转范围受偏移量编码限制，目标过远时需要借助中转跳转等方式
{%endwarning%}
{%wrong%}
绝对跳转依赖完整目标地址，若代码重定位失败会导致跳转到错误或非法地址，引发异常甚至程序崩溃
{%endwrong%}
```nasm
; 1.直接跳转
B label               ; 无条件跳转到label继续执行
B loop                ; 跳转到loop，常用于循环
B end                 ; 跳转到end，常用于跳过某段代码

; 2.条件跳转
BEQ label             ; Z=1时跳转，表示相等
BNE label             ; Z=0时跳转，表示不相等
BGT label             ; 有符号大于时跳转，Z=0且N=V
BLT label             ; 有符号小于时跳转，N≠V
BGE label             ; 有符号大于等于时跳转，N=V
BLE label             ; 有符号小于等于时跳转，Z=1或N≠V
BHI label             ; 无符号大于时跳转，C=1且Z=0
BLO label             ; 无符号小于时跳转，C=0

; 3.函数调用
BL function           ; 跳转到function，同时将返回地址保存到LR
BL printf             ; 调用已知函数printf，返回地址保存到LR
BX LR                 ; 跳转到LR保存的返回地址，常用于函数返回

; 4.寄存器间接跳转
BX R0                 ; 跳转到R0保存的地址，并根据目标地址确定A32/T32状态
BX LR                 ; 跳转到LR保存的地址，常用于函数返回
BLX R0                ; 调用R0指向的函数，返回地址保存到LR并支持状态切换
BLX R3                ; 调用R3保存地址对应的函数，常用于函数指针调用

; 5.跨状态调用
BLX function          ; 相对调用function，保存返回地址并切换A32/T32状态，需架构支持
BLX R0                ; 间接调用R0中的目标，保存返回地址并按目标地址切换状态

; 6.相对与间接跳转
B label               ; PC相对跳转，机器码保存目标相对当前PC的偏移量
BL function           ; PC相对函数调用，同时将返回地址保存到LR
BLX function          ; PC相对调用并支持状态切换，需相应A32/T32架构支持
BX R0                 ; 寄存器间接跳转，完整目标地址由R0提供
BLX R0                ; 寄存器间接调用，目标地址由R0提供并保存返回地址

; 7.典型循环
loop:
SUBS R0, R0, #1       ; R0 = R0-1，同时更新条件标志
BNE loop              ; Z=0时返回loop，直到R0减为0

; 8.典型条件判断
CMP R0, R1            ; 比较R0和R1，更新条件标志
BEQ equal             ; R0=R1时跳转到equal
BGT greater           ; R0>R1时按有符号比较跳转到greater
BLT less              ; R0<R1时按有符号比较跳转到less

; 9.典型函数调用与返回
PUSH {R4, LR}         ; 保存R4和当前函数返回地址
BL function           ; 调用function，新返回地址写入LR
POP {R4, LR}          ; 恢复R4和原函数返回地址
BX LR                 ; 跳转到LR，返回上一级调用者
```
**⑤系统指令**
>**概述**：主要用于**控制异常中断**、**低功耗等待**及**同步操作**，常用指令有`SVC`、`WFI`和`DMB`等
{%list%}
系统指令主要用于处理器运行状态和系统级行为控制，其可用性和权限要求与具体ARM架构及Profile有关
{%endlist%}
>`SVC`用于**软件触发异常**，基本语法为`SVC #imm`，用于主动进入`SVC`**异常处理程序**，常用于**系统调用**

>`CPSID/CPSIE`用于**禁止/使能指定异常**，常见语法为`CPSID i`，用于**禁止/使能**`IRQ`响应

>`WFI`基本语法为`WFI`，用于让处理器**停止执行普通指令**，直到**符合条件的中断或异常**唤醒处理器

>`WFE`和`WFI`类似，但是等待的是**事件**，事件可由`SEV/SEVL`等机制产生
{%right%}
屏障用于约束处理器的乱序和缓冲行为，保证多核、内存及外设操作按预期顺序生效
{%endright%}
>`DMB`表示**数据内存屏障**，用于约束屏障前后**内存访问的顺序**，保证其按照规定顺序被观察到

>`DSB`表示**数据同步屏障**，用于**等待屏障前的相关操作完成**，再允许后续指令继续执行

>`ISB`表示**指令同步屏障**，表示**清空当前流水线中的后续指令**，需要**重新取指、译码和执行**
{%warning%}
屏障会限制处理器的乱序执行和并行优化，过度使用会降低性能，应只在确有同步需求时使用
{%endwarning%}
{%wrong%}
部分系统指令只能在特权级下执行，权限不足时可能触发异常或执行失败
{%endwrong%}
```nasm
; 1.软件异常
SVC #0                 ; 触发SVC异常，立即数0作为软件调用标识
SVC #1                 ; 触发SVC异常，立即数1作为软件调用标识

; 2.异常中断控制
CPSID i                ; 禁止IRQ响应，常用于进入需要避免中断干扰的临界区
CPSIE i                ; 使能IRQ响应，常用于退出临界区并恢复中断

; 3.等待与唤醒
WFI                    ; 停止普通指令执行，等待符合条件的中断或异常唤醒
WFE                    ; 进入事件等待状态，等待事件到来后继续执行
SEV                    ; 产生事件，可用于唤醒处于WFE等待状态的处理器

; 4.内存与执行屏障
DMB SY                 ; 约束屏障前后的内存访问顺序，常用于多核共享数据和外设访问排序
DSB SY                 ; 等待屏障前相关操作完成，常用于外设配置完成后再进行后续关键操作
ISB SY                 ; 刷新后续指令流水线，使后续指令按最新处理器执行环境重新取指执行

; 5.DMB典型场景：共享数据发布
STR R1, [R0]           ; 先写共享数据
DMB SY                 ; 保证共享数据写入先于后续状态标志写入被观察
STR R2, [R3]           ; 再写状态标志，避免其他处理器先看到标志而读到旧数据

; 6.DSB典型场景：进入等待前完成操作
STR R1, [R0]           ; 先完成外设或内存相关配置
DSB SY                 ; 等待此前相关操作达到规定的完成状态
WFI                    ; 确认操作完成后再进入中断等待状态

; 7.ISB典型场景：执行环境发生变化
DSB SY                 ; 先确保此前影响处理器状态的相关操作已经完成
ISB SY                 ; 清空后续流水线，使之后指令按新的执行环境重新取指执行

; 8.事件等待与通知
WFE                    ; 当前处理器进入事件等待状态
SEV                    ; 产生事件，通知等待事件的处理器继续执行
```