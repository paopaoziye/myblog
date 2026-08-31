---
title: ARM体系架构（四）
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
summary: M-pofile的异常处理机制
---
# 处理器架构
## ARM体系架构
### ARM体系架构（四）
#### 1.异常与中断
**①简介**
>**概述**：使处理器暂时改变**正常执行流**，进入**异常处理程序**并在处理完成后再**恢复原执行流**的事件，统称为异常
{%list%}
异常可分为同步异常和异步异常，前者由当前指令直接导致如系统调用，后者与当前指令没有直接因果关系如中断
{%endlist%}
>**同步异常**通常在**当前线程/进程上下文**中处理，`IRQ`等**异步硬件异常**通常在**中断上下文**中处理
{%right%}
异常处理程序本质上也是一段执行代码，其进入和返回受架构规则控制，不只是普通ABI调用
{%endright%}
>异常处理程序内部仍然可以**调用普通函数**，但是要遵循`AAPCS`
{%warning%}
异常处理程序需要明确当前执行环境、特权状态和所使用的栈，避免错误访问受限资源
{%endwarning%}
>此外，异常处理期间可能发生**更高优先级异常**，需要考虑**共享数据**、**临界区**和**可重入性**
{%wrong%}
硬中断上下文不能执行可能导致当前执行流睡眠或等待调度的操作，因为其不具备普通任务的阻塞调度语义
{%endwrong%}

**②异常入口**
>**概述**：异常入口是**异常满足响应条件**后，处理器根据**异常向量表**及**架构规则**进入**异常处理程序**的过程
{%list%}
程序通常在编译链接阶段建立异常向量表，将不同异常对应的入口地址或入口代码组织到对应表项中
{%endlist%}
>**异常向量表**的位置由**具体架构和处理器实现**决定，可能采用**架构规定的固定位置**，也可采用**可编程基址寄存器**
{%right%}
不同Profile和执行状态的异常向量表组织方式不同，有的保存处理程序地址，有的直接包含入口指令
{%endright%}
{%warning%}
进入异常处理程序前需要正确保存打断的执行上下文，部分由硬件完成，部分由软件完成
{%endwarning%}
>执行上下文即能**描述处理器当前程序运行状态**所需的信息，通常涉及**通用寄存器**、`PC`、`SP`和**处理器状态**等

**③异常返回**
>**概述**：异常返回是按照架构规则恢复**异常发生前必要的执行上下文**，并重新进入**原执行流**的过程
{%list%}
异常返回通常需要恢复必要的程序执行现场和处理器状态，具体内容和恢复方式由架构及异常类型决定
{%endlist%}
{%right%}
异常返回后可能重新执行相关指令，也可能从后续指令继续执行，具体取决于异常类型和架构规则
{%endright%}
{%warning%}
中断处理程序应按照具体中断源的规则及时处理或撤销中断请求，否则返回后可能再次触发中断
{%endwarning%}
#### 2.M-profile异常响应
**①NVIC**
>**概述**：也称为**嵌套向量中断控制器**，用于管理**异常/中断**的**使能**、**挂起**、**优先级**和**抢占**等
{%list%}
NVIC主要记录中断的Enabled、Pending和Active状态，分别用于描述是否允许响应、是否等待处理和是否正在处理
{%endlist%}
{%right%}
NVIC支持通过优先级分组将中断优先级分为抢占优先级和子优先级，优先级数值越小，逻辑优先级越高
{%endright%}
>当多个中断同时等待处理时，**抢占优先级更高**的先执行；抢占优先级相同时，再由**子优先级**决定先后

>`NVIC`支持**中断嵌套**，即**高抢占优先级中断**可以打断**低抢占优先级中断**从而被`CPU`响应

>如果两个中断的**抢占优先级**和**子优先级**均相等，则`CPU`优先执行**异常编号更小**的异常
{%warning%}
Disable一个中断并不代表这个中断不会产生，也不代表会清除它已经存在的Pending状态，也不会打断其处理流程
{%endwarning%}

**②运行模式**
>**概述**：`M-profile`主要有两个**运行模式**`Thread mode`和`Handler mode`，分别用于**普通代码**和**异常处理程序**
{%list%}
M-profile处理器复位后通常处于特权级Thread mode并使用MSP，发生异常后进入Handler mode
{%endlist%}
>`Thread mode`可以通过`CONTROL.nPRIV`选择**特权级**还是**非特权级别**，`Handler mode`始终处于**特权级**

