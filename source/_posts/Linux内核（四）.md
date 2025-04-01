---
title: Linux内核（四）
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
summary: kmalloc内存池和mmap系统调用
---
# Linux内核（四）
## 内存管理
### 1.kmalloc内存池
#### 1.1引言
**①简介**
>**概述**：本质上是不同`object size`的**通用级**`slab cache`，内核并**不会限制其用途**
{%list%}
内核将kmalloc内存池不同尺寸的slab cache相关信息定义在kmalloc_info[]数组中
{%endlist%}
{%right%}
如下所示，kmalloc_info[]从下标3开始，对应slab cache内存块大小为2^index
{%endright%}
>`kmalloc_info[1]`和`kmalloc_info[2]`为特殊尺寸的`slab cache`，分别为`96`字节和`192`字节
{%warning%}
因为内核对内存块的需求大部分在96字节和192字节附近，如果为此申请128字节和256字节，会造成浪费
{%endwarning%}

```c
const struct kmalloc_info_struct kmalloc_info[] __initconst = {
  {NULL,                      0},     {"kmalloc-96",             96},
  {"kmalloc-192",           192},     {"kmalloc-8",               8},
  {"kmalloc-16",             16},     {"kmalloc-32",             32},
  {"kmalloc-64",             64},     {"kmalloc-128",           128},
  {"kmalloc-256",           256},     {"kmalloc-512",           512},
  {"kmalloc-1k",           1024},     {"kmalloc-2k",           2048},
  {"kmalloc-4k",           4096},     {"kmalloc-8k",           8192},
  /* 其余略 */
};
```
**②尺寸块选择**
>**概述**：申请内存块大小在`192`字节以下时，采用`size_index[]`计算，其余采用`fls`函数计算
{%list%}
size_index[]每个元素为最佳合适尺寸的slab cache在kmalloc_info[]中的索引，注释为内核要申请的字节数上限
{%endlist%}
>`size_index[0]`表示申请内存块小于`8`字节时，采用`kmalloc_info[3]`对应的`slab cache`
{%right%}
kmalloc本质上是根据内核申请的内存块尺寸大小选取一个最佳合适尺寸的slab cache
{%endright%}
{%warning%}
slub支持的最小内存块尺寸为8字节大小，最大内存块尺寸为8k
{%endwarning%}
```c
static u8 size_index[24] __ro_after_init = {
    3,  /* 8 */
    4,  /* 16 */
    5,  /* 24 */
    5,  /* 32 */
    6,  /* 40 */
    6,  /* 48 */
    6,  /* 56 */
    6,  /* 64 */
    1,  /* 72 */
    1,  /* 80 */
    1,  /* 88 */
    1,  /* 96 */
    7,  /* 104 */
    7,  /* 112 */
    7,  /* 120 */
    7,  /* 128 */
    2,  /* 136 */
    2,  /* 144 */
    2,  /* 152 */
    2,  /* 160 */
    2,  /* 168 */
    2,  /* 176 */
    2,  /* 184 */
    2   /* 192 */
};
```
**③内存池架构**
>**概述**：`kmalloc`内存池架构如下所示，将其分为**内存属性**和**内存块尺寸**两个维度
{%list%}
kmalloc内存池内存来自于ZONE_DMA和ZONE_NORMAL物理区域，也就是内核虚拟内存空间中的直接映射区
{%endlist%}
{%right%}
内核在初始化内存子系统时，会创建并初始化kmalloc内存池，主要工作为create_kmalloc_caches
{%endright%}
```c
/* kmalloc内存池架构 */
struct kmem_cache *
kmalloc_caches[NR_KMALLOC_TYPES][KMALLOC_SHIFT_HIGH + 1]；
```
```c
/* kmalloc内存池属性 */
enum kmalloc_cache_type {
  // 规定 kmalloc 内存池的内存需要在 NORMAL 直接映射区分配
  KMALLOC_NORMAL = 0,
  // 规定 kmalloc 内存池中的内存是可以回收的，比如文件页缓存，匿名页
  KMALLOC_RECLAIM,
#ifdef CONFIG_ZONE_DMA
  // kmalloc 内存池中的内存用于 DMA，需要在 DMA 区域分配
  KMALLOC_DMA,
#endif
  NR_KMALLOC_TYPES
};
```
```c
void __init create_kmalloc_caches(slab_flags_t flags)
{
  int i, type;
  // 为每一个 kmalloc_cache_type 类型创建不同内存块尺寸的 slab cache
  for (type = KMALLOC_NORMAL; type <= KMALLOC_RECLAIM; type++) {
    // 这里会从 8B 尺寸的内存池开始创建，一直到创建完 8K 尺寸的内存池
    for (i = KMALLOC_SHIFT_LOW; i <= KMALLOC_SHIFT_HIGH; i++) {
      if (!kmalloc_caches[type][i])
        // 创建对应尺寸的 kmalloc 内存池，其中内存块大小为 2^i 字节
        new_kmalloc_cache(i, type, flags);
      // 创建 kmalloc-96 内存池管理 96B 尺寸的内存块
      if (KMALLOC_MIN_SIZE <= 32 && i == 6 &&
              !kmalloc_caches[type][1])
        new_kmalloc_cache(1, type, flags);
      // 创建 kmalloc-192 内存池管理 192B 尺寸的内存块
      if (KMALLOC_MIN_SIZE <= 64 && i == 7 &&
              !kmalloc_caches[type][2])
        new_kmalloc_cache(2, type, flags);
    }
  }
  // 当 kmalloc 体系全部创建完毕之后，slab 体系的状态就变为 up 状态了
  slab_state = UP;

// 如果配置了 DMA 内存区域，则需要为该区域也创建对应尺寸的内存池
#ifdef CONFIG_ZONE_DMA
  for (i = 0; i <= KMALLOC_SHIFT_HIGH; i++) {
    struct kmem_cache *s = kmalloc_caches[KMALLOC_NORMAL][i];

    if (s) {
      unsigned int size = kmalloc_size(i);
      const char *n = kmalloc_cache_name("dma-kmalloc", size);

      BUG_ON(!n);
      kmalloc_caches[KMALLOC_DMA][i] = create_kmalloc_cache(
          n, size, SLAB_CACHE_DMA | flags, 0, 0);
    }
  }
#endif
}
```
```c
static void __init
new_kmalloc_cache(int idx, int type, slab_flags_t flags)
{
  // 根据 kmalloc_info 数组中的信息创建对应的 kmalloc 内存池
  const char *name;
  // 为 slab cache 创建名称
  if (type == KMALLOC_RECLAIM) {
    flags |= SLAB_RECLAIM_ACCOUNT;
    // kmalloc_cache_name 就是做简单的字符串拼接
    name = kmalloc_cache_name("kmalloc-rcl",
                    kmalloc_info[idx].size);
    BUG_ON(!name);
  } else {
      name = kmalloc_info[idx].name;
  }
  
  // 底层调用 __kmem_cache_create 创建 kmalloc_info[idx].size 尺寸的 slab cache
  kmalloc_caches[type][idx] = create_kmalloc_cache(name,
                  kmalloc_info[idx].size, flags, 0,
                  kmalloc_info[idx].size);
}
```
#### 1.2分配与回收
**①分配机制**
>**概述**：内核提供`kmalloc`函数从`kmalloc`**内存池**中申请内存块
{%list%}
当申请内存块尺寸超过KMALLOC_MAX_CACHE_SIZE即8k时，kamlloc会直接从伙伴系统申请内存页
{%endlist%}
{%right%}
kmalloc_slab根据申请的内存块尺寸选取最佳匹配的kmalloc cache，kmalloc_type根据flag选取内存池类型
{%endright%}
```c
static __always_inline void *kmalloc(size_t size, gfp_t flags)
{
  return __kmalloc(size, flags);
}
```
```c
void *__kmalloc(size_t size, gfp_t flags)
{
  struct kmem_cache *s;
  void *ret;
  // 如果使用 kmalloc 申请超过 KMALLOC_MAX_CACHE_SIZE 大小的内存，则直接走伙伴系统
  if (unlikely(size > KMALLOC_MAX_CACHE_SIZE))
    // 底层调用 alloc_pages 向伙伴系统申请超过 2页 的内存块
    return kmalloc_large(size, flags);
  // 根据申请内存块的尺寸 size，在 kmalloc_caches 缓存中选择合适尺寸的内存池
  s = kmalloc_slab(size, flags);
  // 向选取的 slab cache 申请内存块
  ret = slab_alloc(s, flags, _RET_IP_);
  return ret;
}
```
```c
struct kmem_cache *kmalloc_slab(size_t size, gfp_t flags)
{
  unsigned int index;
  // 如果申请的内存块 size 在 192 字节以下，则通过 size_index 数组定位 kmalloc_caches 缓存索引
  // 从而获取到最佳合适尺寸的内存池 slab cache
  if (size <= 192) {
    if (!size)
      return ZERO_SIZE_PTR;
    // 根据申请的内存块 size，定义 size_index 数组索引，从而获取 kmalloc_caches 缓存的 index
    index = size_index[size_index_elem(size)];
  } else {
      // 如果申请的内存块 size 超过 192 字节，则通过 fls 定位 kmalloc_caches 缓存的 index
      // fls 可以获取参数的最高有效 bit 的位数，比如 fls(0)=0，fls(1)=1，fls(4) = 3
    index = fls(size - 1);
  }
  // 根据 kmalloc_type 以及 index 获取最佳尺寸的内存池 slab cache
  return kmalloc_caches[kmalloc_type(flags)][index];
}
```
```c
static __always_inline enum kmalloc_cache_type kmalloc_type(gfp_t flags)
{
#ifdef CONFIG_ZONE_DMA
  // 通常情况下 kmalloc 内存池中的内存都来源于 NORMAL 直接映射区
  // 如果没有特殊设定，则从 NORMAL 直接映射区里分配
  if (likely((flags & (__GFP_DMA | __GFP_RECLAIMABLE)) == 0))
    return KMALLOC_NORMAL;

  // DMA 区域中的内存是非常宝贵的，如果明确指定需要从 DMA 区域中分配内存
  // 则选取 DMA 区域中的 kmalloc 内存池
  return flags & __GFP_DMA ? KMALLOC_DMA : KMALLOC_RECLAIM;
#else
  // 明确指定了从 RECLAIMABLE 区域中获取内存，则选取 RECLAIMABLE 区域中 kmalloc 内存池，该区域中的内存页是可以被回收的，比如：文件页缓存
  return flags & __GFP_RECLAIMABLE ? KMALLOC_RECLAIM : KMALLOC_NORMAL;
#endif
}
```
**②回收机制**
>**概述**：内核提供`kfree`函数释放内存块回`kmalloc`**内存池**
{%list%}
若内存块所在page不属于slab体系，则说明申请时走的是伙伴系统，使用__free_pages将其释放回伙伴系统
{%endlist%}
```c
void kfree(const void *x)
{
  struct page *page;
  // x 为要释放的内存块的虚拟内存地址
  void *object = (void *)x;
  // 通过虚拟内存地址找到内存块所在的 page
  page = virt_to_head_page(x);
  // 如果 page 不在 slab cache 的管理体系中，则直接释放回伙伴系统
  if (unlikely(!PageSlab(page))) {
    __free_pages(page, order);
    return;
  }
  // 将内存块释放回其所在的 slub 中
  slab_free(page->slab_cache, page, object, NULL, 1, _RET_IP_);
}
```
### 2.mmap系统调用
#### 2.1引言
**①简介**
>**概述**：在进程虚拟空间的**映射段**划分出一个`NMA`建立内存映射，可分为**匿名映射**和**文件映射**，**函数原型**如下所示
{%list%}
如果用户传入的addr不合法或已经存在映射关系，且没有设置MAP_FIXED，内核会自动选取一个合适的addr
{%endlist%}
>通常将`addr`设置为`NULL`，让内核决定虚拟映射区**起始地址**
{%right%}
flags参数的枚举值可以相互组合，常用组合有私有匿名映射、共享匿名映射、私有文件映射和共享文件映射
{%endright%}
{%warning%}
addr、length和offset必须要按照PAGE_SIZE（4K）内存对齐
{%endwarning%}
```c
// addr：内存映射在进程虚拟内存空间中的起始地址
// length：申请虚拟内存的大小
// port：对应申请VMA的vm_page_prot，指定VMA的访问权限
// flags：对应申请VMA的vm_flags，指定映射方式
// fd：如果建立的是文件映射，则fd为对应文件的描述符，反之设置为-1
// offset：文件映射区域在文件中偏移
void* mmap(void* addr, size_t length, int prot, int flags, int fd, off_t offset);
```
```c
/* 常用port */
#define PROT_READ 0x1   /* 映射的物理内存可读 */
#define PROT_WRITE 0x2  /* 映射的物理内存可写 */
#define PROT_EXEC 0x4   /* 映射的物理内存可执行 */
#define PROT_NONE 0x0   /* 映射的物理内存不能访问，不能读写，也不能执行 */
```
```c
/* 常用flags */
#define MAP_FIXED   0x10        /* 强制使用用户设定的地址 */
#define MAP_ANONYMOUS   0x20    /* 匿名映射 */

#define MAP_SHARED  0x01        /* 共享内存 */
#define MAP_PRIVATE 0x02        /* 私有映射 */
```
**②内存映射**
>**概述**：`mmap`调用`ksys_mmap_pgoff`，该函数对**文件映射**进行预处理并调用`vm_mmap_pgoff`开始**内存映射**
{%list%}
mmap进行内存映射时只会分配一段虚拟内存，并建立虚拟内存和相关文件的映射关系，不会为映射分配物理内存
{%endlist%}
>当这段**虚拟内存**被`cpu`访问时会触发**缺页中断**，此时才会分配**物理内存**并在页表中建立映射
{%right%}
如果在flags中设置MAP_POPULATE或者MAP_LOCKED，物理内存的分配会提前发生
{%endright%}
>`mm_populate`会依次扫描所分配虚拟内存的**每一个虚拟页**并触发**缺页异常**，从而分配**物理内存**
```c
SYSCALL_DEFINE6(mmap, unsigned long, addr, unsigned long, len,
        unsigned long, prot, unsigned long, flags,
        unsigned long, fd, unsigned long, off)
{         
  error = ksys_mmap_pgoff(addr, len, prot, flags, fd, off >> PAGE_SHIFT);
}
```
```c
unsigned long ksys_mmap_pgoff(unsigned long addr, unsigned long len,
                  unsigned long prot, unsigned long flags,
                  unsigned long fd, unsigned long pgoff)
{
  struct file *file = NULL;
  unsigned long retval;

  // 预处理文件映射
  if (!(flags & MAP_ANONYMOUS)) {
    /* 过程略 */
  }
  flags &= ~(MAP_EXECUTABLE | MAP_DENYWRITE);
  // 开始内存映射
  retval = vm_mmap_pgoff(file, addr, len, prot, flags, pgoff);
out_fput:
  if (file)
    // file 引用计数减 1
    fput(file);
  return retval;
}
```
```c
unsigned long vm_mmap_pgoff(struct file *file, unsigned long addr,
    unsigned long len, unsigned long prot,
    unsigned long flag, unsigned long pgoff)
{
  unsigned long ret;
  // 获取进程虚拟内存空间
  struct mm_struct *mm = current->mm;
  // 是否需要为映射的 VMA，提前分配物理内存页，避免后续的缺页
  // 取决于 flag 是否设置了 MAP_POPULATE 或者 MAP_LOCKED，这里的 populate 表示需要分配物理内存的大小
  unsigned long populate;

  ret = security_mmap_file(file, prot, flag);
  if (!ret) {
    // 对进程虚拟内存空间加写锁保护，防止多线程并发修改
    if (down_write_killable(&mm->mmap_sem))
      return -EINTR;
    // 开始 mmap 内存映射，在进程虚拟内存空间中分配一段 vma，并建立相关映射关系
    // ret 为映射虚拟内存区域的起始地址
    ret = do_mmap_pgoff(file, addr, len, prot, flag, pgoff,
                &populate, &uf);
    // 释放写锁
    up_write(&mm->mmap_sem);
    if (populate)
      // 提前分配物理内存页面，后续访问不会缺页
      // 为 [ret , ret + populate] 这段虚拟内存立即分配物理内存
      mm_populate(ret, populate);
  }
  return ret;
}
```
**③`do_mmap_pgoff`**
>**概述**：`do_mmap_pgoff`会调用`do_mmap`找到一段**未映射的虚拟内存区域**，为其分配并设置`vma`结构
{%list%}
如果设置了MAP_LOCKED，表示mmap背后映射的物理内存锁定在内存中，不允许swap
{%endlist%}
{%right%}
get_unmapped_area会根据映射种类调用对应函数分配虚拟内存，最终都会落实到mm->get_unmapped_area
{%endright%}
{%warning%}
mmap申请虚拟内存时，会依据overcommit策略结合物理内存容量和swap分区大小判断是否允许该次分配
{%endwarning%}
{%wrong%}
如果进程申请的虚拟内存远超过物理内存，运行过程中会产生频繁的swap甚至oom，导致性能下降严重。
{%endwrong%}
```c
unsigned long do_mmap(struct file *file, unsigned long addr,
            unsigned long len, unsigned long prot,
            unsigned long flags, vm_flags_t vm_flags,
            unsigned long pgoff, unsigned long *populate,
            struct list_head *uf)
{
  struct mm_struct *mm = current->mm;
  /* 参数校验，过程略 */
  // 这里需要检查 VMA 的个数是否超过最大限制
  if (mm->map_count > sysctl_max_map_count)
    return -ENOMEM;

  // 在进程虚拟内存空间中寻找一块未映射的虚拟内存范围
  addr = get_unmapped_area(file, addr, len, pgoff, flags);

  // 根据 prot 和 flag 设置 vm_flags 和 vm_prot
  vm_flags |= calc_vm_prot_bits(prot, pkey) | calc_vm_flag_bits(flags) |
          mm->def_flags | VM_MAYREAD | VM_MAYWRITE | VM_MAYEXEC;

  // 设置了 MAP_LOCKED，表示用户期望 mmap 背后映射的物理内存锁定在内存中，不允许 swap
  if (flags & MAP_LOCKED)
    // 这里需要检查是否可以将本次映射的物理内存锁定
    if (!can_do_mlock())
      return -EPERM;
  // 进一步检查锁定的内存页数是否超过了内核限制
  if (mlock_future_check(mm, vm_flags, len))
    return -EAGAIN;

  /* 其他vm_flags 相关细节略 */

  // 如果设置了MAP_NORESERVE，内核不会考虑overcommit策略，一定能分配虚拟内存
  if (flags & MAP_NORESERVE) {
    // 如果内核静止 overcommit ，则一定能分配虚拟内存
    if (sysctl_overcommit_memory != OVERCOMMIT_NEVER)
      // 设置 VM_NORESERVE 表示无论申请多大的虚拟内存，内核总会答应
      vm_flags |= VM_NORESERVE;

    // 大页内存是提前预留出来的，并且本身就不会被 swap
    // 所以不需要像普通内存页那样考虑 swap space 的限制因素
    if (file && is_file_hugepages(file))
      vm_flags |= VM_NORESERVE;
  }
  // 这里就是 mmap 内存映射的核心
  addr = mmap_region(file, addr, len, vm_flags, pgoff, uf);

  // 当 mmap 设置了 MAP_POPULATE 或者 MAP_LOCKED 标志
  // 那么在映射完之后，需要立马为这块虚拟内存分配物理内存页，后续访问就不会发生缺页了
  if (!IS_ERR_VALUE(addr) &&
      ((vm_flags & VM_LOCKED) ||
        (flags & (MAP_POPULATE | MAP_NONBLOCK)) == MAP_POPULATE))
      // 设置需要分配的物理内存大小
      *populate = len;
  return addr
}
```
**④`mmap_region`**
>**概述**：为申请**虚拟内存区域**分配`vma`结构，并根据**映射方式**对`vma`进行**初始化**
{%list%}
vma_link将当前vma按照地址的增长方向插入到mm_struct->mmap链表以及mm_struct->mm_rb红黑树中
{%endlist%}
{%right%}
内核分配vma结构前会检查所申请虚拟内存区域能否和已有虚拟内存区域合并，从而简化流程
{%endright%}
{%warning%}
如果设置了MAP_FIXED且用户指定的映射区和已有映射区发生重叠，需要取消已有映射并将其重新映射
{%endwarning%}
```c
unsigned long mmap_region(struct file *file, unsigned long addr,
        unsigned long len, vm_flags_t vm_flags, unsigned long pgoff,
        struct list_head *uf)
{
  struct mm_struct *mm = current->mm;
  struct vm_area_struct *vma, *prev;
  int error;
  struct rb_node **rb_link, *rb_parent;
  unsigned long charged = 0;

  // 检查本次映射是否超过了进程虚拟内存空间中的虚拟内存容量的限制，超过则返回 false
  if (!may_expand_vm(mm, vm_flags, len >> PAGE_SHIFT)) {
    unsigned long nr_pages;

    // 如果 mmap 指定了 MAP_FIXED，用户指定的映射区和已有映射区发生重叠，需要取消已有映射
    // 计算进程地址空间中与指定映射区[addr, addr + len]重叠的虚拟内存页数 nr_pages
    nr_pages = count_vma_pages_range(mm, addr, addr + len);
    // nr_pages 表示重叠的虚拟内存部分，不需要额外申请
    // 重新检查是否超过虚拟内存相关区域的限额
    if (!may_expand_vm(mm, vm_flags,(len >> PAGE_SHIFT) - nr_pages))
      return -ENOMEM;
  }
  // 调用 do_munmap 将重叠的映射部分解除掉，后续会重新映射这部分
  while (find_vma_links(mm, addr, addr + len, &prev, &rb_link,&rb_parent)) {
    if (do_munmap(mm, addr, len, uf))
      return -ENOMEM;
  }
  
  // 根据申请虚拟内存 vma 的性质以及 overcommit 策略判断是否允许本次虚拟内存的申请
  if (accountable_mapping(file, vm_flags)) {
    charged = len >> PAGE_SHIFT;
    // 虚拟内存的申请一旦这里通过之后，后续发生缺页，内核将会有足够的物理内存为其分配，不会发生 OOM
    if (security_vm_enough_memory_mm(mm, charged))
      return -ENOMEM;
    // 凡是设置了 VM_ACCOUNT 的 VMA，表示这段虚拟内存均已经过 vm_enough_memory 的检测
    // 当虚拟内存发生缺页的时候，内核会有足够的物理内存分配，而不会导致 OOM  
    vm_flags |= VM_ACCOUNT;
  }

  // 为了精细化的控制内存的开销，内核这里首先需要尝试看能不能和地址空间中已有的 vma 进行合并
  vma = vma_merge(mm, prev, addr, addr + len, vm_flags,
          NULL, file, pgoff, NULL, NULL_VM_UFFD_CTX);
  if (vma)
    // 如果可以合并，则虚拟内存分配过程结束
    goto out;

  // 如果不可以合并，则只能从 slab 中取出一个新的 vma 结构来
  vma = vm_area_alloc(mm);
  if (!vma) {
    error = -ENOMEM;
    goto unacct_error;
  }
  // 根据我们要映射的虚拟内存区域属性初始化 vma 结构中的相关字段
  vma->vm_start = addr;
  vma->vm_end = addr + len;
  vma->vm_flags = vm_flags;
  vma->vm_page_prot = vm_get_page_prot(vm_flags);
  vma->vm_pgoff = pgoff;

  /* 根据映射类型进行不同的处理，略 */

  // 将当前 vma 按照地址的增长方向插入到进程虚拟内存空间的 mm_struct->mmap 链表以及mm_struct->mm_rb 红黑树中
  // 并建立文件与 vma 的反向映射
  vma_link(mm, vma, prev, rb_link, rb_parent);

  file = vma->vm_file;
out:
  // 更新地址空间 mm_struct 中的相关统计变量
  vm_stat_account(mm, vm_flags, len >> PAGE_SHIFT);
  return addr;
}
```
#### 2.2文件映射
**①私有文件映射**
>**概述**：`flags`为`MAP_PRIVATE`，表示申请到的内存区域为**进程私有**，对应**文件物理页**
{%list%}
第一次访问该内存区域时，会触发文件页缺页异常
{%endlist%}
>内核首先在文件`page cache`中查找是否有**对应文件页**，有则增加**页引用计数**并建立**映射关系**

