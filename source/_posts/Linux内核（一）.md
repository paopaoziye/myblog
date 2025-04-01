---
title: Linux内核（一）
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
summary: 内存管理
---
# Linux内核（一）
## 内存管理
### 1.虚拟内存
#### 1.1引言
**①虚拟地址**
>**概述**：**进程使用**的人为定义的地址，`CPU`访问该地址时，`MMU`将其转换为**对应物理地址**
{%list%}
每个进程的虚拟地址空间是独立的，不同进程访问同一虚拟地址，大部分情况访问的是不同物理地址
{%endlist%}
>进程虚拟地址空间分为**内核空间**和**用户空间**，所有进程**共享一个内核空间**
{%right%}
根据局部性原理，一段时间内进程只会访问一部分虚拟内存，所以只需要将这部分加载到物理内存即可保证其运行
{%endright%}
{%warning%}
物理内存空间被操作系统屏蔽，进程只能使用虚拟地址，且不能随意访问内核空间和其他进程用户空间
{%endwarning%}
**②虚拟页**
>**概述**：与**物理页**相对应，可分为**未分配页**、**已分配未映射页**和**正常页**
{%list%}
虚拟页和物理页的的映射关系由页表记录，此外页表还管理虚拟页对物理页的访问权限
{%endlist%}
{%right%}
进程使用malloc或mmap系统调用向内核申请虚拟内存时，申请到的页面从未分配页面变为已分配未映射页面
{%endright%}
{%warning%}
进程读写已分配未映射内存页时，MMU会产生缺页中断，为其分配物理内存页面并映射起来，将其变为正常页面
{%endwarning%}
**③地址格式**
>**概述**：由**各级目录项**和**页内偏移**组成，`64`位和`32`位**虚拟地址格式**如下所示，分别为`9:9:9:9:12`和`10:10:12`位
{%list%}
32位虚拟空间的0-3GB为用户空间，3GB-4GB为内核空间；64位虚拟空间的低128T为用户空间，高128T为内核空间
{%endlist%}
{%right%}
64位虚拟空间只使用低48位，其中高16位全为1表示内核空间，全为0表示用户空间，其余为canonical address空洞
{%endright%}
![虚拟地址格式](/image/linux_1.png)

#### 1.2空间分布
**①用户空间**
>**概述**：主要由**代码段**、**数据段**、**BSS段**、**堆/栈段**和**映射区**组成
{%list%}
堆段从低地址向高地址增长，栈段和映射区从高地址向低地址增长
{%endlist%}
{%right%}
在二进制文件中只会记录BSS段的地址范围，并在加载进内存时会生成一段0填充的内存空间
{%endright%}
{%warning%}
不可访问区的作用是防止程序在读写数据段的时候越界访问到代码段
{%endwarning%}
{%wrong%}
在大多数操作系统中，数值比较小的地址通常被认为不是一个合法的地址，是不允许访问的，即保留区
{%endwrong%}
>**代码段/数据段**：前者存放程序**机器码**，后者存放**指定了初始值**的全局变量和静态变量

>**BSS段**：存放**没有指定初始值**的全局变量和静态变量，被**加载进内存后**会被初始化为`0`

>**堆/栈段**：前者用于**动态内存申请**，后者存放函数调用的**局部变量**、**参数**和**返回地址**等

>**映射区**：存放**动态链接库**的数据段和代码段等，以及`mmap`系统调用映射的**共享内存区**

![用户空间](/image/linux_2.png)

**②内核空间**
>**概述**：`32`位内核空间主要由**直接映射区**、`vmalloc`**动态映射区**、**永久映射区**、**固定映射区**和**临时映射区**组成
{%list%}
直接映射区的大小为896M，并直接映射到0-896M的物理内存上，其映射关系是固定的
{%endlist%}
{%right%}
64位内核空间足够的大，所以不需要像32位内核空间那样精细管理
{%endright%}
{%warning%}
32位物理内存的高端内存区域为3200M，而内核对应的虚拟内存只有128M，需要将其分为临时映射区等进行管理
{%endwarning%}
{%wrong%}
内核栈的容量小且固定，一般是两个页大小，内核栈溢出会直接覆盖相邻内存区域中的数据
{%endwrong%}
>**直接映射区**：用于**DMA操作**，存放内核**代码段**，**数据段**，**BSS段**、**进程相关的描述符**和**内核栈**等

>`vmalloc`**动态映射区**：用于`vmalloc`进行**动态内存分配**，其对应的物理内存是**不连续的**

>**永久映射区/临时映射区**：前者可以与物理高端内存建立**长期映射关系**，后者只能建立**短期映射关系**

>**固定映射区**：此处虚拟地址有**固定的用途**，而被映射的物理地址**可以改变**

![内核空间](/image/linux_3.png)