>`Thread mode`可以通过`CONTROL.SPSEL`选择`MSP`还是`PSP`，`Handler mode`只能使用`MSP`
{%right%}
Armv8-M等新架构还支持TrustZone，可将系统划分为Secure和Non-secure安全域，实现资源隔离
{%endright%}
>这又是一个新的维度，如有`Secure Thread mode`，也有`Non-secure Thread mode`等
{%warning%}
特权级代码通过修改CONTROL.nPRIV进入非特权级，非特权级代码只能通过异常进入特权Handler mode
{%endwarning%}

**③异常响应流程**
>**概述**：中断被响应后，`CPU`**自动保存上下文**，并跳转到对应的**中断处理程序**运行，异常返回时**自动恢复上下文**
{%list%}
CPU开始响应异常时，会将一组寄存器依次压入异常发生前正在使用的栈中，也称为基本异常栈帧
{%endlist%}
>具体为`R0-R3`、`R12`、`LR`、`PC`和`xPSR`，也就是在`caller-saved`规定的基础上新增了`PC`和`xPSR`

>随后`CPU`将`PC`修改为**异常处理程序地址**，将`LR`修改为**异常返回值**`EXC_RETURN`
{%right%}
EXC_RETURN用于指示返回时使用的栈指针和处理器模式，通常表示为0xFFFFFFFx
{%endright%}
>最常见的值为`0xFFFFFFFD`，表示异常返回时从`PSP`弹出**异常栈帧**，并切换到`Thread Mode`使用`PSP`
{%warning%}
Thread Mode的特权级由CONTROL.nPRIV决定，但是进入Handler Mode后会强制变为特权级
{%endwarning%}
```c
/* 任务函数 */
void thread_task(void)
{
    while (1)
    {
        // 1. 假设当前运行状态为：
        //
        //    Mode      = Thread
        //    Privilege = Unprivileged
        //    SP        = PSP
        //
        //    CONTROL.nPRIV = 1   // Thread mode 为非特权级
        //    CONTROL.SPSEL = 1   // Thread mode 使用 PSP
        //
        int x = calculate();

        // 2. 此时 UART 中断发生，NVIC 将对应中断置为 Pending
        //
        // 3. 当 CPU 判断该中断满足响应条件后，开始异常进入：
        //
        //    - 将 R0-R3、R12、LR、PC、xPSR
        //      自动保存到异常发生前正在使用的 PSP
        //
        //    - R4-R11 不属于硬件自动异常栈帧，
        //      需要时由软件/编译器负责保存
        //
        //    - 从 Thread mode 切换到 Handler mode
        //
        //    - Handler mode 开始使用 MSP
        //
        //    - Handler mode 始终是 Privileged，
        //      因此 CPU 此时获得特权执行权限
        //
        //    - CONTROL.nPRIV 仍保持为 1，并没有被清零
        //      只是 nPRIV 只影响 Thread mode，
        //      在 Handler mode 下不会使处理器变成非特权级
        //
        //    - IPSR 更新为当前 UART 中断对应的 Exception Number
        //
        //    - LR 写入 EXC_RETURN
        //      本例为 0xFFFFFFFD：
        //      返回 Thread mode + 使用 PSP + 基本异常栈帧
        //
        //      注意：
        //      EXC_RETURN 并不记录“返回 Privileged 还是 Unprivileged”
        //      Thread mode 的特权级仍由 CONTROL.nPRIV 决定
        //
        //    - 从向量表取得 UART_IRQHandler 地址并开始执行
    }
}


/* 中断服务程序 */
void UART_IRQHandler(void)
{
    // 4. 执行到这里时：
    //
    //    Mode      = Handler
    //    Privilege = Privileged
    //    SP        = MSP
    //
    //    CONTROL.nPRIV = 1
    //
    //    虽然 nPRIV 仍然为 1，
    //    但 Handler mode 天生就是 Privileged，
    //    因此这里仍具有特权级权限
    //
    //    被中断线程的基本异常栈帧仍保存在 PSP 中
    //
    //    LR 中保存 EXC_RETURN，
    //    本例为 0xFFFFFFFD

    // 5. 处理中断
    uint8_t data = UART->DR;

    // 6. ISR 结束后，编译器生成异常返回代码，
    //    通常最终通过 BX LR 将 EXC_RETURN 装入 PC
    //
    //    CPU 识别出 EXC_RETURN 后：
    //
    //    - 根据 EXC_RETURN 判断返回 Thread mode
    //
    //    - 根据 EXC_RETURN 选择 PSP
    //
    //    - 从 PSP 自动恢复 R0-R3、R12、LR、PC、xPSR
    //
    //    - 从 Handler mode 返回 Thread mode
    //
    //    - CONTROL.nPRIV 仍然保持为 1
    //
    //    - 一旦重新进入 Thread mode，
    //      CONTROL.nPRIV 再次生效
    //
    //    - 因此：
    //          Mode      = Thread
    //          Privilege = Unprivileged
    //          SP        = PSP
    //
    //    - 从被中断的位置继续执行
}
```
**④尾链机制**
>**概述**：异常`A`返回时，如果有另一个**挂起异常**`B`满足**响应条件**，则直接把**控制权**转给新的`B`
{%list%}
尾链过程中不恢复再保存线程现场，而是保留原异常栈帧，待连续异常处理结束后再恢复
{%endlist%}
>**无尾链**：**异常栈帧**压栈 `->` 响应中断`A` `->` 恢复**异常栈帧** `->` **异常栈帧**压栈 `->` 响应中断`B` `->` 恢复**异常栈帧**

