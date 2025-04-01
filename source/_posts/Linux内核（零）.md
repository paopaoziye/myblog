---
title: Linux内核（零）
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
  - Linux内核
categories: Linux
keywords: 文章关键词
updated: ''
img: /medias/featureimages/29.webp
date:
summary: 内核启动
---
# Linux内核
## Linux内核启动
### 1.u-boot启动流程
#### 1.1引言
**①设备上电**
>**概述**：设备上电后会自动运行**芯片内部**`ROM`，**初始化硬件**并根据**外部引脚**判断从哪个`flash`中读取数据
{%list%}
芯片内部ROM程序初始化硬件包含大部分总线资源、时钟、MMU和缓存等
{%endlist%}
{%right%}
找到flash后根据一定的规则读取u-boot镜像头，根据镜像头配置好时钟和各种外设并跳转到u-boot的入口地址
{%endright%}
**①`_start`**
>**概述**：由`u-boot`的**链接脚本**可知其**入口地址**为`_start`，定义在`arch/arm/lib/vectors.S`中，代码如下所示
{%list%}
以ARM架构为例，其链接脚本定义在arch/arm/cpu/u-boot.lds中
{%endlist%}
{%right%}
u-boot启动后将自动跳转到reset函数，并最终跳转到了同文件下的save_boot_params_ret函数
{%endright%}
>均定义在`arch/arm/cpu/armv7/start.S`中
```c
#include <config.h>
#include <asm/psci.h>

// 指示输出可执行文件为 elf 32位 小端格式 arm指令
OUTPUT_FORMAT("elf32-littlearm", "elf32-littlearm", "elf32-littlearm")
OUTPUT_ARCH(arm)
// 指示输出可执行文件起始地址为_start
ENTRY(_start)
/* 其余部分略 */
```
```nasm
_start:
; 其余部分略
  .globl  _reset
  .globl  _undefined_instruction
  .globl  _software_interrupt
  .globl  _prefetch_abort
  .globl  _data_abort
  .globl  _not_used
  .globl  _irq
  .globl  _fiq
```
```nasm
reset:
  b  save_boot_params
```
```nasm
ENTRY(save_boot_params)
  b   save_boot_params_ret 
ENDPROC(save_boot_params)
```
**③`save_boot_params_ret`**
>**概述**：进入`SVC`模式、**屏蔽中断**、设置**中断向量表基地址**并初始化`CPU`和**栈指针**，最后跳转到`_main`
{%list%}
cpu_init_cp15主要工作为禁用并清空MMU、TLBs和cache，cpu_init_crit主要工作为设置sp寄存器和r9寄存器
{%endlist%}
{%right%}
r9寄存器用于保存全局数据结构global_data的指针，该结构几乎包含了u-boot中用到的所有全局变量
{%endright%}
>如下所示，`gd`使用`DECLARE_GLOBAL_DATA_PTR`声明以指定占用`r9`**寄存器**
{%warning%}
此时CPU直接使用物理地址，且为了防止CPU从cache预取数据导致异常，所以需要禁用MMU、TLBs和cache
{%endwarning%}
```c
#define DECLARE_GLOBAL_DATA_PTR              register volatile gd_t *gd asm ("r9")
```
```nasm
save_boot_params_ret:
;重定位修正和地址扩展略 

;进入SVC模式，屏蔽中断和快中断
  mrs  r0, cpsr
  and  r1, r0, #0x1f      @ mask mode bits
  teq  r1, #0x1a          @ test for HYP mode
  bicne  r0, r0, #0x1f    @ clear all mode bits
  orrne  r0, r0, #0x13    @ set SVC mode
  orr  r0, r0, #0xc0      @ disable FIQ and IRQ
  msr  cpsr,r0
;设置中断向量表的基地址为_start函数的地址
#if !CONFIG_IS_ENABLED(SYS_NO_VECTOR_TABLE)
  mrc  p15, 0, r0, c1, c0, 0  @ Read CP15 SCTLR Register
  bic  r0, #CR_V              @ V = 0
  mcr  p15, 0, r0, c1, c0, 0  @ Write CP15 SCTLR Register
#ifdef CONFIG_HAS_VBAR
  ldr  r0, =_start
  mcr  p15, 0, r0, c12, c0, 0  @Set VBAR
#endif
#endif
;禁用MMU和缓存
#if !CONFIG_IS_ENABLED(SKIP_LOWLEVEL_INIT)
#ifdef CONFIG_CPU_V7A
  bl  cpu_init_cp15
#endif
;设置sp寄存器和r9寄存器
#if !CONFIG_IS_ENABLED(SKIP_LOWLEVEL_INIT_ONLY)
  bl  cpu_init_crit
#endif
#endif
  bl  _main
```