>如果没有则**重新分配**一个物理页，将其加入`page cache`，并**读取文件内容**填充该物理页，后续同上
{%right%}
私有文件映射中文件页的权限是只读的，当进程第一次写该页时，会触发缺页异常进行写时复制
{%endright%}
>内核**重新申请**一个物理页，将`page cache`**对应文件页**内容拷贝到该内存页中，并**映射到新物理页**，权限为**可写**
{%warning%}
私有文件映射对重新申请的物理页的修改不会被回写到磁盘上
{%endwarning%}
```c
struct vm_area_struct {
  struct file * vm_file;      /* 虚拟内存空间映射的文件 */
  unsigned long vm_pgoff;     /* Offset (within vm_file) in PAGE_SIZE */
}
```
**②共享文件映射**
>**概述**：`flags`为`MAP_SHARED`，表示申请到的内存区域为**进程共享**，对应**文件物理页**
{%list%}
类似于私有文件映射，但其文件页的权限一开始就是可写的
{%endlist%}
>所以进程对**该段内存区域的读写**都会直接发生在`page cache`的对应文件页上，并且会被**回写到磁盘上**
{%right%}
共享文件映射常用于多进程之间共享内存以及多进程之间的通讯
{%endright%}

**③源码实现**
>**概述**：设置`vma->vm_file`并调用`call_mmap`将`vma->vm_ops`设置为**对应文件系统**的操作函数
{%list%}
call_mmap调用file->f_op->mmap，将所申请虚拟区域的操作函数替换为对应文件系统的操作函数
{%endlist%}
{%right%}
call_mmap即为文件映射的本质，使得读写内存操作变为对应读写文件系统操作
{%endright%}
```c
unsigned long mmap_region(struct file *file, unsigned long addr,
        unsigned long len, vm_flags_t vm_flags, unsigned long pgoff,
        struct list_head *uf)
{
  // 文件映射
  if (file) {
    // 将文件与虚拟内存映射起来
    vma->vm_file = get_file(file);
    // 将虚拟内存区域 vma 的操作函数 vm_ops 映射成文件的操作函数（和具体文件系统有关）
    error = call_mmap(file, vma);
    if (error)
      goto unmap_and_free_vma;

    addr = vma->vm_start;
    vm_flags = vma->vm_flags;
  } 
}
```
```c
static inline int call_mmap(struct file *file, struct vm_area_struct *vma)
{
  return file->f_op->mmap(file, vma);
}
```
#### 2.3私有映射
**①私有匿名映射**
>**概述**：`flags`为`MAP_PRIVATE | MAP_ANONYMOUS`，表示申请到的内存区域为**进程私有**，对应**匿名物理页**
{%list%}
第一次访问该内存区域时，会触发匿名页缺页异常，内核会分配物理页并将其内容初始化为0，最后建立映射关系
{%endlist%}
{%right%}
私有匿名映射常用于申请虚拟内存，如malloc，当申请内存大于128K时，就会调用mmap采用该方式申请堆内存
{%endright%}
>当`malloc`申请内存**小于**`128K`时，会调用`do_brk`移动`brk`指针在**堆段**申请内存