>**有尾链**：**异常栈帧**压栈 `->` 响应中断`A` `->` 响应中断`B` `->` 恢复**异常栈帧**
{%right%}
尾链机制可通过省去连续异常之间重复的出栈与压栈操作，从而降低中断延迟和处理开销
{%endright%}
{%warning%}
尾链只在异常返回阶段发生，前提是返回时已有其他挂起异常满足响应条件
{%endwarning%}
**⑤迟到异常**
>**概述**：异常`A`**进入但尚未执行**时，如果有另一个**更高优先级**的异常`B`后到达，改为**优先执行**`B`
{%list%}
无论最终去处理A还是B，他们打断的都是同一个上下文，进入Handler之前的工作都可以复用
{%endlist%}
>**无该机制**：**线程异常栈帧**压栈 `->` 响应中断`A` `->` `A`**异常栈帧**压栈 `->` 响应中断`B` `->` 恢复`A`**异常栈帧** `->` 继续响应中断`A` `->` 恢复**线程异常栈帧**

>**有该机制**：**线程异常栈帧**压栈（期间`B`到达） `->` 直接响应中断`B` `->` 响应中断`A` `->` 恢复**线程异常栈帧**
{%right%}
类似地，该机制也可以省去连续异常之间重复的出栈与压栈操作，并且在继续响应A的时候触发了尾链机制
{%endright%}
{%warning%}
迟到异常只在异常入口阶段发生，且后来到达的异常必须具有更高优先级
{%endwarning%}
#### 3.M-profile系统异常
**①简介**
>**概述**：系统异常是由**架构本身定义**的异常，用于处理**处理器自身及系统运行过程中**产生的各类系统级事件
{%list%}
ARM架构下编号为1-15的异常为系统异常，Armv8-M下的系统异常详细如下所示
{%endlist%}
>`1.Reset`：用于**系统复位**，即**系统启动**、**时钟和存储等硬件的初始化**、**初始化**`.data`和`.bss`最后进入`main()`

>`2.NMI`：用于处理**不可屏蔽的高优先级事件**，通常用于**时钟故障**和**电源异常**等**关键硬件故障**等

>`3.HardFault`：用于处理**严重处理器故障**以及其他`Fault`无法正常处理时产生的**故障升级**

>`4.MemManage`：用于处理**内存保护和访问权限错误**，如违反`MPU`权限或**执行不可执行区域**中的代码

>`5.BusFault`：用于处理**总线访问故障**，即**取指**、**数据访问**或**存储器传输过程**中发生的总线错误

>`6.UsageFault`：用于处理**指令执行和处理器使用错误**，如**未定义指令**、**非法状态**和**非对齐访问**等错误

>`7.SecureFault`：用于处理`TrustZone`中的**安全属性**和**安全访问违规**，仅存在于`Armv8-M`等架构

>`Exception 8-10、13`：**保留异常号**，当前架构不定义具体异常用途

>`11.SVCall`：用于**软件主动请求系统服务**，常用于普通线程进入特权`Handler`执行**操作系统内核功能**

>`12.DebugMonitor`：用于处理**调试事件**，使断点、观察点等调试事件能够通过异常处理程序进行软件调试

>`14.PendSV`：用于执行**可挂起的系统服务请求**，通常设置为**最低优先级**并用于`RTOS`的**任务上下文切换**

>`15.SysTick`：用于处理`SysTick`产生的**周期性系统节拍**，常用于**系统计时**、**任务延时**和**任务调度**

