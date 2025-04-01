---
title: Linux内核（二）
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
summary: 物理内存分配与回收
---
# Linux内核（二）
## 内存管理
### 1.内存回收
#### 1.1引言
**①预留内存**
>**概述**：每个**物理内存区域**预留了一部分内存，用于内核的一些**不允许内存分配失败**的核心操作
{%list%}
当进程处于中断上下文或临界区时不允许阻塞，其内存分配的请求必须马上获得满足，可能需要使用预留内存
{%endlist%}
{%right%}
当高位内存区域内存不足时，内核会降级到低位内存区域进行分配
{%endright%}
>当`ZONE_HIGHMEM`内存不足时，会降级到`ZONE_NORMAL`中分配内存，如果依旧不足，会降级到`ZONE_DMA`中分配
{%warning%}
低位内存区域有其特殊用途，所以每个内存区域需要预留内存，防止其被无限制挤压占用
{%endwarning%}
```c
struct zone {
  unsigned long nr_reserved_highatomic;  /* 表示该物理内存区域预留内存的大小，必须大于lowmem_reserve对应项 */
  long lowmem_reserve[MAX_NR_ZONES];     /* 规定每个物理区域必须为自己保留的物理页数量 */
}
```
**②内存水位线**
>**概述**：内核为`NUMA`节点的**每个区域**设置了指示**内存容量**的水位线`WMARK_MIN`、 `WMARK_LOW`和`WMARK_HIGH`
{%list%}
当剩余内存高于WMARK_LOW和WMARK_HIGH时，表明可以满足进程的内存分配需求
{%endlist%}
{%right%}
当剩余内存处于WMARK_MIN与WMARK_LOW间时，会唤醒kswapd进程后台内存回收直至高于WMARK_HIGH
{%endright%}
{%warning%}
当剩余内存低于WMARK_MIN时，会阻塞请求内存的进程并进行直接内存回收直到内存回收完毕
{%endwarning%}
>位于`WMARK_MIN`以下的内存容量是预留给内核在**紧急情况**下使用的**预留内存**
```c
struct zone {
  // 物理内存区域中的水位线
  unsigned long _watermark[NR_WMARK];
  // 优化内存碎片对内存分配的影响，可以动态改变内存区域的基准水位线。
  unsigned long watermark_boost;
} ____cacheline_internodealigned_in_smp;
```
**③冷热页**
>**概述**：**热页**即**已经加载**进`CPU`高速缓存的物理内存页，**冷页**即**准备但还未加载**进`CPU`高速缓存的物理内存页
{%list%}
每个物理内存区域都有一个per_cpu_pages结构链表用于管理所有CPU的冷热页
{%endlist%}
{%right%}
per_cpu_pages结构中的lists数组保存了各个迁移类型的冷热页双向链表，热页在链表的头部，冷页在链表的尾部
{%endright%}
{%warning%}
虽然内存区域只关联到一个特定的CPU，但是可以被其他CPU访问，所以其他CPU高速缓存可以包含该区域物理页
{%endwarning%}
```c
struct zone {
  /* 管理系统中所有CPU高速缓存冷热页的链表 */
  struct per_cpu_pages __percpu *per_cpu_pageset;

  int pageset_high;   /* 如果冷热页的数量超过了high，释放batch个页到伙伴系统中 */
  int pageset_batch;  /* 每次批量向CPU高速缓存填充或者释放的物理页面个数 */
} ____cacheline_internodealigned_in_smp;
```
```c
/* 管理每个CPU高速缓存冷热页 */
struct per_cpu_pages {
  /* 其余成员略 */
  int count;  /* 包含的物理页数量，当其为0时，会从伙伴系统添加batch个页 */
  int high;   /* 如果冷热页的数量超过了high，释放batch个页到伙伴系统中 */
  int batch;  /* 每次批量向CPU高速缓存填充或者释放的物理页面个数 */
  /* 保存各种迁移类型的冷热页的链表数组 */
  struct list_head lists[NR_PCP_LISTS];
};
```
#### 1.2内存规整
**①迁移类型**
>**概述**：内核支持的迁移类型主要有**可移动**、**可回收**、**不可移动**、**保留内存**和**无法分配**
{%list%}
用户态程序申请页面通常是可移动的，文件系统的cache通常是可回收的，内核申请页面通常是不可移动的
{%endlist%}
{%right%}
可移动页面虚拟内存地址不变，但可以改变其在物理内存中的位置，只需要修改页表映射关系即可
{%endright%}
{%warning%}
页面的迁移类型是可以改变的，详细见伙伴系统分配流程
{%endwarning%}
```c
enum migratetype {
  MIGRATE_UNMOVABLE,    /* 不可移动 ，一般位于内核直接映射区*/
  MIGRATE_MOVABLE,      /* 可移动，一般用于用户空间 */
  MIGRATE_RECLAIMABLE,  /* 不可移动，但是可回收，如文件缓存页和DMA缓冲区的内存页 */
  MIGRATE_PCPTYPES,     /* CPU高速缓存中的页面类型 */
  MIGRATE_HIGHATOMIC = MIGRATE_PCPTYPES, /* 预留内存 */
#ifdef CONFIG_CMA
  MIGRATE_CMA, /* 预留的连续内存CMA */
#endif
#ifdef CONFIG_MEMORY_ISOLATION
  MIGRATE_ISOLATE, /* 跨NUMA节点移动的内存页类型 */
#endif
  MIGRATE_TYPES // 不代表任何区域，只是单纯表示一共有多少个迁移类型
};
```
**②规整方式**
>**概述**：系统**长时间运行**后，**内存碎片**越来越多，内核使用**直接内存规整**和**后台内存规整**整理内存碎片
{%list%}
内核为每个节点分配了一个kcompactd内线程，用于后台内存规整，不会阻塞进程的执行
{%endlist%}
>**直接内存规整**和**后台内存规整**最终都会调用`compact_zone()`，以`zone`为单位进行规整
{%right%}
内存规整会将空闲的内存页迁移至区域头部，已分配的内存页迁移至区域尾部，形成一整块足够大的连续内存区域
{%endright%}
>分别从**头部**和**尾部**开始扫描一个区域，并使用两个链表记录**已分配页面**和**空闲页面**