#### 1.2_main
**①`board_init_f`**
>**概述**：重新设置`sp`和`r9`寄存器，为早期的**栈段**、`global_data`和`malloc`划分区域，进而运行`board_init_f`
{%list%}
board_init_f初始化gd结构体某些成员并运行initcall_run_list依次执行函数指针数组init_sequence[]里面的函数
{%endlist%}
{%right%}
init_sequence[]中的函数执行硬件初始化、软件模块设置和内存分配等工作，最后运行setup_reloc重定位gd结构体
{%endright%}
>如**串口初始化**、将**环境变量**的地址赋予`gd->env_addr`以及设置`u-boot`**重定位地址**`gd->relocaddr`等

>`board_init_f`在`RAM`**顶端**依次为`TLB`页表、`u-boot`、`malloc`、`bd`结构体、`gd`结构体和**设备树**预留区域
```c
ENTRY(_main)
#if CONFIG_IS_ENABLED(ARCH_VERY_EARLY_INIT)
  bl  arch_very_early_init
#endif
// 设置sp指针并保证其为八字节对齐
#if defined(CONFIG_TPL_BUILD) && defined(CONFIG_TPL_NEEDS_SEPARATE_STACK)
  ldr  r0, =(CONFIG_TPL_STACK)
#elif defined(CONFIG_XPL_BUILD) && defined(CONFIG_SPL_STACK)
  ldr  r0, =(CONFIG_SPL_STACK)
#else
  ldr  r0, =(SYS_INIT_SP_ADDR)
#endif
  bic  r0, r0, #7 
  mov  sp, r0
  // 将r9和sp都设置为SYS_INIT_SP_ADDR - early malloc area + GD_SIZE
  bl  board_init_f_alloc_reserve
  mov  sp, r0
  mov  r9, r0
  // 将 gd 结构体对应的空间清零
  bl  board_init_f_init_reserve
// 初始化UART用于调试
#if defined(CONFIG_DEBUG_UART) && CONFIG_IS_ENABLED(SERIAL)
  bl  debug_uart_init
#endif
// 清除BSS段
#if defined(CONFIG_XPL_BUILD) && defined(CONFIG_SPL_EARLY_BSS)
  CLEAR_BSS
#endif

  mov  r0, #0
  // 设置 gd 结构体的 flag 和 have_console 成员
  // 依次执行函数指针数组 init_sequence[] 里面的函数
  bl  board_init_f
```
```c
void board_init_f(ulong boot_flags)
{
  struct board_f boardf;
  // 设置flags表示没有初始化串口
  gd->flags = boot_flags;
  gd->flags &= ~GD_FLG_HAVE_CONSOLE;
  gd->boardf = &boardf;
  // 运行函数指针数组 init_sequence[] 里面的函数
  if (initcall_run_list(init_sequence_f))
    hang();

#if !defined(CONFIG_ARM) && !defined(CONFIG_SANDBOX) && \
    !defined(CONFIG_EFI_APP) && !CONFIG_IS_ENABLED(X86_64) && \
    !defined(CONFIG_ARC)
  hang();
#endif
}
```
**②重定位**
>**概述**：根据之前填充的`gd`结构体设置`sp`和`gd`寄存器，并进行`u-boot`和**异常向量表**的重定位
{%list%}
relocate_code将u-boot从__image_copy_start拷贝到gd->relocaddr处完成重定位
{%endlist%}
{%right%}
由于异常向量表在relocate_code中已经被拷贝，relocate_vectors只需要修改对应寄存器即可
{%endright%}
```c
ENTRY(_main)
/* C语言环境初始化略 */
// 根据全局数据结构gd设置新的sp指针和gd指针
#if ! defined(CONFIG_SPL_BUILD)

  ldr  r0, [r9, #GD_START_ADDR_SP]  
  bic  r0, r0, #7  
  mov  sp, r0
  ldr  r9, [r9, #GD_NEW_GD]    

  adr  lr, here
#if defined(CONFIG_POSITION_INDEPENDENT)
  adr  r0, _main
  ldr  r1, _start_ofs
  add  r0, r1
  ldr  r1, =CONFIG_TEXT_BASE
  sub  r1, r0
  add  lr, r1
#if defined(CONFIG_SYS_RELOC_GD_ENV_ADDR)
  ldr  r0, [r9, #GD_ENV_ADDR]    
  add  r0, r0, r1
  str  r0, [r9, #GD_ENV_ADDR]
#endif
#endif
  ldr  r0, [r9, #GD_RELOC_OFF]    
  add  lr, lr, r0
#if defined(CONFIG_CPU_V7M)
  orr  lr, #1 
#endif
// u-boot镜像拷贝与重定位
  ldr  r0, [r9, #GD_RELOCADDR]
  b  relocate_code
here:
// 重定位向量表，并将向量表地址存储到VBAR寄存器中
  bl  relocate_vectors
// 使指令缓存失效
  bl  c_runtime_cpu_setup  
#endif
/* 后续过程略 */
ENDPROC(_main)
```
**③`board_init_r`**
>**概述**：调用`board_init_r`依次执行**函数指针数组**`init_sequence_r[]`里面的函数
{%list%}
board_init_r继续board_init_f未完成的工作，如开发板相关初始化和网络初始化，并使能cache和中断
{%endlist%}
{%right%}
上述过程中，u-boot已经初始化好硬件并分配完内存，board_init_r最终调用run_main_loop将控制权交给Linux
{%endright%}
```c
ENTRY(_main)
/* C语言环境初始化和重定位略 */
#if !defined(CONFIG_SPL_BUILD) || CONFIG_IS_ENABLED(FRAMEWORK)
// 清除BSS段
#if !defined(CONFIG_SPL_BUILD) || !defined(CONFIG_SPL_EARLY_BSS)
  CLEAR_BSS
#endif
  // 运行 board_init_r(gd_t *id, ulong dest_addr)
  mov     r0, r9                  
  ldr  r1, [r9, #GD_RELOCADDR]  
#endif
ENDPROC(_main)
```
```c
void board_init_r(gd_t *new_gd, ulong dest_addr)
{
  // 修改 flag 标志
  gd->flags &= ~(GD_FLG_SERIAL_READY | GD_FLG_LOG_READY);

  if (CONFIG_IS_ENABLED(X86_64) && !IS_ENABLED(CONFIG_EFI_APP))
    arch_setup_gd(new_gd);

#if !defined(CONFIG_X86) && !defined(CONFIG_ARM) && !defined(CONFIG_ARM64)
  gd = new_gd;
#endif
  gd->flags &= ~GD_FLG_LOG_READY;
  // 依次执行函数指针数组 init_sequence_r[] 里面的函数
  if (initcall_run_list(init_sequence_r))
    hang();

  hang();
}
```
#### 1.3启动引导
**②`run_main_loop`**
>**概述**：不断执行`main_loop`，获取**启动延时**和**引导命令**，并根据**用户操作**选择执行`u-boot`**命令行**还是**启动内核**
{%list%}
bootdelay_process从环境变量中读取并设置stored_bootdelay和bootcmd，前者为启动延时，后者为引导命令
{%endlist%}
{%right%}
autoboot_command检查延时期间用户是否打断了启动引导，有则执行cli_loop，反之执行run_command_list
{%endright%}
```c
static int run_main_loop(void)
{
#ifdef CONFIG_SANDBOX
  sandbox_main_loop_init();
#endif
  //通知 EVT_MAIN_LOOP 事件
  event_notify_null(EVT_MAIN_LOOP);
  for (;;)
    main_loop();
  return 0;
}
```
```c
void main_loop(void)
{
  /* 略去一些if语句 */
  const char *s;
  // 标记启动阶段
  bootstage_mark_name(BOOTSTAGE_ID_MAIN_LOOP, "main_loop");
  // 初始化命令行
  cli_init();
  // 根据按下按钮运行对应命令
  process_button_cmds();
  // 设置全局变量stored_bootdelay，并返回bootcmd
  s = bootdelay_process();
  // 检查倒计时结束之前有没有被打断，如果被打断则继续执行
  // 如果没有打断，则运行启动命令列表run_command_list中的一系列命令，即默认的bootcmd命令
  autoboot_command(s);
  // 不断循环检测并处理用户输入的命令
  cli_loop();

  panic("No CLI available");
}
```
**②`do_bootz`**
>**概述**：`u-boot`执行`bootcmd`的命令后，最终会调用`do_bootz`启动`Linux`**内核**
{%list%}
images是一个很重要的全局变量，用于描述内核镜像相关信息，如镜像入口地址、镜像载入地址和操作系统入口
{%endlist%}
{%right%}
在调用do_bootz函数前，u-boot会执行一段启动脚本，将内核和设备树等镜像文件加载到内存对应位置
{%endright%}
{%warning%}
由于需要加载linux镜像，所以需要关闭中断
{%endwarning%}
```c
int do_bootz(struct cmd_tbl *cmdtp, int flag, int argc, char *const argv[])
{
  struct bootm_info bmi;
  int ret;
  argc--; argv++;

  // 设置内核镜像入口并解压内核镜像
  if (bootz_start(cmdtp, flag, argc, argv, &images))
    return 1;
  // 禁用中断
  bootm_disable_interrupts();
  // 设置操作系统类型
  images.os.os = IH_OS_LINUX;
  // 设置bmi结构体，包含内核镜像地址、ramdisk地址和设备树文件的地址等信息
  bootm_init(&bmi);
  if (argc)
    bmi.addr_img = argv[0];
  if (argc > 1)
    bmi.conf_ramdisk = argv[1];
  if (argc > 2)
    bmi.conf_fdt = argv[2];
  bmi.cmd_name = "bootz";
  // 执行启动
  ret = bootz_run(&bmi);

  return ret;
}
```
```c
static int bootz_start(struct cmd_tbl *cmdtp, int flag, int argc,
           char *const argv[], struct bootm_headers *images)
{
  ulong zi_start, zi_end;
  struct bootm_info bmi;
  int ret;
  // 设置 bmi 结构体
  bootm_init(&bmi);
  if (argc)
    bmi.addr_img = argv[0];
  if (argc > 1)
    bmi.conf_ramdisk = argv[1];
  if (argc > 2)
    bmi.conf_fdt = argv[2];
  // 清空 image 结构体所有内容
  ret = bootm_run_states(&bmi, BOOTM_STATE_START);
  // 设置内核镜像入口地址
  if (!argc) {
    images->ep = image_load_addr;
    debug("*  kernel: default image load address = 0x%08lx\n",
        image_load_addr);
  } else {
    images->ep = hextoul(argv[0], NULL);
    debug("*  kernel: cmdline image address = 0x%08lx\n",
      images->ep);
  }
  // 检查内核镜像的有效性，并读取内核镜像的起始地址
  ret = bootz_setup(images->ep, &zi_start, &zi_end);
  if (ret != 0)
    return 1;
  // 为内核预留内存
  lmb_reserve(images->ep, zi_end - zi_start);
  // 查找并加载启动过程需要的各类镜像文件
  if (bootm_find_images(image_load_addr, cmd_arg1(argc, argv),
            cmd_arg2(argc, argv), images->ep,
            zi_end - zi_start))
    return 1;

  return 0;
}
```
**③`bootz_run`**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
```c
int bootz_run(struct bootm_info *bmi)
{
  return boot_run(bmi, "bootz", 0);
}
```
```c
int boot_run(struct bootm_info *bmi, const char *cmd, int extra_states)
{
  int states;

  bmi->cmd_name = cmd;
  states = BOOTM_STATE_MEASURE | BOOTM_STATE_OS_PREP |
    BOOTM_STATE_OS_FAKE_GO | BOOTM_STATE_OS_GO;
  if (IS_ENABLED(CONFIG_SYS_BOOT_RAMDISK_HIGH))
    states |= BOOTM_STATE_RAMDISK;
  states |= extra_states;

  return bootm_run_states(bmi, states);
}
```
```c
int bootm_run_states(struct bootm_info *bmi, int states)
{
  struct bootm_headers *images = bmi->images;
  boot_os_fn *boot_fn;
  ulong iflag = 0;
  int ret = 0, need_boot_fn;
  images->state |= states;
  /* 略去一些无关的if语句 */
  // 一些测量验证工作
  if (IS_ENABLED(CONFIG_MEASURED_BOOT) && !ret &&
      (states & BOOTM_STATE_MEASURE))
    bootm_measure(images);
  // 找到对应的启动函数，即do_bootm_linux
  boot_fn = bootm_os_get_boot_func(images->os.os);
  need_boot_fn = states & (BOOTM_STATE_OS_CMDLINE |
      BOOTM_STATE_OS_BD_T | BOOTM_STATE_OS_PREP |
      BOOTM_STATE_OS_FAKE_GO | BOOTM_STATE_OS_GO);
      
  if (!ret && (states & BOOTM_STATE_OS_CMDLINE))
    ret = boot_fn(BOOTM_STATE_OS_CMDLINE, bmi);
  if (!ret && (states & BOOTM_STATE_OS_BD_T))
    ret = boot_fn(BOOTM_STATE_OS_BD_T, bmi);
  if (!ret && (states & BOOTM_STATE_OS_PREP)) {
    int flags = 0;
    if (images->os.os == IH_OS_LINUX)
      flags = BOOTM_CL_ALL;
    ret = bootm_process_cmdline_env(flags);
    if (ret) {
      printf("Cmdline setup failed (err=%d)\n", ret);
      ret = CMD_RET_FAILURE;
      goto err;
    }
    ret = boot_fn(BOOTM_STATE_OS_PREP, bmi);
  }
  if (!ret && (states & BOOTM_STATE_OS_GO))
    ret = boot_selected_os(BOOTM_STATE_OS_GO, bmi, boot_fn);
  /* 后续略 */
}
```
#### 1.4内核启动
**①`do_bootm_linux`**
>**概述**：
```c
int do_bootm_linux(int flag, struct bootm_info *bmi)
{
  struct bootm_headers *images = bmi->images;

  /* No need for those on ARM */
  if (flag & BOOTM_STATE_OS_BD_T || flag & BOOTM_STATE_OS_CMDLINE)
    return -1;

  if (flag & BOOTM_STATE_OS_PREP) {
    boot_prep_linux(images);
    return 0;
  }

  if (flag & (BOOTM_STATE_OS_GO | BOOTM_STATE_OS_FAKE_GO)) {
    boot_jump_linux(images, flag);
    return 0;
  }

  boot_prep_linux(images);
  boot_jump_linux(images, flag);
  return 0;
}
```