**②共享匿名映射**
>**概述**：`flags`为`MAP_SHARED | MAP_ANONYMOUS`，表示申请到的内存区域为**进程共享**，对应**匿名物理页**
{%list%}
类似于共享文件映射，但是其映射的文件为tmpfs的虚拟文件系统中的一个匿名文件
{%endlist%}
>`tmpfs`基于内存实现，**匿名文件**也有自己的`inode`结构体以及`page cache`
{%warning%}
共享匿名文件映射只适用于父子进程间的通讯，因为其他进程无法知道该进程关联的匿名文件
{%endwarning%}
{%right%}
子进程会拷贝父进程的所有资源，其中包括父进程关联到匿名文件的虚拟内存区域
{%endright%}
**③源码实现**
>**概述**：调用`vma_set_anonymous`处理**私有匿名映射**，调用`shmem_zero_setup`处理**共享匿名映射**
{%list%}
私有匿名映射并不涉及与文件之间的映射，所以vma_set_anonymous将vma->vm_ops设置为NULL

{%endlist%}
{%right%}
shmem_zero_setup在文件系统tmpfs中创建一个虚拟文件，其余操作类似于文件映射
{%endright%}
>将`vma->vm_file`设置为申请到的**虚拟文件**并将`vma->vm_ops`设置为`shmem_vm_ops`
```c
unsigned long mmap_region(struct file *file, unsigned long addr,
        unsigned long len, vm_flags_t vm_flags, unsigned long pgoff,
        struct list_head *uf)
{
  /* 其余流程略 */
  else if (vm_flags & VM_SHARED) {
    // 这里处理共享匿名映射
    // 前面提到共享匿名映射依赖于 tmpfs 文件系统中的匿名文件
    // 父子进程通过这个匿名文件进行通讯
    // 该函数用于在 tmpfs 中创建匿名文件，并映射进当前共享匿名映射区 vma 中
    error = shmem_zero_setup(vma);
    if (error)
      goto free_vma;
  } else {
    // 这里处理私有匿名映射
    // 将  vma->vm_ops 设置为 null，只有文件映射才需要 vm_ops 这样才能将内存与文件映射起来
    vma_set_anonymous(vma);
  }
}
```
```c
int shmem_zero_setup(struct vm_area_struct *vma)
{
  struct file *file;
  loff_t size = vma->vm_end - vma->vm_start;
  // tmpfs 中获取一个匿名文件
  file = shmem_kernel_file_setup("dev/zero", size, vma->vm_flags);
  if (IS_ERR(file))
      return PTR_ERR(file);

  if (vma->vm_file)
    // 如果 vma 中已存在其他文件，则解除与其他文件的映射关系
    fput(vma->vm_file);
  
  // 将 tmpfs 中的匿名文件映射进虚拟内存区域 vma 中
  // 后续 fork 子进程的时候，父子进程就可以通过这个匿名文件实现共享匿名映射 
  vma->vm_file = file;
  // 对这块共享匿名映射区相关操作这里直接映射成 shmem_vm_ops
  vma->vm_ops = &shmem_vm_ops;

  return 0;
}
```