>当扫描到**同一个页面**时扫描结束，将从头部扫描到的**已分配页面**和从尾部扫描的**空闲页面**交换位置即可
{%warning%}
内存规整只能整理可移动的页面
{%endwarning%}
```c
typedef struct pglist_data {
  // 内存规整进程
  struct task_struct *kcompactd;
  wait_queue_head_t kcompactd_wait;
} pg_data_t;
```
#### 1.3内存回收
**①文件页和匿名页**
>**概述**：**文件页**的数据来自于**磁盘文件**，**匿名页**的数据来自于**进程活动**如`malloc`
{%list%}
文件页存放在对应文件的页高速缓存中，匿名页存放在对应匿名映射区中，均用mapping表示，如下所示
{%endlist%}
>内核的**每个文件**都有一个属于自己的**页高速缓存**`page cache`，被文件的`inode`所持有

>内核**首次读取文件**时，依据局部性原理，会将读取的**磁盘数据**存放在`page cache`中
{%right%}
当进程再次读取读文件页中的数据时，内核直接会从page cache中获取并拷贝给进程，省去了读取磁盘的开销
{%endright%}

```c
struct page {
  // 如果page为文件页的话，低位为0，指向page所在的page cache
  // 如果page为匿名页的话，低位为1，指向其对应虚拟地址空间的匿名映射区anon_vma
  struct address_space *mapping;
  // 如果page为文件页的话，index为page在page cache中的索引
  // 如果page为匿名页的话，表示匿名页在对应进程虚拟内存区域VMA中的偏移
  pgoff_t index; 
}
```
**②活跃页和非活跃页**
>**概述**：**活跃页**即访问**非常频繁**的物理内存页，**非活跃页**即访问**不怎么频繁**的物理内存页
{%list%}
内核根据不同的情况将物理页放入不同的LRU链表中，如匿名页active/inactive链表和文件页active/inactive链表等
{%endlist%}
>对于**文件页**，**第一次读取**时放在其`inactive`链表的**头部**，对于**匿名页**，**第一次读取**时放在其`active`链表的**尾部**