**②`boot_prep_linux`**
>**概述**：
```c
static void boot_prep_linux(struct bootm_headers *images)
{
  // 获取环境变量bootargs，即内核启动参数
  char *commandline = env_get("bootargs");
  // 检查是否使用FDT，如果是则使用FDT传递参数
  if (CONFIG_IS_ENABLED(OF_LIBFDT) && IS_ENABLED(CONFIG_LMB) && images->ft_len) {
    debug("using: FDT\n");
    if (image_setup_linux(images)) {
      panic("FDT creation failed!");
    }
  } 
  // 如果没有使用FDT，则使用ATAGS
  else if (BOOTM_ENABLE_TAGS) {
    debug("using: ATAGS\n");
    setup_start_tag(gd->bd);
    if (BOOTM_ENABLE_SERIAL_TAG)
      setup_serial_tag(&params);
    if (BOOTM_ENABLE_CMDLINE_TAG)
      setup_commandline_tag(gd->bd, commandline);
    if (BOOTM_ENABLE_REVISION_TAG)
      setup_revision_tag(&params);
    if (BOOTM_ENABLE_MEMORY_TAGS)
      setup_memory_tags(gd->bd);
    if (BOOTM_ENABLE_INITRD_TAG) {
      /*
       * In boot_ramdisk_high(), it may relocate ramdisk to
       * a specified location. And set images->initrd_start &
       * images->initrd_end to relocated ramdisk's start/end
       * addresses. So use them instead of images->rd_start &
       * images->rd_end when possible.
       */
      if (images->initrd_start && images->initrd_end) {
        setup_initrd_tag(gd->bd, images->initrd_start,
             images->initrd_end);
      } else if (images->rd_start && images->rd_end) {
        setup_initrd_tag(gd->bd, images->rd_start,
             images->rd_end);
      }
    }
    setup_board_tags(&params);
    setup_end_tag(gd->bd);
  } else {
    panic("FDT and ATAGS support not compiled in\n");
  }
  // 板级准备工作
  board_prep_linux(images);
}
```
**③`boot_jump_linux`**
>**概述**：
```c
static void boot_jump_linux(struct bootm_headers *images, int flag)
{
#ifdef CONFIG_ARM64
  void (*kernel_entry)(void *fdt_addr, void *res0, void *res1,
      void *res2);
  int fake = (flag & BOOTM_STATE_OS_FAKE_GO);

  kernel_entry = (void (*)(void *fdt_addr, void *res0, void *res1,
        void *res2))images->ep;

  debug("## Transferring control to Linux (at address %lx)...\n",
    (ulong) kernel_entry);
  bootstage_mark(BOOTSTAGE_ID_RUN_OS);

  announce_and_cleanup(fake);

  if (!fake) {
#ifdef CONFIG_ARMV8_PSCI
    armv8_setup_psci();
#endif
    do_nonsec_virt_switch();

    update_os_arch_secondary_cores(images->os.arch);

#ifdef CONFIG_ARMV8_SWITCH_TO_EL1
    armv8_switch_to_el2((u64)images->ft_addr, 0, 0, 0,
            (u64)switch_to_el1, ES_TO_AARCH64);
#else
    if ((IH_ARCH_DEFAULT == IH_ARCH_ARM64) &&
        (images->os.arch == IH_ARCH_ARM))
      armv8_switch_to_el2(0, (u64)gd->bd->bi_arch_number,
              (u64)images->ft_addr, 0,
              (u64)images->ep,
              ES_TO_AARCH32);
    else
      armv8_switch_to_el2((u64)images->ft_addr, 0, 0, 0,
              images->ep,
              ES_TO_AARCH64);
#endif
  }
#else
  unsigned long machid = gd->bd->bi_arch_number;
  char *s;
  void (*kernel_entry)(int zero, int arch, uint params);
  unsigned long r2;
  int fake = (flag & BOOTM_STATE_OS_FAKE_GO);

  kernel_entry = (void (*)(int, int, uint))images->ep;
#ifdef CONFIG_CPU_V7M
  ulong addr = (ulong)kernel_entry | 1;
  kernel_entry = (void *)addr;
#endif
  s = env_get("machid");
  if (s) {
    if (strict_strtoul(s, 16, &machid) < 0) {
      debug("strict_strtoul failed!\n");
      return;
    }
    printf("Using machid 0x%lx from environment\n", machid);
  }

  debug("## Transferring control to Linux (at address %08lx)" \
    "...\n", (ulong) kernel_entry);
  bootstage_mark(BOOTSTAGE_ID_RUN_OS);
  announce_and_cleanup(fake);

  if (CONFIG_IS_ENABLED(OF_LIBFDT) && images->ft_len)
    r2 = (unsigned long)images->ft_addr;
  else
    r2 = gd->bd->bi_boot_params;

  if (!fake) {
#ifdef CONFIG_ARMV7_NONSEC
    if (armv7_boot_nonsec()) {
      armv7_init_nonsec();
      secure_ram_addr(_do_nonsec_entry)(kernel_entry,
                0, machid, r2);
    } else
#endif
      kernel_entry(0, machid, r2);
  }
#endif
}
```