**③ELF文件**
>**概述**：程序编译后生成的一种**二进制文件**，包含了程序运行时所需要的**元信息**
{%list%}
ELF文件布局和虚拟内存空间布局类似，分为多个段，每一段包含不同的元数据
{%endlist%}
{%right%}
load_elf_binary将ELF文件中的各个段加载到虚拟内存空间对应虚拟内存区域
{%endright%}
```c
static int load_elf_binary(struct linux_binprm *bprm)
{
      ...... 省略 ........
  // 设置虚拟内存空间中的内存映射区域起始地址 mmap_base
  setup_new_exec(bprm);

     ...... 省略 ........
  // 创建并初始化栈对应的 vm_area_struct 结构。
  // 设置 mm->start_stack 就是栈的起始地址也就是栈底，并将 mm->arg_start 是指向栈底的。
  retval = setup_arg_pages(bprm, randomize_stack_top(STACK_TOP),
         executable_stack);

     ...... 省略 ........
  // 将二进制文件中的代码部分映射到虚拟内存空间中
  error = elf_map(bprm->file, load_bias + vaddr, elf_ppnt,
        elf_prot, elf_flags, total_size);

     ...... 省略 ........
 // 创建并初始化堆对应的的 vm_area_struct 结构
 // 设置堆的起始地址 start_brk，结束地址 brk，起初两者相等表示堆是空的
  retval = set_brk(elf_bss, elf_brk, bss_prot);

     ...... 省略 ........
  // 将进程依赖的动态链接库 .so 文件映射到虚拟内存空间中的内存映射区域
  elf_entry = load_elf_interp(&loc->interp_elf_ex,
              interpreter,
              &interp_map_addr,
              load_bias, interp_elf_phdata);

     ...... 省略 ........
  // 初始化内存描述符 mm_struct
  current->mm->end_code = end_code;
  current->mm->start_code = start_code;
  current->mm->start_data = start_data;
  current->mm->end_data = end_data;
  current->mm->start_stack = bprm->p;

     ...... 省略 ........
}
```
#### 1.3数据结构
**①`mm_struct`**
>**概述**：用于描述进程**虚拟内存空间**，包含了虚拟内存空间的全部信息如**各个段的起始位置**和**相关统计信息**等
{%list%}
mm_struct是task_struct的一部分，使用fork创建进程时子进程会拷贝父进程的mm_struct和相关页表
{%endlist%}
{%right%}
创建的如果是线程，会和父进程共享mm_struct结构和相关页表，并增加父进程mm_struct的引用计数
{%endright%}
{%warning%}
内核线程的mm_struct为NULL，当内核线程访问内存时，会直接使用调度前上一个用户态进程/线程的mm_struct
{%endwarning%}
>因为内核线程**只访问内核空间**，而所有进程**共享内核空间**
```c
struct mm_struct {
  /* 其余成员略 */
  unsigned long mmap_base;  /* 映射区的起始地址 */
  unsigned long task_size;  /* 用户空间的大小 */

  /* 代码段、数据段、堆栈段、参数列表和环境变量的起始地址和结束地址 */
  unsigned long start_code, end_code, start_data, end_data;
  unsigned long start_brk, brk, start_stack;
  unsigned long arg_start, arg_end, env_start, env_end;
  /* 内存页统计信息 */
  unsigned long total_vm;    /* 进程虚拟空间建立映射的内存页数量 */
  unsigned long locked_vm;   /* 被锁定不能换出的内存页总数 */
  unsigned long pinned_vm;   /* 既不能换出，也不能移动的内存页总数 */
  unsigned long data_vm;     /* 数据段中映射的内存页数目 */
  unsigned long exec_vm;     /* 代码段中映射的内存页数目 */
  unsigned long stack_vm;    /* 栈段中映射的内存页数目 */
};
```
**②`vm_area_struct`**
>**概述**：用于描述**虚拟内存区域**`VMA`，如**代码段**和**数据段**等，包含该区域的**相关信息**，如**地址范围**和**操作权限**等
{%list%}
vm_page_prot指示VMA中内存页级别的访问控制权限，vm_flags指示整个VMA的访问权限以及行为规范
{%endlist%}
>`vm_flags`可以通过`vma->vm_page_prot = vm_get_page_prot(vma->vm_flags)`转化为`vm_page_prot`
{%right%}
如下所示，可见虚拟内存空间的各个vm_area_struct被组织为双向链表和红黑树，前者用于遍历，后者用于查找
{%endright%}
```c
struct mm_struct {
  /* 其余成员略 */
  struct vm_area_struct *mmap;  /* vm_area_struct双向链表的头节点 */
  struct rb_root mm_rb;         /* vm_area_struct红黑树的根节点 */
}
```
```c
struct vm_area_struct {
  /* 其余成员略 */
  /* 区域的起始地址和终止地址 */
  unsigned long vm_start;  
  unsigned long vm_end;

  /* 指向虚拟地址空间中的前一个和下一个vm_area_struct */
  struct vm_area_struct *vm_next, *vm_prev; 
  struct rb_node vm_rb;       /* 对应的红黑树节点 */
  struct mm_struct *vm_mm;    /* 指向属于的mm_struct */

  pgprot_t vm_page_prot       /* 该区域内存页的控制权限 */
  unsigned long vm_flags;     /* 整个虚拟内存区域的访问权限以及行为规范 */
  
  /* 该区域的操作函数指针集合 */
  const struct vm_operations_struct *vm_ops;

  /* 内存映射相关 */
  struct anon_vma *anon_vma;  /* 指向匿名映射区域 */
  unsigned long vm_pgoff;     /* 映射进虚拟内存中的文件内容，在文件中的偏移 */
  struct file * vm_file;      /* 指向被映射的文件 */
};
```
**③`vm_operations_struct`**
>**概述**：包含一系列针对**虚拟内存区域**`VMA`的相关操作的**函数指针**
{%list%}
当指定VMA被加入进程虚拟内存空间时会调用open，被删除时调用close，发生缺页异常时调用fault
{%endlist%}
{%right%}
内核中这种类似的用法有很多，很多描述符都会定义相关的函数接口并封装在结构体内，类似于面向对象
{%endright%}
```c
struct vm_operations_struct {
  /* 其余成员略 */
  void (*open)(struct vm_area_struct * area);
  void (*close)(struct vm_area_struct * area);
  vm_fault_t (*fault)(struct vm_fault *vmf);
}
```
***
### 2.物理内存
#### 2.1内存模型
**①平坦内存模型**
>**概述**：物理内存视为**一块地址连续**的存储空间，使用一个`page`结构**全局数组**`mem_map`管理，默认使用该模型
{%list%}
page结构封装了一个物理页的状态信息如使用信息和统计信息等，且每个page结构有其全局唯一的页编号PFN
{%endlist%}
{%right%}
内核提供宏page_to_pfn与pfn_to_page根据内存模型的组织形式完成PFN和page的转换
{%endright%}
{%warning%}
由于数组必须是连续的，当物理内存出现大量空洞时也需要为其分配page结构填充，十分浪费内存
{%endwarning%}
**②非连续内存模型**
>**概述**：物理内存视为**多块非连续**的存储空间，将其分为**多个节点**，每个节点管理一块**连续物理内存**
{%list%}
每个节点都有其page数组node_mem_map，管理方式同平坦内存模型
{%endlist%}
{%right%}
非连续内存模型相当于多个平坦内存模型，避免了为巨大空洞分配page结构造成的内存资源浪费
{%endright%}
{%warning%}
当内存的不连续性过高，会导致node数目较多，开销较大
{%endwarning%}

**③稀疏内存模型**
>**概述**：物理内存视为多个`section`，**物理页大小**为`4k`的情况下，`section`大小为`128M`
{%list%}
每个section都有其page数组section_mem_map，且section结构使用全局数组mem_section组织
{%endlist%}
{%right%}
每个section都可以在系统运行时改变下线/上线状态，以便支持内存的热插拔
{%endright%}
{%warning%}
支持热插拔的内存只分配可迁移的内存页
{%endwarning%}
#### 2.2内存架构
**①UMA架构**
>**概述**：所有的`CPU`和**内存**连接到**一条总线**上
{%list%}
所有的CPU访问内存都要过总线，而且距离都是一样的，所以访问速度也是一样的，这种访问模式称为SMP
{%endlist%}
{%right%}
UMA架构可以使用上述三种内存模型，而NUMA架构只能使用非连续内存模型和稀疏内存模型
{%endright%}
{%warning%}
随着CPU的个数越来越多，总线的长度增加，导致访问延迟增加，且每个CPU的可用带宽会减少
{%endwarning%}