>**继续访问**则直接提升至`active`链表**头部**，反之被推到`inactive`链表的**头部/尾部**
{%right%}
内核回收内存时，回收优先级为inactive链表尾部 > inactive 链表头部 > active 链表尾部 > active 链表头部
{%endright%}
{%warning%}
匿名页的换出swap out成本更大，内核会对匿名页更加优待，会优先扫描文件页的activ/inactive链表
{%endwarning%}
>可以通过调整`swappiness`内核参数控制**回收匿名页**的积极程度，`swappiness`越大，越倾向于**回收匿名页**
```c
struct page {
  struct list_head lru; /* 指向被放置在哪个链表中 */
  atomic_t _refcount;   /*记录内核引用该物理页的次数，表示该物理页的活跃程度 */
}
```
```c
typedef struct pglist_data {
  //LRU链表管理结构，包含上述提到的LUR链表
	struct lruvec		lruvec;
} pg_data_t;
```
**③回收机制**
>**概述**：内存回收方式主要有**后台内存回收**、**直接内存回收**和`OOM`机制，在**不同条件**下被触发
{%list%}
对于非脏文件页，直接回收即可，对于匿名页，需要将其先保存在某个磁盘分区即swap文件/分区中，再回收
{%endlist%}
{%warning%}
当进程修改过文件页但是没有同步回磁盘时，该文件页为脏页，需要先将脏页回写到磁盘中才能进行回收
{%endwarning%}
>内核会根据一定条件唤醒**专门回写脏页**的`pflush`**内核线程**
{%right%}
内核为每个节点分配了一个kswapd内线程，用于后台内存回收，不会阻塞进程的执行
{%endright%}
>**后台内存回收**和**直接内存回收**最终都会调用`shrink_lruvec()`扫描**LRU链表**并**按照规则**回收物理页
{%wrong%}
当后台内存回收和直接内存回收后均无法满足要求，会触发OOM机制，按照一定规则杀死某个进程释放其内存
{%endwrong%}
```c
typedef struct pglist_data {
  // 页面回收进程
  struct task_struct *kswapd;
  wait_queue_head_t kswapd_wait;
} pg_data_t;
```
### 2.内存分配
#### 2.1核心接口
**①`alloc_pages`**
>**概述**：`alloc_pages`**函数原型**如下所示，功能为使用**伙伴系统**分配`2^N`个**物理连续**的物理页
{%list%}
该函数返回值为分配内存块的第一个物理内存页的page结构指针，其余内存分配接口都是基于alloc_pages实现
{%endlist%}
{%right%}
__get_free_pages基于alloc_pages实现，获取物理页page后将其映射到虚拟地址空间中，并返回虚拟地址
{%endright%}
{%warning%}
alloc_pages申请到的内存页数据不是空白的，可能包含一些敏感信息
{%endwarning%}
{%wrong%}
在内核中释放内存需要十分小心，因为内核完全信赖自己，如果传递了错误的内存释放参数会导致系统崩溃
{%endwrong%}
```c
/* 内存分配接口 */
struct page *alloc_pages(gfp_t gfp, unsigned int order);           /* 分配2^N页内存 */
#define alloc_page(gfp_mask) alloc_pages(gfp_mask, 0)              /* 分配单内存页 */
unsigned long __get_free_pages(gfp_t gfp_mask, unsigned int order);/* 分配2^N页内存，并获取虚拟内存地址 */
#define __get_free_page(gfp_mask)  __get_free_pages((gfp_mask), 0) /* 分配单内存页，并获取虚拟内存地址 */
```
```c
/* 内存释放接口 */
void __free_pages(struct page *page, unsigned int order);          /* 根据page结构指针释放2^N页 */
#define __free_page(page) __free_pages((page), 0)                  /* 根据page结构指针释放单页内存 */
void free_pages(unsigned long addr, unsigned int order);           /* 根据虚拟内存地址释放2^N页 */
#define free_page(addr) free_pages((addr), 0)                      /* 根据虚拟内存地址释放单页内存 */
```
**②`gfp_mask`掩码**
>**概述**：用于指定从**哪个内存区域**分配内存、物理页**迁移类型**以及**内存分配的行为规范**
{%list%}
如果gfp_mask没有指定内存区域，内核会默认从ZONE_NORMAL区域中分配内存
{%endlist%}
{%right%}
内核定义了各种标准情形下用到的gfp_t掩码组合，详细如下所示，其中GFP_KERNEL为内核最常用的标志
{%endright%}
{%warning%}
单独设置__GFP_MOVABLE并不会影响内核分配内存时的区域选择，只能指示分配页面的迁移类型为可移动
{%endwarning%}
>`32`位系统需要同时指定`__GFP_MOVABLE`和`__GFP_HIGHMEM`才会从`ZONE_MOVABLE`区域分配内存
```c
#define GFP_ATOMIC (__GFP_HIGH|__GFP_ATOMIC|__GFP_KSWAPD_RECLAIM)      
#define GFP_KERNEL (__GFP_RECLAIM | __GFP_IO | __GFP_FS)               
#define GFP_NOWAIT (__GFP_KSWAPD_RECLAIM)
#define GFP_NOIO (__GFP_RECLAIM)
#define GFP_NOFS (__GFP_RECLAIM | __GFP_IO)
#define GFP_USER (__GFP_RECLAIM | __GFP_IO | __GFP_FS | __GFP_HARDWALL)
#define GFP_DMA  __GFP_DMA
#define GFP_DMA32 __GFP_DMA32
#define GFP_HIGHUSER (GFP_USER | __GFP_HIGHMEM)
```
**③`__alloc_pages`**
>**概述**：`alloc_pages`最终会调用`__alloc_pages`在**本地节点**进行内存分配，代码如下所示
{%list%}
alloc_context结构用于在不同内存分配辅助函数中传递内存分配参数，核心参数为preferred_zoneref
{%endlist%}
>`preferred_zoneref`即满足`gfp_mask`以及**内存水平线**等要求的**优先级最高**的区域