则运行启动命令列表run_command_list中的一系列命令,即默认的bootcmd命令
abortboot
```c
void autoboot_command(const char *s)
{
  debug("### main_loop: bootcmd=\"%s\"\n", s ? s : "<UNDEFINED>");

  if (s && (stored_bootdelay == -2 ||
     (stored_bootdelay != -1 && !abortboot(stored_bootdelay)))) {
    bool lock;
    int prev;

    lock = autoboot_keyed() &&
      !IS_ENABLED(CONFIG_AUTOBOOT_KEYED_CTRLC);
    if (lock)
      prev = disable_ctrlc(1); /* disable Ctrl-C checking */

    run_command_list(s, -1, 0);

    if (lock)
      disable_ctrlc(prev);  /* restore Ctrl-C checking */
  }

  if (IS_ENABLED(CONFIG_AUTOBOOT_USE_MENUKEY) &&
      menukey == AUTOBOOT_MENUKEY) {
    s = env_get("menucmd");
    if (s)
      run_command_list(s, -1, 0);
  }
}
```
③

对于imx6ull EVK pro开发板而言，支持3种启动方式，也就是u-boot可以从3个地方获取linux内核，如NAND启动/EMMC启动、 SD卡启动、USB启动等
imx6ull在启动内核前会判断启动引脚地电平状态，根据启动引脚地电平状态选择不同的启动方式
最终都要将内核镜像加载到DDR中运行