**②NUMA架构**
>**概述**：每个都`CPU`有其**本地内存**，`CPU`与其**本地内存**称为`NUMA`节点
{%list%}
一个NUMA节点中可能有多个CPU，即多个CPU共用一个本地内存
{%endlist%}
{%warning%}
CPU访问本地内存时速度最快，当本地内存不足而需要跨节点访问其他节点内存时速度较慢
{%endwarning%}
{%right%}
调整NUMA的内存分配策略，减少跨节点访问内存即可保持系统的高性能
{%endright%}
#### 2.3内存划分
**①节点**
>**概述**：`Linux`将物理内存依次划分为**节点**、**区域**和**页**，**节点描述符**`pglist_data`如下所示
{%list%}
每个节点对应一个NUMA节点，Linux使用一个全局数组node_data[]管理节点
{%endlist%}
{%right%}
Linux将UMA架构看作只有一个NUMA节点的NUMA架构，以便统一管理UMA架构和NUMA架构
{%endright%}
{%warning%}
每个节点都有备用节点列表，当本地节点内存不足时，会依次从备用节点申请内存
{%endwarning%}
```c
#ifdef CONFIG_NUMA
extern struct pglist_data *node_data[];
#define NODE_DATA(nid)  (node_data[(nid)])
```
```c
typedef struct pglist_data {
  /* 其余成员略 */
  int node_id;                          /* 节点id */
  struct page *node_mem_map;            /* 指向NUMA节点内管理所有物理页page的数组 */        
  unsigned long node_start_pfn;         /* NUMA节点内第一个物理页的pfn */ 
  unsigned long node_present_pages;     /* NUMA节点内所有可用的物理页个数（不包含内存空洞） */
  unsigned long node_spanned_pages;     /* NUMA节点内所有的物理页个数（包含内存空洞） */
  spinlock_t node_size_lock;            /* 保证多进程可以并发安全的访问NUMA节点 */
  int nr_zones;                         /* NUMA节点中的物理内存区域个数 */
  struct zone node_zones[MAX_NR_ZONES]; /* NUMA节点中的物理内存区域数组 */
  /* 备用NUMA节点列表，当本节点内存不足时，从这些节点申请内存 */
  struct zonelist node_zonelists[MAX_ZONELISTS];
}pg_data_t;
```
**②区域**
>**概述**：主要分为`ZONE_DMA`、`ZONE_DMA32`、`ZONE_NORMAL`和`ZONE_HIGHMEM`，**区域描述符**`zone`如下所示
{%list%}
ZONE_DMA/ZONE_DMA32、ZONE_NORMAL和ZONE_HIGHMEM按照物理内存地址从低到高进行排列布局
{%endlist%}
>`32`位系统中`0-16M`为`ZONE_DMA`，`16-896M`为`ZONE_NORMAL`，其余为`ZONE_HIGHMEM`
{%right%}
内核定义了虚拟内存区域ZONE_MOVABLE，在32/64位系统中其物理页来自于ZONE_HIGHMEM/ZONE_NORMAL
{%endright%}
{%warning%}
可迁移的page不一定全部在ZONE_MOVABLE中，但是ZONE_MOVABLE中的page一定是可迁移的
{%endwarning%}
>`ZONE_DMA/ZONE_DMA32`：用于**无法对全部物理内存进行寻址**的硬件设备进行`DMA`，后者只存在于`64`位系统

>`ZONE_NORMAL`：该区域物理页可以**直接映射**到内核中的虚拟内存，`32`位系统中用于**内核的直接映射区**