{%right%}
若节点内存在内存水位线高于WMARK_LOW的区域，则使用get_page_from_freelist在该区域进行快速内存配
{%endright%}
>`get_page_from_freelist`遍历`alloc_context`中的`zonelist`，找到**合适的内存区域**并使用**伙伴系统**分配内存
{%warning%}
若快速内存分配失败则说明内存不足，内核需要做一些工作再进行内存分配，封装在__alloc_pages_slowpath
{%endwarning%}
```c
struct page *__alloc_pages(gfp_t gfp, unsigned int order, int preferred_nid,
                            nodemask_t *nodemask)
{
  // 用于指向分配成功的内存
  struct page *page;
  // 内存区域中的剩余内存需要在 WMARK_LOW 水位线之上才能进行快速内存分配
  unsigned int alloc_flags = ALLOC_WMARK_LOW;
  // 内存分配掩码
  gfp_t alloc_gfp; 
  // 用于在不同内存分配辅助函数中传递参数
  struct alloc_context ac = { };
  // 检查用于向伙伴系统申请内存容量的分配阶 order 的合法性
  if (WARN_ON_ONCE_GFP(order >= MAX_ORDER, gfp))
    return NULL;
  // 表示在内存分配期间进程可以休眠阻塞
  gfp &= gfp_allowed_mask;

  alloc_gfp = gfp;
  // 初始化alloc_context，并为接下来的快速内存分配设置相关gfp
  if (!prepare_alloc_pages(gfp, order, preferred_nid, nodemask, &ac,
          &alloc_gfp, &alloc_flags))
    // 提前判断本次内存分配是否能够成功，如果不能则尽早失败
    return NULL;

  // 避免内存碎片化的相关分配标识设置，可暂时忽略
  alloc_flags |= alloc_flags_nofragment(ac.preferred_zoneref->zone, gfp);

  // 进行快速内存分配
  page = get_page_from_freelist(alloc_gfp, order, alloc_flags, &ac);
  if (likely(page))
    // 如果内存分配成功则直接返回
    goto out;
  // 流程走到这里表示内存分配在快速路径下失败
  // 这里需要恢复最初的内存分配标识设置，后续会尝试更加激进的内存分配策略
  alloc_gfp = gfp;
  // 恢复最初的 nodemask 因为它可能在第一次内存分配的过程中被改变
  // 本函数中 nodemask 起初被设置为 null
  ac.nodemask = nodemask;

  // 在第一次快速内存分配失败之后，说明内存已经不足了，内核需要做更多的工作
  // 尝试慢速内存分配路径
  page = __alloc_pages_slowpath(alloc_gfp, order, &ac);

out:
  // 内存分配成功，直接返回 page，否则返回 NULL
  return page;
}
```
```c
struct alloc_context {
  // 运行进程CPU所在NUMA节点以及其所有备用NUMA节点中允许内存分配的内存区域
  struct zonelist *zonelist;
  // NUMA节点状态掩码
  nodemask_t *nodemask;
  // 内存分配优先级最高的内存区域zone
  struct zoneref *preferred_zoneref;
  // 根据gfp_mask掩码获取物理内存页的迁移类型
  int migratetype;
  // 根据gfp_mask掩码中的内存区域修饰符获取内存分配最高优先级的内存区域zone类型
  enum zone_type highest_zoneidx;
  // 是否允许当前NUMA节点中的脏页均衡扩散迁移至其他NUMA节点
  bool spread_dirty_pages;
};
```
#### 2.2慢速内存分配
**①参数设置**
>**概述**：设置影响**内存分配行为**的参数，如`costly_order`、`alloc_flags`和`gfp_mask`
{%list%}
若申请内存块的阶数超过PAGE_ALLOC_COSTLY_ORDER，内核将其视为代价较大的内存分配行为，将影响OOM
{%endlist%}
{%right%}
根据alloc_flags进入不同的内存分配逻辑处理分支
{%endright%}
{%warning%}
因为后续的内存回收非常耗时可能导致进程阻塞休眠，所以可能需要修改gfp_mask
{%endwarning%}
```c
static inline struct page *
__alloc_pages_slowpath(gfp_t gfp_mask, unsigned int order,struct alloc_context *ac){
  // 设置 __GFP_DIRECT_RECLAIM 表示允许内核进行直接内存回收
  bool can_direct_reclaim = gfp_mask & __GFP_DIRECT_RECLAIM;
  // 当order大于PAGE_ALLOC_COSTLY_ORDER（内核将其定义为3）时，内核认为这次内存分配是代价较大的
  const bool costly_order = order > PAGE_ALLOC_COSTLY_ORDER;
  // 用于指向成功申请的内存
  struct page *page = NULL;
  // 内存分配标识，后续会根据不同标识进入到不同的内存分配逻辑处理分支
  unsigned int alloc_flags;
  // 后续用于记录直接内存回收了多少内存页
  unsigned long did_some_progress;
  // 关于内存整理相关参数
  enum compact_priority compact_priority;
  enum compact_result compact_result;
  int compaction_retries;
  // 记录重试的次数，超过一定的次数（16次）则内存分配失败
  int no_progress_loops;
  // 临时保存调整后的内存分配策略
  int reserve_flags;
  // 修改gfp_mask，因为接下来的直接内存回收非常耗时可能会导致进程阻塞睡眠，不适用于__GFP_ATOMIC
  if (WARN_ON_ONCE((gfp_mask & (__GFP_ATOMIC|__GFP_DIRECT_RECLAIM)) ==
              (__GFP_ATOMIC|__GFP_DIRECT_RECLAIM)))
    gfp_mask &= ~__GFP_ATOMIC;
retry_cpuset:

        ......... 调整内存分配策略 alloc_flags 采用更加激进方式获取内存 ......
        ......... 此时内存分配主要是在进程所允许运行的 CPU 相关联的 NUMA 节点上 ......
        ......... 内存水位线下调至 WMARK_MIN ...........
        ......... 唤醒所有 kswapd 进程进行异步内存回收  ...........
        ......... 触发直接内存整理 direct_compact 来获取更多的连续空闲内存 ......

retry:

        ......... 进一步调整内存分配策略 alloc_flags 使用更加激进的非常手段进行内存分配 ...........
        ......... 在内存分配时忽略内存水位线 ...........
        ......... 触发直接内存回收 direct_reclaim ...........
        ......... 再次触发直接内存整理 direct_compact ...........
        ......... 最后的杀手锏触发 OOM 机制  ...........

nopage:
        ......... 经过以上激进的内存分配手段仍然无法满足内存分配就会来到这里 ......
        ......... 如果设置了 __GFP_NOFAIL 不允许内存分配失败，则不停重试上述内存分配过程 ......

fail:
        ......... 内存分配失败，输出告警信息 ........

      warn_alloc(gfp_mask, ac->nodemask,
            "page allocation failure: order:%u", order);
got_pg:
        ......... 内存分配成功，返回新申请的内存块 ........
}
```
**②`retry_cpuset`**
>**概述**：将**内存水位线**下调至`WMARK_MIN`，并开启**异步内存回收进程**`kswapd`和**直接内存整理**`direct_compact`
{%list%}
gfp_to_alloc_flags根据新的gfp_mask调整alloc_flags，将内存分配水位线要求下调为WMARK_MIN
{%endlist%}
{%right%}
放低内存水位线要求后很可能就能成功分配内存，所以设置alloc_flags后会调用get_page_from_freelist进行尝试
{%endright%}
{%warning%}
如果上述尝试失败，内核会进行直接内存整理，如果依旧无法满足需求，开启后台内存规整进程进入retry
{%endwarning%}
```c
static inline struct page *
__alloc_pages_slowpath(gfp_t gfp_mask, unsigned int order,struct alloc_context *ac){
        ......... 初始化慢速内存分配路径下的相关参数 .......
retry_cpuset:
  // 根据gfp_mask调整alloc_flags，将内存分配水位线下调为WMARK_MIN
  alloc_flags = gfp_to_alloc_flags(gfp_mask);

  // 重新按照新的设置按照内存区域优先级计算zonelist的迭代起点（最高优先级的 zone）
  ac->preferred_zoneref = first_zones_zonelist(ac->zonelist,
                  ac->highest_zoneidx, ac->nodemask);
  // 如果没有合适的内存分配区域，则跳转到nopage, 内存分配失败
  if (!ac->preferred_zoneref->zone)
    goto nopage;
  // 唤醒所有的kswapd进程异步回收内存
  if (alloc_flags & ALLOC_KSWAPD)
    wake_all_kswapds(order, gfp_mask, ac);

  // 此时已经调整了alloc_flags，放低内存水位线要求，看看能否成功分配
  page = get_page_from_freelist(gfp_mask, order, alloc_flags, ac);
  if (page)
    // 内存分配成功，跳转到 got_pg 直接返回 page
    goto got_pg;

  // 若调整内存水位线后依旧不能满足要求，则尝试进行内存规整
  if (can_direct_reclaim &&
          (costly_order ||
              (order > 0 && ac->migratetype != MIGRATE_MOVABLE))
          && !gfp_pfmemalloc_allowed(gfp_mask)) {
    //进行直接内存规整并分配内存
    page = __alloc_pages_direct_compact(gfp_mask, order,
                    alloc_flags, ac,
                    INIT_COMPACT_PRIORITY,
                    &compact_result);
    if (page)
      goto got_pg;
    // 内存规整后依旧没有足够的内存分配且设置了NORETRY标识不允许重试，则跳转到nopage
    if (costly_order && (gfp_mask & __GFP_NORETRY)) {
      if (compact_result == COMPACT_SKIPPED ||
        compact_result == COMPACT_DEFERRED)
        goto nopage;
      // 同步内存整理开销太大，后续开启异步内存整理
      compact_priority = INIT_COMPACT_PRIORITY;
    }
  }
retry:

        ......... 进一步调整内存分配策略 alloc_flags 使用更加激进的非常手段进行内存分配 ...........
        ......... 在内存分配时忽略内存水位线 ...........
        ......... 触发直接内存回收 direct_reclaim ...........
        ......... 再次触发直接内存整理 direct_compact ...........
        ......... 最后的杀手锏触发 OOM 机制  ...........

nopage:
        ......... 经过以上激进的内存分配手段仍然无法满足内存分配就会来到这里 ......
        ......... 如果设置了 __GFP_NOFAIL 不允许内存分配失败，则不停重试上述内存分配过程 ......

fail:
        ......... 内存分配失败，输出告警信息 ........
got_pg:
  return page;
}
```
**③`retry`**
>**概述**：采用更激进的**分配策略**，逐步进行**直接内存回收**`direct_reclaim`、**直接内存整理**`direct_compact`和`OOM`
{%list%}
__gfp_pfmemalloc_flags根据gfp_mask调整alloc_flags，忽略内存水位线并允许从预留内存中获取内存
{%endlist%}
{%right%}
调整内存分配策略后很可能就能成功分配内存，所以设置alloc_flags后会调用get_page_from_freelist进行尝试
{%endright%}
{%warning%}
如果上述尝试失败且满足一定条件，内核会不断尝试直接内存回收、直接内存整理和OOM，否则进入nopage
{%endwarning%}
```c
static inline struct page *
__alloc_pages_slowpath(gfp_t gfp_mask, unsigned int order,struct alloc_context *ac){
        ......... 初始化慢速内存分配路径下的相关参数 .......
retry_cpuset:

        ......... 调整内存分配策略 alloc_flags 采用更加激进方式获取内存 ......
        ......... 此时内存分配主要是在进程所允许运行的 CPU 相关联的 NUMA 节点上 ......
        ......... 内存水位线下调至 WMARK_MIN ...........
        ......... 唤醒所有 kswapd 进程进行异步内存回收  ...........
        ......... 触发直接内存整理 direct_compact 来获取更多的连续空闲内存 ......
retry:
  // 确保所有kswapd进程不要意外进入睡眠状态
  if (alloc_flags & ALLOC_KSWAPD)
    wake_all_kswapds(order, gfp_mask, ac);
  // 修改alloc_flags，忽略内存水位线影响，并允许使用预留内存
  reserve_flags = __gfp_pfmemalloc_flags(gfp_mask);
  if (reserve_flags)
    alloc_flags = gfp_to_alloc_flags_cma(gfp_mask, reserve_flags);

  // 如果内存分配可以任意跨节点分配，需要重置nodemask以及zonelist。
  if (!(alloc_flags & ALLOC_CPUSET) || reserve_flags) {
    // 这里的内存分配是高优先级系统级别的内存分配，不是面向用户的
    ac->nodemask = NULL;
    ac->preferred_zoneref = first_zones_zonelist(ac->zonelist,
                ac->highest_zoneidx, ac->nodemask);
  }

  // 这里使用重新调整的zonelist和alloc_flags在尝试进行一次内存分配
  page = get_page_from_freelist(gfp_mask, order, alloc_flags, ac);
  if (page)
    goto got_pg;

  // 在忽略内存水位线的情况下仍然分配失败，现在内核就需要进行直接内存回收了
  if (!can_direct_reclaim)
    // 如果进程不允许进行直接内存回收，则只能分配失败
    goto nopage;

  // 开始直接内存回收，并尝试分配内存
  page = __alloc_pages_direct_reclaim(gfp_mask, order, alloc_flags, ac,
                          &did_some_progress);
  if (page)
    goto got_pg;

  // 直接内存回收之后仍然无法满足分配需求，则再次进行直接内存整理
  page = __alloc_pages_direct_compact(gfp_mask, order, alloc_flags, ac,
                  compact_priority, &compact_result);
  if (page)
    goto got_pg;

  // 在内存直接回收和整理全部失败之后，如果不允许重试，则只能失败
  if (gfp_mask & __GFP_NORETRY)
    goto nopage;

  // 若costly_order为true，内核倾向于直接失败，除非设置了__GFP_RETRY_MAYFAIL
  if (costly_order && !(gfp_mask & __GFP_RETRY_MAYFAIL))
    goto nopage;

  // 判断是否需要重试内存回收
  if (should_reclaim_retry(gfp_mask, order, ac, alloc_flags,
                did_some_progress > 0, &no_progress_loops))
    goto retry;

  // 判断是否需要重试内存规整
  if (did_some_progress > 0 &&
          should_compact_retry(ac, order, alloc_flags,
              compact_result, &compact_priority,
              &compaction_retries))
    goto retry;

  // 根据nodemask中的内存分配策略判断是否应该在进程所允许运行的所有CPU关联的NUMA节点上重试
  if (check_retry_cpuset(cpuset_mems_cookie, ac))
    goto retry_cpuset;

  // 最后的杀手锏，进行OOM，选择一个得分最高的进程，释放其占用的内存 
  page = __alloc_pages_may_oom(gfp_mask, order, ac, &did_some_progress);
  if (page)
    goto got_pg;

  // 只要OOM产生了作用并回收内存did_some_progress大于0，则不断进行重试
  if (did_some_progress) {
    no_progress_loops = 0;
    goto retry;
  }

nopage:
        ......... 经过以上激进的内存分配手段仍然无法满足内存分配就会来到这里 ......
        ......... 如果设置了 __GFP_NOFAIL 不允许内存分配失败，则不停重试上述内存分配过程 ......
fail:  
      warn_alloc(gfp_mask, ac->nodemask,
            "page allocation failure: order:%u", order);
got_pg:
  return page;
}
```
**④`nopage`**
>**概述**：如果设置了`__GFP_NOFAIL`，内核会在这里尝试**跨节点分配内存**并不断跳转到`retry`分支进行**重试**
{%list%}
配置__GFP_NOFAIL表示此次内存分配非常的重要，不允许失败
{%endlist%}
{%warning%}
在跳转到retry分支前，内核会调用cond_resched()让CPU运行其他进程，防止其他进程饥饿
{%endwarning%}
{%right%}
运行其他进程时，kswapd进程一直在后台异步回收内存，当CPU重新回到当前进程时说不定已经回收了足够的内存
{%endright%}
```c
static inline struct page *
__alloc_pages_slowpath(gfp_t gfp_mask, unsigned int order,struct alloc_context *ac)
{
        ......... 初始化慢速内存分配路径下的相关参数 .......

retry_cpuset:

        ......... 调整内存分配策略 alloc_flags 采用更加激进方式获取内存 ......
        ......... 此时内存分配主要是在进程所允许运行的 CPU 相关联的 NUMA 节点上 ......
        ......... 内存水位线下调至 WMARK_MIN ...........
        ......... 唤醒所有 kswapd 进程进行异步内存回收  ...........
        ......... 触发直接内存整理 direct_compact 来获取更多的连续空闲内存 ......

retry:

        ......... 进一步调整内存分配策略 alloc_flags 使用更加激进的非常手段尽心内存分配 ...........
        ......... 在内存分配时忽略内存水位线 ...........
        ......... 触发直接内存回收 direct_reclaim ...........
        ......... 再次触发直接内存整理 direct_compact ...........
        ......... 最后的杀手锏触发 OOM 机制  ...........

nopage:
  //但是如果设置了__GFP_NOFAIL 表示不允许内存分配失败，那么接下来就会进入if分支进行处理
  if (gfp_mask & __GFP_NOFAIL) {
      // 如果不允许进行直接内存回收，则跳转至 fail 分支宣告失败
      if (WARN_ON_ONCE_GFP(!can_direct_reclaim, gfp_mask))
        goto fail;

      // 此时内核已经无法通过回收内存来获取可供分配的空闲内存了
      // 对于 PF_MEMALLOC 类型的内存分配请求，内核现在无能为力，只能不停的进行 retry 重试。
      WARN_ON_ONCE_GFP(current->flags & PF_MEMALLOC, gfp_mask);

      // 对于需要分配 8 个内存页以上的大内存分配，并且设置了不可失败标识 __GFP_NOFAIL
      // 内核现在也无能为力，毕竟现实是已经没有空闲内存了，只是给出一些告警信息
      WARN_ON_ONCE_GFP(order > PAGE_ALLOC_COSTLY_ORDER, gfp_mask);

      // 在 __GFP_NOFAIL 情况下，尝试进行跨 NUMA 节点内存分配
      page = __alloc_pages_cpuset_fallback(gfp_mask, order, ALLOC_HARDER, ac);
      if (page)
        goto got_pg;
      // 在进行内存分配重试流程之前，需要让 CPU 重新调度到其他进程上
      // 运行一会其他进程，因为毕竟此时内存已经严重不足
      // 立马重试的话只能浪费过多时间在搜索空闲内存上，导致其他进程处于饥饿状态。
      cond_resched();
      // 跳转到 retry 分支，重试内存分配流程
      goto retry;
  }

fail:
      warn_alloc(gfp_mask, ac->nodemask,
            "page allocation failure: order:%u", order);
got_pg:
      return page;
}
```
#### 2.3vmalloc
**①简介**
>**概述**：内核通过`vmalloc`内存分配接口在`vmalloc`**动态映射区**申请内存
{%list%}
调用vmalloc时，内核会在vmalloc动态映射区划分出一段vmalloc区，其描述符为vm_struct，如下所示
{%endlist%}
{%right%}
每个vmalloc区之间隔着一个4k大小的guard page，防止越界访问
{%endright%}
```c
struct vm_struct {
  // vmalloc 动态映射区中的所有虚拟内存区域也都是被一个单向链表所串联
  struct vm_struct  *next;
  // vmalloc 区的起始内存地址
  void  *addr;
  // vmalloc 区的大小
  unsigned long  size;
  // vmalloc 区的相关标记
  unsigned long  flags;
  // struct page 结构的数组指针，数组中的每一项指向该虚拟内存区域背后映射的物理内存页。
  struct page  **pages;
  // 该虚拟内存区域包含的物理内存页个数
  unsigned int  nr_pages;
  // ioremap 映射硬件设备物理内存的时候填充
  phys_addr_t  phys_addr;
  // 调用者的返回地址
  const void  *caller;
};
```
**②组织形式**
>**概述**：`vmalloc`区本身使用**单向链表**串联，为了提高**查找效率**内核为每个`vmalloc`区分配了一个`vmap_area`
{%list%}
vmap_area结构代码如下所示，可见内核采用双向链表和红黑树组织各个vmalloc区
{%endlist%}
{%right%}
内核空间是所有进程共享的，所以组织vmalloc区的双向链表和红黑树是全局的
{%endright%}
```c
static struct rb_root vmap_area_root = RB_ROOT;
extern struct list_head vmap_area_list;
```
```c
struct vmap_area {
  // vmalloc 区的起始内存地址
  unsigned long va_start;
  // vmalloc 区的结束内存地址
  unsigned long va_end;
  // vmalloc 区所在红黑树中的节点
  struct rb_node rb_node;         /* address sorted rbtree */
  // vmalloc 区所在双向链表中的节点
  struct list_head list;          /* address sorted list */
  // 用于关联 vm_struct 结构
  struct vm_struct *vm;          
};
```
**③`__vmalloc_node_range`**
>**概述**：`vmalloc`内存分配的**核心逻辑**封装在`__vmalloc_node_range`函数中
{%list%}
vmalloc在vmalloc动态映射区划分出一段vmalloc区后，会立马为这段虚拟内存区域分配物理内存
{%endlist%}
{%right%}
__vmalloc_area_node调用alloc_page为指定vmalloc区的每个虚拟页分配物理内存并修改内核主页表
{%endright%}
```c
void *__vmalloc_node_range(unsigned long size, unsigned long align,
            unsigned long start, unsigned long end, gfp_t gfp_mask,
            pgprot_t prot, unsigned long vm_flags, int node,
            const void *caller)
{
  // 用于描述 vmalloc 虚拟内存区域的数据结构，同 mmap 中的 vma 结构很相似
  struct vm_struct *area;
  // vmalloc 虚拟内存区域的起始地址
  void *addr;
  unsigned long real_size = size;
  // size 为要申请的 vmalloc 虚拟内存区域大小，这里需要按页对齐
  size = PAGE_ALIGN(size);
  // 需要检查 size 大小，不能超过当前系统中的空闲物理内存
  if (!size || (size >> PAGE_SHIFT) > totalram_pages())
    goto fail;

  // 在内核空间的 vmalloc 动态映射区中，划分出一段空闲的虚拟内存区域 vmalloc 区出来
  area = __get_vm_area_node(size, align, VM_ALLOC | VM_UNINITIALIZED |
              vm_flags, start, end, node, gfp_mask, caller);
  if (!area)
    goto fail;
  // 为 vmalloc 虚拟内存区域中的每一个虚拟内存页分配物理内存页
  addr = __vmalloc_area_node(area, gfp_mask, prot, node);
  if (!addr)
    return NULL;

  return addr;
}
```
```c
static void *__vmalloc_area_node(struct vm_struct *area, gfp_t gfp_mask,
                 pgprot_t prot, int node)
{
  // 指向即将为 vmalloc 区分配的物理内存页
  struct page **pages;
  unsigned int nr_pages, array_size, i;

  // 计算 vmalloc 区所需要的虚拟内存页个数
  nr_pages = get_vm_area_size(area) >> PAGE_SHIFT;
  // vm_struct 结构中的 pages 数组大小，用于存放指向每个物理内存页的指针
  array_size = (nr_pages * sizeof(struct page *));

  // 首先要为 pages 数组分配内存
  if (array_size > PAGE_SIZE) {
    // array_size 超过 PAGE_SIZE 大小则递归调用 vmalloc 分配数组所需内存
    pages = __vmalloc_node(array_size, 1, nested_gfp|highmem_mask,
            PAGE_KERNEL, node, area->caller);
  } else {
    // 直接调用 kmalloc 分配数组所需内存
    pages = kmalloc_node(array_size, nested_gfp, node);
  }

  // 初始化 vm_struct
  area->pages = pages;
  area->nr_pages = nr_pages;

  // 依次为 vmalloc 区中包含的所有虚拟内存页分配物理内存
  for (i = 0; i < area->nr_pages; i++) {
    struct page *page;

    if (node == NUMA_NO_NODE)
      // 如果没有特殊指定 numa node，则从当前 numa node 中分配物理内存页
      page = alloc_page(alloc_mask|highmem_mask);
    else
      // 否则就从指定的 numa node 中分配物理内存页
      page = alloc_pages_node(node, alloc_mask|highmem_mask, 0);
    // 将分配的物理内存页依次存放到 vm_struct 结构中的 pages 数组中
    area->pages[i] = page;
  }
  
  atomic_long_add(area->nr_pages, &nr_vmalloc_pages);
  // 修改内核主页表，将刚刚分配出来的所有物理内存页与 vmalloc 虚拟内存区域进行映射
  if (map_vm_area(area, prot, pages))
    goto fail;
  // 返回 vmalloc 虚拟内存区域起始地址
  return area->addr;
}
```