当u-boot执行bootcmd的命令后，最终会调用do_bootz函数启动Linux内核：

在do_bootz之前会运行一段启动脚本，该启动脚本在include/configs/npi_common.h文件中有相关描述













```nasm
ENTRY(stext)
  bl  preserve_boot_args
  bl  el2_setup      // Drop to EL1, w0=cpu_boot_mode
  adrp  x23, __PHYS_OFFSET
  and  x23, x23, MIN_KIMG_ALIGN - 1  // KASLR offset, defaults to 0
  bl  set_cpu_boot_mode_flag
  bl  __create_page_tables
  /*
   * The following calls CPU setup code, see arch/arm64/mm/proc.S for
   * details.
   * On return, the CPU will be ready for the MMU to be turned on and
   * the TCR will have been set.
   */
  bl  __cpu_setup      // initialise processor
  b  __primary_switch
ENDPROC(stext)
```

```c
asmlinkage __visible void __init start_kernel(void)
{
  char *command_line;
  char *after_dashes;

  set_task_stack_end_magic(&init_task);
  smp_setup_processor_id();
  debug_objects_early_init();

  cgroup_init_early();

  local_irq_disable();
  early_boot_irqs_disabled = true;

  /*
   * Interrupts are still disabled. Do necessary setups, then
   * enable them.
   */
  boot_cpu_init();
  page_address_init();
  pr_notice("%s", linux_banner);
  early_security_init();
  setup_arch(&command_line);
  setup_command_line(command_line);
  setup_nr_cpu_ids();
  setup_per_cpu_areas();
  smp_prepare_boot_cpu();  /* arch-specific boot-cpu hooks */
  boot_cpu_hotplug_init();

  build_all_zonelists(NULL);
  page_alloc_init();

  pr_notice("Kernel command line: %s\n", boot_command_line);
  /* parameters may set static keys */
  jump_label_init();
  parse_early_param();
  after_dashes = parse_args("Booting kernel",
          static_command_line, __start___param,
          __stop___param - __start___param,
          -1, -1, NULL, &unknown_bootoption);
  if (!IS_ERR_OR_NULL(after_dashes))
    parse_args("Setting init args", after_dashes, NULL, 0, -1, -1,
         NULL, set_init_arg);

  /*
   * These use large bootmem allocations and must precede
   * kmem_cache_init()
   */
  setup_log_buf(0);
  vfs_caches_init_early();
  sort_main_extable();
  trap_init();
  mm_init();

  ftrace_init();

  /* trace_printk can be enabled here */
  early_trace_init();

  /*
   * Set up the scheduler prior starting any interrupts (such as the
   * timer interrupt). Full topology setup happens at smp_init()
   * time - but meanwhile we still have a functioning scheduler.
   */
  sched_init();
  /*
   * Disable preemption - early bootup scheduling is extremely
   * fragile until we cpu_idle() for the first time.
   */
  preempt_disable();
  if (WARN(!irqs_disabled(),
     "Interrupts were enabled *very* early, fixing it\n"))
    local_irq_disable();
  radix_tree_init();

  /*
   * Set up housekeeping before setting up workqueues to allow the unbound
   * workqueue to take non-housekeeping into account.
   */
  housekeeping_init();

  /*
   * Allow workqueue creation and work item queueing/cancelling
   * early.  Work item execution depends on kthreads and starts after
   * workqueue_init().
   */
  workqueue_init_early();

  rcu_init();

  /* Trace events are available after this */
  trace_init();

  if (initcall_debug)
    initcall_debug_enable();

  context_tracking_init();
  /* init some links before init_ISA_irqs() */
  early_irq_init();
  init_IRQ();
  tick_init();
  rcu_init_nohz();
  init_timers();
  hrtimers_init();
  softirq_init();
  timekeeping_init();

  /*
   * For best initial stack canary entropy, prepare it after:
   * - setup_arch() for any UEFI RNG entropy and boot cmdline access
   * - timekeeping_init() for ktime entropy used in rand_initialize()
   * - rand_initialize() to get any arch-specific entropy like RDRAND
   * - add_latent_entropy() to get any latent entropy
   * - adding command line entropy
   */
  rand_initialize();
  add_latent_entropy();
  add_device_randomness(command_line, strlen(command_line));
  boot_init_stack_canary();

  time_init();
  printk_safe_init();
  perf_event_init();
  profile_init();
  call_function_init();
  WARN(!irqs_disabled(), "Interrupts were enabled early\n");

  early_boot_irqs_disabled = false;
  local_irq_enable();

  kmem_cache_init_late();

  /*
   * HACK ALERT! This is early. We're enabling the console before
   * we've done PCI setups etc, and console_init() must be aware of
   * this. But we do want output early, in case something goes wrong.
   */
  console_init();
  if (panic_later)
    panic("Too many boot %s vars at `%s'", panic_later,
          panic_param);

  lockdep_init();

  /*
   * Need to run this when irqs are enabled, because it wants
   * to self-test [hard/soft]-irqs on/off lock inversion bugs
   * too:
   */
  locking_selftest();

  /*
   * This needs to be called before any devices perform DMA
   * operations that might use the SWIOTLB bounce buffers. It will
   * mark the bounce buffers as decrypted so that their usage will
   * not cause "plain-text" data to be decrypted when accessed.
   */
  mem_encrypt_init();