>`ZONE_HIGHMEM`：该区域物理页需要**动态映射**到内核中的虚拟内存，只存在于`32`位系统中
```c
struct zone {
  /* 其余成员略 */
  spinlock_t      lock;               /* 防止并发访问该内存区域 */
  const char      *name;              /* 内存区域名称 */
  struct pglist_data  *zone_pgdat;    /* 指向该内存区域所属的NUMA节点 */
  unsigned long       zone_start_pfn; /* 属于该内存区域中的第一个物理页PFN */
  unsigned long       zone_end_pfn;   /* 属于该内存区域中的最后一个物理页PFN */
  unsigned long       spanned_pages;  /* 该内存区域中所有的物理页个数（包含内存空洞） */
  unsigned long       present_pages;  /* 该内存区域所有可用的物理页个数（不包含内存空洞） */
} ____cacheline_internodealigned_in_smp;
```
**③页**
>**概述**：`Linux`默认支持的物理页大小为`4KB`即**磁盘块大小**，**页描述符**`page`如下所示
{%list%}
一个page可以被多个映射到多个虚拟内存区域中，如共享内存和写时复制
{%endlist%}
{%right%}
通过anon_vma_chain和anon_vma建立匿名页物理内存到虚拟内存的映射即反向映射，便于内存回收和迁移
{%endright%}
>建立**反向映射**后，可以直接找到**物理页**对应的**虚拟地址空间**，并使用**对应的页表**取消映射
{%warning%}
page结构访问频繁且数量庞大，使用大量的union结构根据不同场景保存不同类型数据，以节省内存
{%endwarning%}
```c
struct vm_area_struct {  
  struct list_head anon_vma_chain;
  struct anon_vma *anon_vma;   
}
```
```c
struct page {
  //存储page的定位信息如属于哪个节点、section和区域以及相关状态标志位
  unsigned long flags;       
  union {
    struct {
      // 用来指向物理页 page 被放置在了哪个 lru 链表上
      struct list_head lru;
      // 如果 page 为文件页的话，低位为0，指向 page 所在的 page cache
      // 如果 page 为匿名页的话，低位为1，指向其对应虚拟地址空间的匿名映射区 anon_vma
      struct address_space *mapping;
      // 如果 page 为文件页的话，index 为 page 在 page cache 中的索引
      // 如果 page 为匿名页的话，表示匿名页在对应进程虚拟内存区域 VMA 中的偏移
      pgoff_t index;
      // 在不同场景下，private 指向的场景信息不同
      unsigned long private;
    };
    
    struct {    
      /* slab相关属性 */
    };
    struct {
      /* 复合页相关属性 */
    };
    // 表示 slab 中需要释放回收的对象链表
    struct rcu_head rcu_head;
  };

  union { 
    // 表示该page映射了多少个进程的虚拟内存空间，一个page可以被多个进程映射
    atomic_t _mapcount;
  };

  // 内核中引用该物理页的次数，表示该物理页的活跃程度。
  atomic_t _refcount;

#if defined(WANT_PAGE_VIRTUAL)
  void *virtual;  // 内存页对应的虚拟内存地址
#endif 
} _struct_page_alignment;
```
***
### 3.Linux页表
#### 3.1引言
**①简介**
>**概述**：本质上被划分为多个**页表项**`PTE`的**物理内存页**，`32`位系统`PTE`占用`4`字节,`64`位系统`PTE`占用`8`字节
{%list%}
页表项不仅存储了虚拟页到物理页的映射关系，还记录了进程对物理内存的访问权限等信息
{%endlist%}
{%right%}
每个进程都有属于自己的页表，其顶级页表起始地址存放在mm_struct中，使用时会被转换并加载到cr3寄存器中
{%endright%}
{%warning%}
mm_struct中的pgd为顶级页表的虚拟内存地址，需要经过__sme_pa宏将其转换为物理内存地址才能被CPU使用
{%endwarning%}
```c
struct mm_struct {
  // 当前进程顶级页表的起始地址
  pgd_t * pgd;
}
```
**②分类**
>**概述**：可分为**用户态页表**和**内核态页表**，分别管理**内核态**和**用户态**的虚拟页到物理页的映射关系
{%list%}
内核态虚拟内存空间的mm_struct如下所示，在系统初始化时被创建，顶级页表起始地址为swapper_pg_dir
{%endlist%}
{%right%}
进程的页表分为两个部分，即进程的用户态页表以及内核页表的拷贝，进程进入内核态后就会使用内核页表的拷贝
{%endright%}
>操作页表时需要**加锁**，如果所有进程都使用**内核主页表**，则一个进程使用**内核主页表**时其余进程会被**阻塞**
{%warning%}
当进程的内核页表拷贝与主内核页表不同步时，进程在内核态就会发生缺页中断，同步主内核页表到进程页表中
{%endwarning%}
```c
struct mm_struct init_mm = {
  .mm_rb    = RB_ROOT,
  .pgd    = swapper_pg_dir,
  .mm_users  = ATOMIC_INIT(2),
  .mm_count  = ATOMIC_INIT(1),
  .mmap_sem  = __RWSEM_INITIALIZER(init_mm.mmap_sem),
  .page_table_lock =  __SPIN_LOCK_UNLOCKED(init_mm.page_table_lock),
  .mmlist    = LIST_HEAD_INIT(init_mm.mmlist),
  .user_ns  = &init_user_ns,
  INIT_MM_CONTEXT(init_mm)
};
```
**③MMU**
>**概述**：专门**对页表进行遍历**的地址翻译硬件，`CPU`将**虚拟地址**传递给`MMU`，`MMU`返回对应的**物理地址**
{%list%}
经常被MMU遍历的页表和页目录表等会被缓存到CPU的CACHE中，MMU会优先在CACHE中寻找页表和页目录表等
{%endlist%}
>`MMU`获取**物理地址**后，会先去`CPU`的`CACHE`中查找数据，若`cache hit`，则**访存操作**快速结束
{%right%}
MMU本身也有其硬件缓存TLB，专门用于存储经常访问的页表项PTE，若cache hit，可以直接获取对应PTE
{%endright%}
#### 3.2多级页表
**①单级页表**
>**概述**：虚拟地址格式为`页表偏移:页内偏移`，**页表项**`PTE`由**物理页起始地址**和**权限位**组成
{%list%}
访问虚拟地址时，根据页表偏移找到对应页表项，从而找到对应物理页，最后根据页内偏移找到对应字节
{%endlist%}
>`MMU`会从`cr3`寄存器中获取**顶级页表**的起始内存地址
{%warning%}
以32位系统为例，一个进程的单级页表需要使用4M连续内存，系统长时间运行后很难找到这么大的连续物理内存
{%endwarning%}
>`32`位系统`PTE`大小为`4`字节，可以映射`4K`**物理内存**
{%right%}
根据局部性原理，一定时间内只需要提供部分虚拟内存到物理内存的映射关系即可，这就有了多级页表
{%endright%}
**②多级页表**
>**概述**：以**二级页表**为例，虚拟地址格式为`页目录表偏移:页表偏移:页内偏移`，其中**页目录项**存储对应页表起始地址
{%list%}
访问虚拟地址时，先根据页目录表偏移找到页目录项，每个页目录项对应一张页表，随后寻址过程同单级页表
{%endlist%}
>对于`32`位系统，`Linux`使用**二级页表**，其中**页目录项**`PDE`和**页表项**`PTE`均为`4`个字节
{%right%}
初始时进程只有一张页目录表，占用4K内存，当访问页目录项时通过缺页异常加载对应页表即可
{%endright%}
>内存紧张时，不经常使用的**非顶级页表**可以被`swap out`到**磁盘**中，使用时再`swap in`到**内存**即可
{%warning%}
顶级页表即页目录表必须是常驻内存的，不允许swap
{%endwarning%}
#### 3.3缺页异常
**①简介**
>**概述**：当`MMU`根据对应虚拟地址遍历**进程页表**时，发现**表项为空**就会产生一个**缺页中断**
{%list%}
发生缺页异常时，进程将相关寄存器的值和错误码error_code压入内核栈中，并根据虚拟地址进入不同的处理逻辑
{%endlist%}
>当虚拟地址**大于**`TASK_SIZE_MAX`，说明缺页异常发生在**内核态**，反之发生在**用户态**
{%right%}
错误码指示缺页异常发生时的原因和相关状态，如bit0为0表示没有对应物理内存页，为1表示访问权限不够
{%endright%}
{%warning%}
缺页异常通常发生在用户空间和内核空间的vmalloc映射区
{%endwarning%}
>**内核空间**申请虚拟内存时一般都会**马上分配**对应的物理内存资源
```c
static noinline void
__do_page_fault(struct pt_regs *regs, unsigned long hw_error_code,
        unsigned long address)
{
  // mmap_sem 是进程虚拟内存空间 mm_struct 的读写锁
  // 内核将 mmap_sem 预取到 cacheline 中，并标记为独占状态
  prefetchw(&current->mm->mmap_sem);
  // 这里判断引起缺页异常的虚拟内存地址 address 是属于内核空间的还是用户空间的
  if (unlikely(fault_in_kernel_space(address)))
    // 缺页异常发生在内核态
    do_kern_addr_fault(regs, hw_error_code, address);
  else
    // 缺页异常发生在用户态
    do_user_addr_fault(regs, hw_error_code, address);
}
NOKPROBE_SYMBOL(__do_page_fault);
```
**②`do_kern_addr_fault`**
>**概述**：主要工作为处理内核虚拟内存空间中`vmalloc`**映射区**里的缺页异常
{%list%}
vmalloc申请虚拟内存后，会马上分配对应物理内存并在内核主页表中建立对应的映射
{%endlist%}
>当进程陷入**内核态**并访问`vmalloc`映射区时，会产生**缺页异常**
{%warning%}
进程页表的内核部分只是内核主页表的拷贝，vmalloc更新内核主页表后，还需要同步到进程页表的内核部分
{%endwarning%}
{%right%}
将内核主页表中缺页地址对应的顶级全局页目录项pgd同步到进程页表内核部分对应的pgd即可
{%endright%}
{%wrong%}
同步进程内核页表拷贝后还需要检查缺页地址是否映射了物理内存，如果没有进程会被kill
{%endwrong%}
```c
static void
do_kern_addr_fault(struct pt_regs *regs, unsigned long hw_error_code,unsigned long address)
{
  // 该缺页的内核地址 address 在内核页表中对应的 pte 不能使用保留位(X86_PF_RSVD = 0)
  // 不能是用户态的缺页中断(X86_PF_USER = 0)
  // 且不能是保护类型的缺页中断 (X86_PF_PROT = 0)
  if (!(hw_error_code & (X86_PF_RSVD | X86_PF_USER | X86_PF_PROT))) {
    // 处理 vmalloc 映射区里的缺页异常
    if (vmalloc_fault(address) >= 0)
      return;
  }
}  
```
```c
static noinline int vmalloc_fault(unsigned long address)
{
  // 分别是缺页虚拟地址 address 对应在内核主页表的全局页目录项 pgd_k ，以及进程页表中对应的全局页目录项 pgd
  pgd_t *pgd, *pgd_k;
  // p4d_t 用于五级页表体系，当前 cpu 架构体系下一般采用的是四级页表
  // 在四级页表下 p4d 是空的，pgd 的值会赋值给 p4d
  p4d_t *p4d, *p4d_k;
  // 缺页虚拟地址 address 对应在进程页表中的上层目录项 pud
  pud_t *pud;
  // 缺页虚拟地址 address 对应在进程页表中的中间目录项 pmd
  pmd_t *pmd;
  // 缺页虚拟地址 address 对应在进程页表中的页表项 pte
  pte_t *pte;

  // 确保缺页发生在内核 vmalloc 动态映射区
  if (!(address >= VMALLOC_START && address < VMALLOC_END))
    return -1;

  // 获取缺页虚拟地址 address 对应在进程页表的全局页目录项 pgd
  pgd = (pgd_t *)__va(read_cr3_pa()) + pgd_index(address);
  // 获取缺页虚拟地址 address 对应在内核主页表的全局页目录项 pgd_k
  pgd_k = pgd_offset_k(address);

  // 如果内核主页表中的 pgd_k 本来就是空的，说明 address 是一个非法访问的地址，返回 -1 
  if (pgd_none(*pgd_k))
    return -1;

  // 如果开启了五级页表，那么顶级页表就是 pgd，这里只需要同步顶级页表项就可以了
  if (pgtable_l5_enabled()) {
    // 内核主页表中的 pgd_k 不为空，进程页表中的 pgd 为空，那么就同步页表
    if (pgd_none(* )) {
      // 将主内核页表中的 pgd_k 内容复制给进程页表对应的 pgd
      set_pgd(pgd, *pgd_k);
      // 刷新 mmu
      arch_flush_lazy_mmu_mode();
    } else {
      BUG_ON(pgd_page_vaddr(*pgd) != pgd_page_vaddr(*pgd_k));
    }
  }

  // 四级页表体系下，p4d 是顶级页表项，同样也是只需要同步顶级页表项即可，同步逻辑和五级页表一模一样
  // 因为是四级页表，所以这里会将 pgd 赋值给 p4d，p4d_k ，后面就直接把 p4d 看做是顶级页表了。
  p4d = p4d_offset(pgd, address);
  p4d_k = p4d_offset(pgd_k, address);
  // 内核主页表为空，则停止同步，返回 -1 ，表示正在访问一个非法地址
  if (p4d_none(*p4d_k))
    return -1;
  // 内核主页表不为空，进程页表为空，则同步内核顶级页表项 p4d_k 到进程页表对应的 p4d 中，然后刷新 mmu
  if (p4d_none(*p4d) && !pgtable_l5_enabled()) {
    set_p4d(p4d, *p4d_k);
    arch_flush_lazy_mmu_mode();
  } else {
    BUG_ON(p4d_pfn(*p4d) != p4d_pfn(*p4d_k));
  }

  // 到这里，页表的同步工作就完成了，下面代码用于检查内核地址 address 在进程页表内核部分中是否有物理内存进行映射
  // 如果没有，则返回 -1 ,说明进程在访问一个非法的内核地址，进程随后会被 kill 掉
  // 返回 0 表示表示地址 address 背后是有物理内存映射的， vmalloc 动态映射区的缺页处理到此结束。

  // 根据顶级页目录项 p4d 获取 address 在进程页表中对应的上层页目录项 pud
  pud = pud_offset(p4d, address);
  if (pud_none(*pud))
    return -1;
  // 该 pud 指向的是 1G 大页内存
  if (pud_large(*pud))
    return 0;
    // 根据 pud 获取 address 在进程页表中对应的中间页目录项 pmd
  pmd = pmd_offset(pud, address);
  if (pmd_none(*pmd))
    return -1;
  // 该 pmd 指向的是 2M 大页内存
  if (pmd_large(*pmd))
    return 0;
  // 根据 pmd 获取 address 对应的页表项 pte
  pte = pte_offset_kernel(pmd, address);
  // 页表项 pte 并没有映射物理内存
  if (!pte_present(*pte))
    return -1;

  return 0;
}
```
**③`do_user_addr_fault`**
>**概述**：判断其属于哪个**虚拟内存区域**，并调用`handle_mm_fault`查找对应**页表项**`PTE`
{%list%}
首先需要逐级遍历页表寻找页表项，以二级页表为例，若页目录项为0则表明对应的的页表不存在，需要进行填充
{%endlist%}
>分配一个**物理内存页**作为页表，将该物理页的**起始物理内存地址**以及**初始权限位**填充该页目录项
{%right%}
找到页表项后，根据其权限位的设置解析出具体的缺页原因，并调用handle_pte_fault进行针对性的缺页处理
{%endright%}
>若**页表项**`PTE`为空，说明**缺页地址**没有对应的映射，需要**分配物理内存页**并**建立映射**