{%right%}
SVC、PendSV和SysTick可以构成一个极简RTOS的硬件骨架，分别用于陷入内核、任务调度和任务切换
{%endright%}
{%warning%}
MemManage、BusFault、UsageFault、DebugMonitor和SecureFault并非所有M-profile都实现
{%endwarning%}

**②Fault体系**
>**概述**：`M-profile`的完整`Fault`体系包括`MemManage`、`BusFault`、`UsageFault`和`HardFault`
{%list%}
MemManage、BusFault和UsageFault都是独立的可配置异常，但是HardFault始终使能且具有固定的高优先级
{%endlist%}
{%right%}
如果MemManage、BusFault、UsageFault对应的故障发生但对应的Fault Handler不允许执行就会升级为HardFault
{%endright%}
>当一个普通`Fault`升级为`HardFault`时，`HFSR.FORCED = 1`会被置位，并通过`CFSR`查询具体**故障类型与原因**

{%warning%}
故障升级原因通常为对应Fault没有使能、对应Fault处理函数中再次产生同类Fault或Fault优先级不够高
{%endwarning%}
>`Fault`优先级不够高主要体现在其余**异常处理函数**触发了对应`Fault`但是其无法抢占触发`Fault`的异常

**③系统控制寄存器**
>**概述**：也称为`SCB`，用于处理器自身的**异常**、**向量表**、**系统行为**、**低功耗**以及`Fault`状态
{%list%}
部分SCB为只读能力描述寄存器，主要供系统软件、调试器或运行时检测处理器能力使用
{%endlist%}
>`CPUID`：用于标识**处理器身份和版本**，记录**实现厂商**、**架构版本**、**处理器型号**、`Variant`和`Revision`等信息

>`ID_PFR`：用于描述处理器支持的**程序员模型**和**处理器功能特性**，如**异常模型**、**执行状态**及**部分架构能力**

>`ID_DFR`：用于描述处理器支持的**调试功能**和**调试架构能力**，供调试器判断可使用哪些**硬件调试机制**

>`ID_AFR`：用于描述处理器实现的**辅助架构特性**，通常用于表示**未归入其他`ID`寄存器的实现相关能力**

>`ID_MMFR`：用于描述处理器支持的**内存模型**和**内存管理能力**，如`MPU`、**内存属性**及**相关内存系统特性**

>`ID_ISAR`：用于描述处理器支持的**指令集架构特性**，如是否实现某些**算术**、**位操作**、**同步**或**其他可选指令**
{%right%}
部分SCB用于控制处理器如何响应异常、如何运行以及如何访问部分系统资源，如下所示
{%endright%}
>`ICSR`：主要管理**系统异常调度状态**，如**当前正在执行的异常**、**最高优先级挂起异常**和`PendSV`**的挂起状态**等

>`VTOR`：主要管理**异常向量表基地址**，使处理器能够根据`Exception Number`找到对应的**异常处理程序**

>`AIRCR`：主要管理**异常优先级分组**和**系统复位**，如**划分抢占优先级与子优先级**和**请求系统复位**等

>`SCR`：主要管理**睡眠和低功耗行为**，如**深度睡眠**、**异常返回后继续睡眠**和**挂起事件唤醒**等

>`CCR`：主要用于配置处理器的**运行行为**和**异常检查规则**，如**除零陷阱**、**非对齐访问检查**和**异常栈对齐**等

>`SHPR`：主要用于设置**系统异常优先级**，如`SVCall`、`PendSV`、`SysTick`及部分`Fault`

>`SHCSR`：主要用于控制并记录**系统异常的使能和运行状态**，如`SVCall`、`PendSV`、`SysTick`及部分`Fault`

>`CPACR`：用于控制**协处理器**或**可选执行单元**的访问权限，典型用途是配置`FPU`相关协处理器的**访问权限**
{%warning%}
部分SCB用于Fault发生时的状态信息，可用于定位故障类型、触发原因和相关访问地址
{%endwarning%}
>`CFSR`：主要记录**可配置`Fault`的具体故障原因**，包括`MemManage`、`BusFault`和`UsageFault`的状态信息

>`HFSR`：主要记录`HardFault`的**产生原因**，用于判断是否由**其他`Fault`升级**或**其他严重故障**导致

>`DFSR`：用于记录**调试异常的触发原因**，如**断点**、**观察点**、**向量捕获**以及**外部调试请求**等

>`MMFAR`：主要记录发生`MemManage Fault`时的**故障访问地址**

>`BFAR`：主要记录发生`BusFault`时的**故障访问地址**

>`AFSR`：用于记录**实现定义的辅助`Fault`信息**，由具体处理器或`SoC`实现提供**额外的故障诊断信息**