#ifdef CONFIG_BLK_DEV_INITRD
  if (initrd_start && !initrd_below_start_ok &&
      page_to_pfn(virt_to_page((void *)initrd_start)) < min_low_pfn) {
    pr_crit("initrd overwritten (0x%08lx < 0x%08lx) - disabling it.\n",
        page_to_pfn(virt_to_page((void *)initrd_start)),
        min_low_pfn);
    initrd_start = 0;
  }
#endif
  setup_per_cpu_pageset();
  numa_policy_init();
  acpi_early_init();
  if (late_time_init)
    late_time_init();
  sched_clock_init();
  calibrate_delay();
  pid_idr_init();
  anon_vma_init();
#ifdef CONFIG_X86
  if (efi_enabled(EFI_RUNTIME_SERVICES))
    efi_enter_virtual_mode();
#endif
  thread_stack_cache_init();
  cred_init();
  fork_init();
  proc_caches_init();
  uts_ns_init();
  buffer_init();
  key_init();
  security_init();
  dbg_late_init();
  vfs_caches_init();
  pagecache_init();
  signals_init();
  seq_file_init();
  proc_root_init();
  nsfs_init();
  cpuset_init();
  cgroup_init();
  taskstats_init_early();
  delayacct_init();

  poking_init();
  check_bugs();

  acpi_subsystem_init();
  arch_post_acpi_subsys_init();
  sfi_init_late();

  /* Do the rest non-__init'ed, we're now alive */
  arch_call_rest_init();
}