>若**页表项**`PTE`不为空，但是**物理内存页**被`swap out`到**磁盘**上，则需要将对应物理页`swap in`到**内存**中

>若**页表项**`PTE`不为空，但是`VMA`可写而`PTE`只读，说明缺页异常由**写时复制**导致
{%warning%}
如果缺页地址不属于任何一个虚拟内存区域，说明该地址未被分配，对该地址的访问是非法的
{%endwarning%}
```c
static vm_fault_t __handle_mm_fault(struct vm_area_struct *vma,
        unsigned long address, unsigned int flags)
{
  // vm_fault 结构用于封装后续缺页处理用到的相关参数
  struct vm_fault vmf = {
    // 发生缺页的 vma
    .vma = vma,
    // 引起缺页的虚拟内存地址
    .address = address & PAGE_MASK,
    // 处理缺页的相关标记 FAULT_FLAG_xxx
    .flags = flags,
    // address 在 vma 中的偏移，单位也页
    .pgoff = linear_page_index(vma, address),
    // 后续用于分配物理内存使用的相关掩码 gfp_mask
    .gfp_mask = __get_fault_gfp_mask(vma),
  };
  // 获取进程虚拟内存空间
  struct mm_struct *mm = vma->vm_mm;
  // 进程页表的顶级页表地址
  pgd_t *pgd;
  // 五级页表下会使用，在四级页表下 p4d 与 pgd 的值一样
  p4d_t *p4d;
  vm_fault_t ret;
  // 获取 address 在全局页目录表 PGD 中对应的目录项 pgd
  pgd = pgd_offset(mm, address);
  // 在四级页表下，这里只是将 pgd 赋值给 p4d，后续均已 p4d 作为全局页目录项
  p4d = p4d_alloc(mm, pgd, address);
  if (!p4d)
    return VM_FAULT_OOM;
  // 首先 p4d_none 判断全局页目录项 p4d 是否是空的
  // 如果 p4d 是空的，则调用 __pud_alloc 分配一个新的上层页目录表 PUD，然后填充 p4d
  // 如果 p4d 不是空的，则调用 pud_offset 获取 address 在上层页目录 PUD 中的目录项 pud
  vmf.pud = pud_alloc(mm, p4d, address);
  if (!vmf.pud)
    return VM_FAULT_OOM;

  /* 省略 1G 大页缺页处理 */
  
  // 首先 pud_none 判断上层页目录项 pud 是不是空的
  // 如果 pud 是空的，则调用 __pmd_alloc 分配一个新的中间页目录表 PMD，然后填充 pud
  // 如果 pud 不是空的，则调用 pmd_offset 获取 address 在中间页目录 PMD 中的目录项 pmd
  vmf.pmd = pmd_alloc(mm, vmf.pud, address);
  if (!vmf.pmd)
    return VM_FAULT_OOM;

  /* 省略 2M 大页缺页处理 */

  // 进行页表的相关处理以及解析具体的缺页原因，后续针对性的进行缺页处理
  return handle_pte_fault(&vmf);
}
```
```c
static vm_fault_t handle_pte_fault(struct vm_fault *vmf)
{
  pte_t entry;
  // 判断pte是否为空
  if (unlikely(pmd_none(*vmf->pmd))) {
    // 如果 pmd 是空的，说明现在连页表都没有，页表项 pte 自然是空的
    vmf->pte = NULL;
  } else {
    // 通过 pte_offset_map 定位到虚拟内存地址 address 对应在页表中的 pte
    vmf->pte = pte_offset_map(vmf->pmd, vmf->address);
    // vmf->orig_pte 表示发生缺页时，address 对应的 pte 值
    vmf->orig_pte = *vmf->pte;

    // 这里 pmd 不是空的，表示现在是有页表存在的，但缺页虚拟内存地址在页表中的 pte 是空值
    if (pte_none(vmf->orig_pte)) {
      pte_unmap(vmf->pte);
      vmf->pte = NULL;
    }
  }

  // pte 是空的，表示缺页地址 address 还从来没有被映射过，接下来就要处理物理内存的映射
  if (!vmf->pte) {
    // 判断缺页的虚拟内存地址 address 所在的虚拟内存区域 vma 是否是匿名映射区
    if (vma_is_anonymous(vmf->vma))
      // 处理匿名映射区发生的缺页
      return do_anonymous_page(vmf);
    else
      // 处理文件映射区发生的缺页
      return do_fault(vmf);
  }

  // pet 不为空但 pte 中的 p 位为 0 ，表示之前映射的物理内存页被swap out
  if (!pte_present(vmf->orig_pte))
    // 将之前映射的物理内存页从磁盘中重新 swap in 到内存中
    return do_swap_page(vmf);

  // 这里表示 pte 背后映射的物理内存页在内存中，但是不在当前进程运行的 numa 节点上
  // 将该 pte 标记为 _PAGE_PROTNONE（无读写，可执行权限）
  // do_numa_page 将该 page 迁移到进程运行的 numa 节点上
  if (pte_protnone(vmf->orig_pte) && vma_is_accessible(vmf->vma))
    return do_numa_page(vmf);

  entry = vmf->orig_pte;
  // 如果本次缺页中断是由写操作引起的
  if (vmf->flags & FAULT_FLAG_WRITE) {
    // 这里说明 vma 是可写的，但是 pte 被标记为不可写，说明是写保护类型的中断
    if (!pte_write(entry))
      // 进行写时复制处理，cow 就发生在这里
      return do_wp_page(vmf);
    // 如果 pte 是可写的，就将 pte 标记为脏页
    entry = pte_mkdirty(entry);
  }
  // 将 pte 的 access 比特位置 1 ，表示该 page 是活跃的，避免被 swap 出去
  entry = pte_mkyoung(entry);

  // 经过上面的缺页处理，这里会判断原来的页表项是否发生了变化
  // 如果发生了变化，就把 entry 更新到 vmf->pte 中。
  if (ptep_set_access_flags(vmf->vma, vmf->address, vmf->pte, entry,
              vmf->flags & FAULT_FLAG_WRITE)) {
    // pte 既然变化了，则刷新 mmu 
    update_mmu_cache(vmf->vma, vmf->address, vmf->pte);
  } else {
    // 如果 pte 内容本身没有变化，则不需要刷新任何东西
    // 但是有个特殊情况就是写保护类型中断，产生的写时复制，产生了新的映射关系，需要刷新一下 tlb
    if (vmf->flags & FAULT_FLAG_WRITE)
      flush_tlb_fix_spurious_fault(vmf->vma, vmf->address);
  }
  return 0;
}
```
#### 3.4缺页处理
**①`do_anonymous_page`**
>**概述**：处理**匿名页**的缺页异常，分配一个**物理页**并进行一些**善后工作**，最后补全**页表项**
{%list%}
分配物理页后，内核会为其建立反向映射，并将其添加到对应LUR链表中，最后刷新MMU
{%endlist%}
{%right%}
为了不妨碍其他进程使用页表，内核将pte的值先保存在entry中，最后将其赋予给真正的页表项
{%endright%}
{%warning%}
将entry赋予给真正的页表项前需要判断对应pte是否被其他进程填充，若已被填充就需要立即停止
{%endwarning%}
```c
static vm_fault_t do_anonymous_page(struct vm_fault *vmf)
{
  // 缺页地址 address 所在的虚拟内存区域 vma
  struct vm_area_struct *vma = vmf->vma;
  // 指向分配的物理内存页，后面与虚拟内存进行映射
  struct page *page;
  vm_fault_t ret = 0;
  // 临时的 pte 用于构建 pte 中的值，后续会赋值给 address 在页表中对应的真正 pte
  pte_t entry;

  // 如果 pmd 是空的，表示现在还没有一级页表
  // pte_alloc 这里会创建一级页表，并填充 pmd 中的内容
  if (pte_alloc(vma->vm_mm, vmf->pmd))
    return VM_FAULT_OOM;

  // 页表创建好之后，这里从伙伴系统中分配一个 4K 物理内存页出来
  page = alloc_zeroed_user_highpage_movable(vma, vmf->address);
  if (!page)
    goto oom;
  // 将 page 的 pfn 以及相关权限标记位 vm_page_prot 初始化一个临时 pte 出来 
  entry = mk_pte(page, vma->vm_page_prot);
  // 如果 vma 是可写的，则将 pte 标记为可写，脏页。
  if (vma->vm_flags & VM_WRITE)
    entry = pte_mkwrite(pte_mkdirty(entry));
  // 锁定一级页表，并获取 address 在页表中对应的真实 pte
  vmf->pte = pte_offset_map_lock(vma->vm_mm, vmf->pmd, vmf->address,
          &vmf->ptl);
  // 是否有其他线程在并发处理缺页
  if (!pte_none(*vmf->pte))
    goto release;
  // 增加 进程 rss 相关计数，匿名内存页计数 + 1
  inc_mm_counter_fast(vma->vm_mm, MM_ANONPAGES);
  // 建立匿名页反向映射关系
  page_add_new_anon_rmap(page, vma, vmf->address, false);
  // 将匿名页添加到 LRU 链表中
  lru_cache_add_active_or_unevictable(page, vma);
setpte:
  // 将 entry 赋值给真正的 pte，这里 pte 就算被填充好了，进程页表体系也就补齐了
  set_pte_at(vma->vm_mm, vmf->address, vmf->pte, entry);
  // 刷新 mmu 
  update_mmu_cache(vma, vmf->address, vmf->pte);
unlock:
  // 解除 pte 的映射
  pte_unmap_unlock(vmf->pte, vmf->ptl);
  return ret;
release:
  // 释放 page 
  put_page(page);
  goto unlock;
oom:
  return VM_FAULT_OOM;
}
```
**②`do_fault`**
>**概述**：处理**文件页**的缺页异常，根据不同的情况分别调用`do_read_fault`、`do_cow_fault`和`do_shared_fault`
{%list%}
do_read_fault处理读操作引起的缺页异常，do_cow_fault/do_shared_fault处理写私有/共享映射引起的缺页异常
{%endlist%}
{%warning%}
文件映射区缺页主要依靠vma->vm_ops->fault完成，当其为NULL时，视为异常
{%endwarning%}
```c
static vm_fault_t do_fault(struct vm_fault *vmf)
{
  struct vm_area_struct *vma = vmf->vma;
  struct mm_struct *vm_mm = vma->vm_mm;
  vm_fault_t ret;

  // 处理 vm_ops->fault 为 null 的异常情况
  if (!vma->vm_ops->fault) {
    // 如果中间页目录 pmd 指向的一级页表不在内存中，则返回 SIGBUS 错误
    if (unlikely(!pmd_present(*vmf->pmd)))
      ret = VM_FAULT_SIGBUS;
    else {
      // 获取缺页的页表项 pte
      vmf->pte = pte_offset_map_lock(vmf->vma->vm_mm,
                          vmf->pmd,
                          vmf->address,
                          &vmf->ptl);
      // pte 为空，则返回 SIGBUS 错误
      if (unlikely(pte_none(*vmf->pte)))
        ret = VM_FAULT_SIGBUS;
      else
        // pte 不为空，返回 NOPAGE，即本次缺页处理不会分配物理内存页
        ret = VM_FAULT_NOPAGE;

      pte_unmap_unlock(vmf->pte, vmf->ptl);
    }
  } else if (!(vmf->flags & FAULT_FLAG_WRITE))
    // 缺页如果是读操作引起的，进入 do_read_fault 处理
    ret = do_read_fault(vmf);
  else if (!(vma->vm_flags & VM_SHARED))
    // 缺页是由私有映射区的写入操作引起的，则进入 do_cow_fault 处理写时复制
    ret = do_cow_fault(vmf);
  else
    // 处理共享映射区的写入缺页
    ret = do_shared_fault(vmf);

  return ret;
}
```
**③`do_wp_page`**
>**概述**：当虚拟内存区域`vma`**有写权限**，而相关`PTE`**只有读权限**，会触发`do_wp_page`
{%list%}
对于引用计数为1的私有匿名页和者共享页，内核仅将物理页对应PTE权限改为可写，其余情况触发写时复制
{%endlist%}
{%right%}
写时复制：分配一个新物理页并拷贝原物理页内容，最后修改PTE映射到新物理页并将将原物理页引用计数减一
{%endright%}
{%warning%}
对于私有文件页，就算其引用计数为1也会触发写时复制
{%endwarning%}
```c
static vm_fault_t do_wp_page(struct vm_fault *vmf)
    __releases(vmf->ptl)
{
  struct vm_area_struct *vma = vmf->vma;
  // 获取 pte 映射的物理内存页
  vmf->page = vm_normal_page(vma, vmf->address, vmf->orig_pte);
  /* 处理特殊映射略 */
  // 物理内存页为匿名页的情况
  if (PageAnon(vmf->page)) {
    /* 处理ksm page相关逻辑略 */
    // reuse_swap_page 判断匿名页的引用计数是否为 1
    if (reuse_swap_page(vmf->page, &total_map_swapcount)) {
      // 如果当前物理内存页的引用计数为 1 ，并且只有当前进程在引用该物理内存页
      // 则不做写时复制处理，而是复用当前物理内存页，只是将 pte 改为可写即可 
      wp_page_reuse(vmf);
      return VM_FAULT_WRITE;
    }
    unlock_page(vmf->page);
  } else if (unlikely((vma->vm_flags & (VM_WRITE|VM_SHARED)) ==
                  (VM_WRITE|VM_SHARED))) {
    // 处理共享可写的内存页，也只是调用 wp_page_reuse 复用当前内存页
    // 对于文件页会额外调用一次 fault_dirty_shared_page 判断是否进行脏页的回写
    return wp_page_shared(vmf);
  }
copy:
  // 对于引用计数大于1的私有匿名页和私有文件页，会触发写时复制
  return wp_page_copy(vmf);
}
```
**④`do_swap_page`**
>**概述**：当内存页被**物理内存映射过**但是被内核`swap out`到磁盘中，会触发`do_swap_page`
{%list%}
当内存页被swap out到磁盘中，PTE变为swp_entry_t，指示了内存页在swap交换区和swap cache中的位置
{%endlist%}
>`swap_readpage`申请**新物理页**，并从交换区**读取对应内容**，最后将该物理页加入`swap cache`
{%warning%}
触发swap缺页异常时，内核会先去swap cache查找对应匿名页，如果没找到才会调用swap_readpage
{%endwarning%}
{%right%}
如果发生swap缺页异常对应页表项附近页表项也为swp_entry_t，内核会将对应的内容从交换区读取到swap cache
{%endright%}
```c
vm_fault_t do_swap_page(struct vm_fault *vmf)
{
  // 将缺页内存地址 address 对应的 pte 转换为 swp_entry_t
  entry = pte_to_swp_entry(vmf->orig_pte);  
  // 首先利用 swp_entry_t 到 swap cache 查找，看内存页已经其他进程被 swap in 进来
  page = lookup_swap_cache(entry, vma, vmf->address);
  swapcache = page;
  // 处理匿名页不在 swap cache 的情况
  if (!page) {
    // 通过 swp_entry_t 获取对应的交换区结构
    struct swap_info_struct *si = swp_swap_info(entry);
    // 针对 fast swap storage 比如 zram 等 swap 的性能优化，跳过 swap cache
    if (si->flags & SWP_SYNCHRONOUS_IO &&
            __swap_count(entry) == 1) {
      // 当只有单进程引用这个匿名页的时候，直接跳过 swap cache
      // 从伙伴系统中申请内存页 page，注意这里的 page 并不会加入到 swap cache 中
      page = alloc_page_vma(GFP_HIGHUSER_MOVABLE, vma,
                      vmf->address);
      if (page) {
          __SetPageLocked(page);
          __SetPageSwapBacked(page);
          set_page_private(page, entry.val);
          // 加入 lru 链表
          lru_cache_add_anon(page);
          // 直接从 fast storage device 中读取被换出的内容到 page 中
          swap_readpage(page, true);
      }
    } else {
      // 启动 swap 预读
      page = swapin_readahead(entry, GFP_HIGHUSER_MOVABLE,
                  vmf);
      swapcache = page;
    }

    // 因为涉及到了磁盘 IO，所以本次缺页异常属于 FAULT_MAJOR 类型
    ret = VM_FAULT_MAJOR;
    count_vm_event(PGMAJFAULT);
    count_memcg_event_mm(vma->vm_mm, PGMAJFAULT);
  } 

  // 现在之前被换出的内存页已经被内核重新 swap in 到内存中了。
  // 下面就是重新设置 pte，将原来页表中的 swp_entry_t 替换掉
  vmf->pte = pte_offset_map_lock(vma->vm_mm, vmf->pmd, vmf->address,
          &vmf->ptl);
  // 增加匿名页的统计计数
  inc_mm_counter_fast(vma->vm_mm, MM_ANONPAGES);
  // 减少 swap entries 计数
  dec_mm_counter_fast(vma->vm_mm, MM_SWAPENTS);
  // 根据被 swap in 进来的新内存页重新创建 pte
  pte = mk_pte(page, vma->vm_page_prot);
  // 用新的 pte 替换掉页表中的 swp_entry_t
  set_pte_at(vma->vm_mm, vmf->address, vmf->pte, pte);
  vmf->orig_pte = pte;

  // 建立新内存页的反向映射关系
  do_page_add_anon_rmap(page, vma, vmf->address, exclusive);
  // 将内存页添加到 lru 的 active list 中
  activate_page(page);
  // 释放交换区中的资源
  swap_free(entry);
  // 刷新 mmu cache
  update_mmu_cache(vma, vmf->address, vmf->pte);
  return ret;
}
```
#### 3.5文件页缺页
**①`do_read_fault`**
>**概述**：调用`__do_fault`从`page cache`获取对应文件页，并调用`finish_fault`将文件页映射到对应页表项`PTE`
{%list%}
__do_fault最终会调用对应文件系统的缺页处理函数，以ext4文件系统为例，会调用ext4_filemap_fault
{%endlist%}
{%warning%}
若文件页不在page cache中，会分配一个物理页，并从磁盘中读取对应文件内容填充该物理页
{%endwarning%}
{%right%}
根据局部性原理，从page cache获取文件页时，还会将与其相邻的若干文件页读取到page cache中
{%endright%}
```c
static vm_fault_t do_read_fault(struct vm_fault *vmf)
{
  struct vm_area_struct *vma = vmf->vma;
  vm_fault_t ret = 0;

  // map_pages 用于提前预先映射文件页相邻的若干文件页到相关 pte 中，从而减少缺页次数
  // fault_around_bytes 控制预先映射的的字节数默认初始值为 65536（16个物理内存页）
  if (vma->vm_ops->map_pages && fault_around_bytes >> PAGE_SHIFT > 1) {
    // 这里会尝试使用 map_pages 将缺页地址 address 附近的文件页预读进 page cache
    // 然后填充相关的 pte，目的是减少缺页次数
    ret = do_fault_around(vmf);
    if (ret)
      return ret;
  }

  // 如果不满足预先映射的条件，则只映射本次需要的文件页
  // 从 page cache 中读取文件页，如果 page cache 中不存在则从磁盘中读取，并预读若干文件页到 page cache 中
  ret = __do_fault(vmf);
  // 将本次缺页所需要的文件页映射到 pte 中。
  ret |= finish_fault(vmf);
  unlock_page(vmf->page);
  return ret;
}
```
```c
vm_fault_t ext4_filemap_fault(struct vm_fault *vmf)
{
  ret = filemap_fault(vmf);
  return ret;
}
vm_fault_t filemap_fault(struct vm_fault *vmf)
{
  int error;
  // 获取映射文件
  struct file *file = vmf->vma->vm_file;
  // 获取 page cache
  struct address_space *mapping = file->f_mapping;    
  // 获取映射文件的 inode
  struct inode *inode = mapping->host;
  // 获取映射文件内容在文件中的偏移
  pgoff_t offset = vmf->pgoff;
  // 从 page cache 读取到的文件页，存放在 vmf->page 中返回
  struct page *page;
  vm_fault_t ret = 0;

  // 根据文件偏移 offset，到 page cache 中查找对应的文件页
  page = find_get_page(mapping, offset);
  if (likely(page) && !(vmf->flags & FAULT_FLAG_TRIED)) {
    // 如果文件页在 page cache 中，则启动异步预读，预读后面的若干文件页到 page cache 中
    fpin = do_async_mmap_readahead(vmf, page);
  } else if (!page) {
    // 如果文件页不在 page cache，那么就需要启动 io 从文件中读取内容到 page cahe
    // 由于涉及到了磁盘 io ，所以本次缺页类型为 VM_FAULT_MAJOR
    count_vm_event(PGMAJFAULT);
    count_memcg_event_mm(vmf->vma->vm_mm, PGMAJFAULT);
    ret = VM_FAULT_MAJOR;
    // 启动同步预读，将所需的文件数据读取进 page cache 中并同步预读若干相邻的文件数据到 page cache 
    fpin = do_sync_mmap_readahead(vmf);
retry_find:
    // 尝试到 page cache 中重新读取文件页，这一次就可以读到了
    page = pagecache_get_page(mapping, offset,
                  FGP_CREAT|FGP_FOR_MMAP,
                  vmf->gfp_mask);
  }
  /* 其余流程略 */
}
```
**②`do_cow_fault`**
>**概述**：重新申请一个**物理页**，调用`__do_fault`读取文件页并将其**拷贝到新物理页**中，最后重新设置`PTE`
{%list%}
当刚使用mmap进行私有文件映射，还没有分配物理页就进行写入操作时会调用do_cow_fault
{%endlist%}
>如果**先读取该页**然后再对其进行**写操作**，内核会先调用`do_read_fault`，再调用`do_wp_page`
{%right%}
新物理页不在page cache，所以对该物理页的不会被回写到磁盘文件中
{%endright%}
{%warning%}
调用do_cow_fault前，对应文件页的PTE权限为只读，调用do_cow_fault后，对应文件页的PTE权限变为可写
{%endwarning%}
```c
static vm_fault_t do_cow_fault(struct vm_fault *vmf)
{
  struct vm_area_struct *vma = vmf->vma;
  vm_fault_t ret;
  // 从伙伴系统重新申请一个用于写时复制的物理内存页 cow_page
  vmf->cow_page = alloc_page_vma(GFP_HIGHUSER_MOVABLE, vma, vmf->address);
  // 从  page cache 读取原来的文件页
  ret = __do_fault(vmf);
  // 将原来文件页中的内容拷贝到 cow_page 中完成写时复制
  copy_user_highpage(vmf->cow_page, vmf->page, vmf->address, vma);
  // 将 cow_page 重新映射到缺页地址 address 对应在页表中的 pte 上。
  ret |= finish_fault(vmf);
  unlock_page(vmf->page);
  // 原来的文件页引用计数 - 1
  put_page(vmf->page);
  return ret;
}
```
**③`do_shared_fault`**
>**概述**：调用`__do_fault`读取文件页，并调用`finish_fault`将文件页映射到对应页表项`PTE`
{%list%}
当刚使用mmap进行共享文件映射，还没有分配物理页就进行写入操作时会触发do_shared_fault
{%endlist%}
>如果**先读取该页**，内核会调用`do_read_fault`，后续**写操作**不会产生**缺页中断**
{%warning%}
共享文件映射不会触发写时复制，所以对文件页的修改会直接落实到page cache中，需要将其标记为脏
{%endwarning%}
```c
static vm_fault_t do_shared_fault(struct vm_fault *vmf)
{
  struct vm_area_struct *vma = vmf->vma;
  vm_fault_t ret, tmp;
  // 从 page cache 中读取文件页
  ret = __do_fault(vmf);
  
  if (vma->vm_ops->page_mkwrite) {
    unlock_page(vmf->page);
    // 将文件页变为可写状态，并为后续记录文件日志做一些准备工作
    tmp = do_page_mkwrite(vmf);
  }

  // 将文件页映射到缺页 address 在页表中对应的 pte 上
  ret |= finish_fault(vmf);

  // 将 page 标记为脏页，记录相关文件系统的日志，防止数据丢失
  // 判断是否将脏页回写
  fault_dirty_shared_page(vma, vmf->page);
  return ret;
}
```

这些迁移之后的物理页，虽然物理内存地址发生变化，但是内核通过修改相应页表中虚拟内存地址与物理内存地址之间的映射关系，可以保证虚拟内存地址不会改变。