```
```
void __init __weak arch_call_rest_init(void)
{
  rest_init();
}
```
```c
noinline void __ref rest_init(void)
{
  struct task_struct *tsk;
  int pid;

  rcu_scheduler_starting();
  /*
   * We need to spawn init first so that it obtains pid 1, however
   * the init task will end up wanting to create kthreads, which, if
   * we schedule it before we create kthreadd, will OOPS.
   */
  pid = kernel_thread(kernel_init, NULL, CLONE_FS);
  /*
   * Pin init on the boot CPU. Task migration is not properly working
   * until sched_init_smp() has been run. It will set the allowed
   * CPUs for init to the non isolated CPUs.
   */
  rcu_read_lock();
  tsk = find_task_by_pid_ns(pid, &init_pid_ns);
  set_cpus_allowed_ptr(tsk, cpumask_of(smp_processor_id()));
  rcu_read_unlock();

  numa_default_policy();
  pid = kernel_thread(kthreadd, NULL, CLONE_FS | CLONE_FILES);
  rcu_read_lock();
  kthreadd_task = find_task_by_pid_ns(pid, &init_pid_ns);
  rcu_read_unlock();

  /*
   * Enable might_sleep() and smp_processor_id() checks.
   * They cannot be enabled earlier because with CONFIG_PREEMPTION=y
   * kernel_thread() would trigger might_sleep() splats. With
   * CONFIG_PREEMPT_VOLUNTARY=y the init task might have scheduled
   * already, but it's stuck on the kthreadd_done completion.
   */
  system_state = SYSTEM_SCHEDULING;

  complete(&kthreadd_done);

  /*
   * The boot idle thread must execute schedule()
   * at least once to get things moving:
   */
  schedule_preempt_disabled();
  /* Call into cpu_idle with preempt disabled */
  cpu_startup_entry(CPUHP_ONLINE);
}

```