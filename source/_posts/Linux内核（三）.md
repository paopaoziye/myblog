---
title: Linux内核（三）
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
summary: 伙伴系统
---
# Linux内核（三）
## 内存管理
### 1.伙伴系统
#### 1.1引言
**①简介**
>**概述**：内核为每个**物理内存区域**`zone`分配一个**伙伴系统**用于管理**空闲内存页**
{%list%}
伙伴系统分配的物理内存块是物理连续的，大小为2^N个页，N称为内存块的分配阶，取值为0-10
{%endlist%}
{%right%}
其中free_area数组的索引表示分配阶，伙伴系统将不同分配阶的内存块使用不同的free_area结构管理
{%endright%}
{%warning%}
伙伴系统所管理的空闲物理内存页并不包含紧急预留内存
{%endwarning%}
```c
struct zone {
  //被伙伴系统所管理的物理内存页个数
  atomic_long_t       managed_pages;
  //伙伴系统的核心数据结构
  struct free_area    free_area[MAX_ORDER];
}
```
**②`free_area`**
>**概述**：`free_area`结构描述**相同分配阶**的内存块在**伙伴系统**中的组织结构
{%list%}
free_area为每个迁移类型都定义了对应双向链表，示意图如下所示
{%endlist%}
>在**系统初始化**期间，所有页都被标记为`MIGRATE_MOVABLE`，其余迁移类型链表为空
{%right%}
内核将大小相同且物理连续的多个page视作为伙伴
{%endright%}
{%warning%}
nr_free表示的是空闲内存块的个数，而不是空闲内存页的个数
{%endwarning%}
```c
struct free_area {
  //组织内存块的双向链表数组，每个链表组织一种迁移类型的内存块
  struct list_head free_list[MIGRATE_TYPES];
  //空闲内存块的个数
  unsigned long  nr_free;
};
```
![伙伴系统](/image/linux_4.png)
#### 1.2分配规则
**①简介**
>**概述**：当申请`2^(N-1)`至`2^N`个内存页时，内核从**伙伴系统的对应链表**中申请`2^N`个内存页
{%list%}
根据gfp_mask指定的NUMA节点和内存区域找到对应的伙伴系统，并根据分配阶和迁移类型找到对应的双向链表
{%endlist%}
{%right%}
当对应分配阶链表找不到满足要求的空闲内存块时，从更高阶链表中寻找空闲内存块，过程如下
{%endright%}
>若`N`阶链表为空，则依次寻找`N+1`、`N+2...`阶链表，直至找到为止

>若从`N+m`阶链表找到**空闲内存块**，则将该内存块**减半分裂**，前一块插入`N+m-1`阶链表，另一块**继续减半分裂**

>**循环上述过程**，直至分裂为两个`N`阶内存块，前一块**进行分配**，另一块插入`N`阶链表

![伙伴系统的分配](/image/linux_5.png)
**②fallback规则**
>**概述**：当一种迁移类型的**所有分配阶链表**均无法满足要求时，可以从**备用迁移类型**中寻找空闲内存块
{%list%}
内核对每种迁移类型的备用迁移类型进行了规定，如下所示
{%endlist%}
>`MIGRATE_UNMOVABLE`**内存不足**时，依次从`MIGRATE_RECLAIMABLE`、 `MIGRATE_MOVABLE`、`MIGRATE_TYPES`中**调取内存**
{%right%}
进行fallback时，从备用迁移类型高阶链表到低阶链表查找空闲内存块，并迁移到指定的迁移类型链表中
{%endright%}
{%warning%}
fallback优先查找备用迁移类型的高阶链表，即分配一个尽可能大的内存块，避免向指定迁移类型引入内存碎片
{%endwarning%}
```c
static int fallbacks[MIGRATE_TYPES][3] = {
 [MIGRATE_UNMOVABLE]   = { MIGRATE_RECLAIMABLE, MIGRATE_MOVABLE,   MIGRATE_TYPES },
 [MIGRATE_MOVABLE]     = { MIGRATE_RECLAIMABLE, MIGRATE_UNMOVABLE, MIGRATE_TYPES },
 [MIGRATE_RECLAIMABLE] = { MIGRATE_UNMOVABLE,   MIGRATE_MOVABLE,   MIGRATE_TYPES },
};
```
**③`rmqueue`**
>**概述**：`get_page_from_freelist`找到**符合条件**的内存区域后，会通过`rmqueue`从该区域**伙伴系统**分配内存
{%list%}
__rmqueue_smallest为伙伴系统分配的核心流程，__rmqueue基于__rmqueue_smallest实现了fallback
{%endlist%}
{%right%}
当只请求一页内存时，内核会直接从对应CPU高速缓存冷热页列表pcplist中分配内存，以加速内存分配
{%endright%}
{%warning%}
当迁移类型为MIGRATE_MOVABLE时，申请失败后优先从CMA区域中分配内存，再进行fallback流程
{%endwarning%}
>`CMA`区域为系统在**伙伴系统初始化之前**预留的连续内存
```c
static inline
struct page *rmqueue(struct zone *preferred_zone,
            struct zone *zone, unsigned int order,
            gfp_t gfp_flags, unsigned int alloc_flags,
            int migratetype)
{
  unsigned long flags;
  struct page *page;

  if (likely(order == 0)) {
    // 当申请一个物理页面时，内核首先会从 CPU 高速缓存列表 pcplist 中直接分配
    page = rmqueue_pcplist(preferred_zone, zone, gfp_flags,
                migratetype, alloc_flags);
    goto out;
  }
  // 加锁并关闭中断，防止并发访问
  spin_lock_irqsave(&zone->lock, flags);

  // 当申请页面超过一个 （order > 0）时，则从伙伴系统中进行分配
  do {
    page = NULL;
    if (alloc_flags & ALLOC_HARDER) {
      // 如果设置了 ALLOC_HARDER 分配策略，则从伙伴系统的 HIGHATOMIC 迁移类型的 freelist 中获取
      page = __rmqueue_smallest(zone, order, MIGRATE_HIGHATOMIC);
    }
    if (!page)
      // 从伙伴系统中申请分配阶 order 大小的物理内存块
      page = __rmqueue(zone, order, migratetype, alloc_flags);
  } while (page && check_new_pages(page, order));
  // 解锁
  spin_unlock(&zone->lock);
  if (!page)
    goto failed;
  // 重新统计内存区域中的相关统计指标
  zone_statistics(preferred_zone, zone);
  // 打开中断
  local_irq_restore(flags);

out:
  return page;

failed:
  // 分配失败
  local_irq_restore(flags);
  return NULL;
}
```
```c
static __always_inline struct page *
__rmqueue(struct zone *zone, unsigned int order, int migratetype,
                        unsigned int alloc_flags)
{
  struct page *page;

retry:
  // 首先进入伙伴系统到指定页面迁移类型的free_list[migratetype]获取空闲内存块
  page = __rmqueue_smallest(zone, order, migratetype);

  if (unlikely(!page)) {
    // 如果迁移类型是MIGRATE_MOVABLE，则优先从CMA区中分配内存
    if (migratetype == MIGRATE_MOVABLE)
      page = __rmqueue_cma_fallback(zone, order);
    // 走常规的伙伴系统fallback流程
    if (!page && __rmqueue_fallback(zone, order, migratetype,alloc_flags))
      goto retry;
  }
  // 内存分配成功
  return page;
}
```
```c
static __always_inline
struct page *__rmqueue_smallest(struct zone *zone, unsigned int order,
                        int migratetype)
{
  unsigned int current_order;
  struct free_area *area;
  struct page *page;

  /* 从当前分配阶order开始在伙伴系统对应的 free_area[order] 里查找合适尺寸的内存块 */
  for (current_order = order; current_order < MAX_ORDER; ++current_order) {
    // 获取当前 order 在伙伴系统中对应的 free_area[order] 
    area = &(zone->free_area[current_order]);
    // 从free_area[order]中对应的free_list[MIGRATE_TYPE]链表中获取空闲内存块
    page = get_page_from_free_area(area, migratetype);
    if (!page)
      // 如果当前free_area[order]中没有空闲内存块则继续向高阶链表查找
      continue;
    // 如果在当前 free_area[order] 中找到空闲内存块，则从 free_list[MIGRATE_TYPE] 链表中摘除
    del_page_from_free_area(page, area);
    // 将摘下来的内存块进行减半分裂并插入对应的尺寸的free_area中
    expand(zone, page, order, current_order, area, migratetype);
    // 设置页面的迁移类型
    set_pcppage_migratetype(page, migratetype);
    return page;
  }
  // 内存分配失败返回 null
  return NULL;
}
```

#### 1.3回收机制
**①简介**
>**概述**：根据回收内存块的**分配阶**和**迁移类型**插入指定链表
{%list%}
如果链表中存在回收内存块的伙伴，则需要将其合并，并作为一个新的内存块插入到更高阶链表中，直至不能合并
{%endlist%}
{%right%}
每个页都有其页编号，根据页编号调用__find_buddy_pfn找到其伙伴内存块的页编号
{%endright%}
{%warning%}
找到伙伴内存块后，还必须调用page_is_buddy判断两者是否为有效的伙伴
{%endwarning%}
```c
static inline unsigned long
__find_buddy_pfn(unsigned long page_pfn, unsigned int order)
{
 return page_pfn ^ (1 << order);
}
```
```c
static inline int page_is_buddy(struct page *page, struct page *buddy,
       unsigned int order)
{
  // buddy块有效且阶数和page相同
 if (page_is_guard(buddy) && page_order(buddy) == order) {
  // 两者在同一物理区域
  if (page_zone_id(page) != page_zone_id(buddy))
   return 0;

  return 1;
 }
 // buddy块在伙伴系统中且阶数和page相同
 if (PageBuddy(buddy) && page_order(buddy) == order) {
  // 两者在同一物理区域
  if (page_zone_id(page) != page_zone_id(buddy))
   return 0;

  return 1;
 }
 return 0;
}
```
**②`free_the_page`**
>**概述**：`__free_pages`检查释放页对应`page`结构有效性后会调用`free_the_page`将其到**伙伴系统**
{%list%}
__free_pages_ok清理page后，最终会调用__free_one_page将其释放回伙伴系统，该过程不响应中断
{%endlist%}
{%right%}
当只释放一页内存时，内核会将其释放到CPU高速缓存列表pcplist中，以加速内存释放
{%endright%}
{%warning%}
内核只会将UNMOVABLE，MOVABLE，RECLAIMABLE这三种页面迁移类型放入CPU高速缓存列表pcplist中
{%endwarning%}
```c
static inline void free_the_page(struct page *page, unsigned int order)
{
  if (order == 0)     
    // 如果释放一页的话，则直接释放到CPU高速缓存列表pcplist中
    free_unref_page(page);
  else
    // 如果释放多页的话，则进入伙伴系统回收这部分内存
    __free_pages_ok(page, order);
}
```
```c
static inline void __free_one_page(struct page *page,
        unsigned long pfn,
        struct zone *zone, unsigned int order,
        int migratetype)
{
  // 释放内存块与其伙伴内存块合并之后新内存块的 pfn
  unsigned long combined_pfn;
  // 伙伴内存块的 pfn
  unsigned long uninitialized_var(buddy_pfn);
  // 伙伴内存块的首页 page 指针
  struct page *buddy;
  // 伙伴系统中的最大分配阶
  unsigned int max_order;
continue_merging:
  // 从释放内存块的当前分配阶开始一直向高阶合并内存块，直到不能合并为止
  while (order < max_order - 1) {
    // 在 free_area[order] 中查找伙伴内存块的 pfn
    buddy_pfn = __find_buddy_pfn(pfn, order);
    // 根据偏移 buddy_pfn - pfn 计算伙伴内存块中的首页 page 地址
    buddy = page + (buddy_pfn - pfn);
    // 检查伙伴 pfn 的有效性
    if (!pfn_valid_within(buddy_pfn))
      // 无效停止合并
      goto done_merging;
    // 按照前面介绍的伙伴定义检查是否为伙伴
    if (!page_is_buddy(page, buddy, order))
      // 不是伙伴停止合并
      goto done_merging;
    // 将伙伴内存块从当前 free_area[order] 列表中摘下
    del_page_from_free_area(buddy, &zone->free_area[order]);
    // 合并后新内存块首页 page 的 pfn
    combined_pfn = buddy_pfn & pfn;
    // 合并后新内存块首页 page 指针
    page = page + (combined_pfn - pfn);
    // 以合并后的新内存块为基础继续向高阶 free_area 合并
    pfn = combined_pfn;
    // 继续向高阶 free_area 合并，直到不能合并为止
    order++;
  }
    
done_merging:
  // 表示在当前伙伴系统 free_area[order] 中没有找到伙伴内存块，停止合并
  set_page_order(page, order);
  // 将最终合并的内存块插入到伙伴系统对应的 free_are[order] 中
  add_to_free_area(page, &zone->free_area[order], migratetype);
}
```
### 2.slab内存池
#### 2.1引言
**①简介**
>**概述**：本质上为**一堆物理页**，`slab`内存池将从**伙伴系统**申请的物理页划分为多个**尺寸相同的小内存块**
{%list%}
Linux系统中关于slab对象池的三种实现有slab、slub和slob，主要介绍slub，即内核常用的slab实现
{%endlist%}
{%right%}
slab内存池专门用于小内存的分配和释放，内核针对一些常用数据结构如task_struct创建了对应slab内存池
{%endright%}
{%warning%}
伙伴系统的管理单位为物理页，而内核和用户对内存的需求量通常为几十字节到几百字节，故需要slab内存池
{%endwarning%}
**②划分格式**
>**概述**：每个内存块由`redzone`、`object`、`track`、`freepointer`和`padding`组成
{%list%}
redzone用于防止越界访问以及保证内存对齐，object存放对象数据，track存放追踪信息，padding为填充区域
{%endlist%}
{%right%}
freepointer指向下一个内存块，正常情况下存放在object中，因为object在分配前存放的信息是无所谓的
{%endright%}
{%warning%}
如果内存块被毒化，即object需要填充特定字节，则为freepointer额外分配一个word size大小的内存空间
{%endwarning%}
**③slab描述符**
>**概述**：`slab`本质上就是**一个或者多个物理内存页**，所以使用`page`结构作为其**描述符**
{%list%}
若slab依赖的是多个物理页，则将page设置为复合页compound_page表示slab
{%endlist%}
{%right%}
slab根据其分配情况可分为full slab、partial slab和empty slab，依次为全部分配、部分分配和完全空闲
{%endright%}
```c
struct page {
  /*  slub 相关字段 */
  struct { 
    union {
      // slab 所在的管理链表
      struct list_head slab_list;
      struct { 
        // 用 next 指针在相应管理链表中串联起 slab
        struct page *next;
#ifdef CONFIG_64BIT
        // slab 所在管理链表中的包含的 slab 总数
        int pages;  
        // slab 所在管理链表中包含的对象总数
        int pobjects; 
#else
        short int pages;
        short int pobjects;
#endif
      };
    };
    // 指向 slab cache 即真正的对象池结构，里边管理了多个同类型 slab
    struct kmem_cache *slab_cache;
    // 指向 slab 中第一个空闲对象
    void *freelist;     /* first free object */
    union {
      struct {            /* SLUB */
        // slab 中已经分配出去的独享
        unsigned inuse:16;
        // slab 中包含的对象总数
        unsigned objects:15;
        // 该 slab 是否在对应 slab cache 的本地 CPU 缓存中
        // frozen = 1 表示缓存再本地 cpu 缓存中
        unsigned frozen:1;
      };
    };
  };
}
```
#### 2.2内存池架构
**①`kmem_cache`**
>**概述**：描述`slab cache`，每个`slab cache`管理**多个同类**`slab`对象并记录**相关信息**
{%list%}
slab中的内存一般来自于NORMAL直接映射区域，也可指定为DMA和DMA32区域
{%endlist%}
{%right%}
如下所示，内核将各种类型的slab cache串联为一个双向链表，并将头节点指针保存在每个kmem_cache中
{%endright%}
```c
struct kmem_cache {
  // 用于组织串联系统中所有类型的 slab cache
  struct list_head list; 
  // slab cache 的管理标志位，用于设置 slab 的一些特性
  // 比如：slab中的对象按照什么方式对齐，对象是否需要POISON毒化，是否插入red zone对象内存周围，是否追踪对象的分配和释放信息等
  slab_flags_t flags;
  // slab 对象在内存中的真实占用，包括为了内存对齐填充的字节数，red zone 等等
  unsigned int size;  
  // slab 中对象的实际大小，不包含填充的字节数
  unsigned int object_size;
  // offset 表示用于存储下一个空闲对象指针的位置距离对象首地址的偏移
  unsigned int offset;    
  // 其中低16位表示一个 slab 中所包含的对象总数，高16位表示一个 slab 所占有的内存页个数
  struct kmem_cache_order_objects oo;
  // slab 中所能包含对象以及内存页个数的最大值
  struct kmem_cache_order_objects max;
  // 当按照 oo 的尺寸为 slab 申请内存时，如果内存紧张，会采用 min 的尺寸为 slab 申请内存
  struct kmem_cache_order_objects min;
  // 向伙伴系统申请内存时使用的内存分配标识
  gfp_t allocflags; 
  // slab cache 的引用计数，为0时就可以销毁并释放内存回伙伴系统
  int refcount;   
  // 池化对象的构造函数，用于创建 slab 对象池中的对象
  void (*ctor)(void *);
  // 对象的 object_size 按照 word 字长对齐之后的大小
  unsigned int inuse;  
  // 对象按照指定的 align 进行对齐
  unsigned int align; 
  // slab cache 的名称
  const char *name;  
};
```
**②`kmem_cache_cpu`**
>**概述**：描述`slab cache`在每个`cpu`中的**本地缓存**，`__percpu`表示表示每个`cpu`都有**该变量的拷贝**
{%list%}
如果开启了CONFIG_SLUB_CPU_PARTIAL配置项，则cpu本地缓存会有一个partial slab列表作为其备用
{%endlist%}
>当`slab`被缓存进`kmem_cache_cpu`后，`page->freelist`会被赋予`kmem_cache_cpu->freelist`，并变为`NULL`

>此后该`slab`的分配只能通过`kmem_cache_cpu->freelist`，但是其他`cpu`可以将对象释放回`page->freelist`
{%right%}
当进程向slab cache申请对应内存块时，会优先在所在cpu本地缓存的slab中分配，整个过程没有加锁，且访问迅速
{%endright%}
{%warning%}
kmem_cache中cpu_partial限制CPU本地缓存中partial链表中空闲对象总数
{%endwarning%}
>超过该值后，`kmem_cache_cpu->partial`中的`slab`将会被**全部转移**至 `kmem_cache_node->partial`中
```c
struct kmem_cache {
  // 每个 cpu 拥有一个本地缓存，用于无锁化快速分配释放对象
  struct kmem_cache_cpu __percpu *cpu_slab;
#ifdef CONFIG_SLUB_CPU_PARTIAL
  // 限定 slab cache 在每个 cpu 本地缓存 partial 链表中所有 slab 中空闲对象的总数
  // cpu 本地缓存 partial 链表中空闲对象的数量超过该值，则会将 cpu 本地缓存 partial 链表中的所有 slab 转移到 numa node 缓存中。
  unsigned int cpu_partial;
#endif
}
```
```c
struct kmem_cache_cpu {
  // 指向被CPU本地缓存的slab中第一个空闲的对象
  void **freelist;
  // 内核为设置的一个全局唯一的 id ，用于标识不同 cpu 的本地缓存 kmem_cache_cpu
  unsigned long tid;  
  // slab cache 中 CPU 本地所缓存的 slab，由于 slab 底层的存储结构是内存页 page
  // 所以这里直接用内存页 page 表示 slab
  struct page *page;  
#ifdef CONFIG_SLUB_CPU_PARTIAL
  // cpu cache 缓存的备用 slab 列表，同样也是用 page 表示
  // 当被本地 cpu 缓存的 slab 中没有空闲对象时，内核会从 partial 列表中的 slab 中查找空闲对象
  struct page *partial;   
#endif
#ifdef CONFIG_SLUB_STATS
  // 记录 slab 分配对象的一些状态信息
  unsigned stat[NR_SLUB_STAT_ITEMS];
#endif
};
```
**③`kmem_cache_node`**
>**概述**：描述`slab cache`在**每个节点**中的**缓存**，`kmem_cache`可以访问**所有节点**的`kmem_cache_node`
{%list%}
kmem_cache_node的partial链表组织节点中部分空闲和空的slab，full链表组织节点中分配完毕的slab
{%endlist%}
{%right%}
当kmem_cache_node的partial链表为空，会从伙伴系统重新申请一批slab填充到kmem_cache_cpu中
{%endright%}
{%warning%}
kmem_cache中min_partial限制每个节点中partial链表的slab个数，超过该值后，empty slab会被回收至伙伴系统
{%endwarning%}
```c
struct kmem_cache {
  // slab cache 中 numa node 中的缓存，每个 node 一个
  struct kmem_cache_node *node[MAX_NUMNODES];
  // slab cache 在 numa node 中缓存的 slab 个数上限，slab 个数超过该值，空闲的 empty slab 则会被回收至伙伴系统
  unsigned long min_partial;
}
```
```c
struct kmem_cache_node {
  spinlock_t list_lock;
#ifdef CONFIG_SLUB
  // 该 node 节点中缓存的 slab 个数
  unsigned long nr_partial;
  // 该链表用于组织串联 node 节点中缓存的 slabs
  // partial 链表中缓存的 slab 为部分空闲的（slab 中的对象部分被分配出去）
  struct list_head partial;
#ifdef CONFIG_SLUB_DEBUG // 开启 slab_debug 之后会用到的字段
  // slab 的个数
  atomic_long_t nr_slabs;
  // 该 node 节点中缓存的所有 slab 中包含的对象总和
  atomic_long_t total_objects;
  // full 链表中包含的 slab 全部是已经被分配完毕的 full slab
  struct list_head full;
#endif
#endif
}
```
#### 2.3创建与初始化
**①`kmem_cache_create`**
>**概述**：创建**指定相关属性**的`slab`内存池，主要工作封装在`kmem_cache_create_usercopy`中
{%list%}
useroffset和usersize规定了对象内存布局区域中哪些部分可以被复制到用户空间中，保证数据安全
{%endlist%}
{%right%}
内核首先会在已有的slab cache中寻找一个参数相近的进行复用，并将指定的name作为原有slab cache的别名
{%endright%}
{%warning%}
为了保证整个创建过程是并发安全的，需要获取一系列的锁和信号量，并检查参数的有效性
{%endwarning%}
```c
struct kmem_cache *
kmem_cache_create(const char *name, unsigned int size, unsigned int align,
        slab_flags_t flags, void (*ctor)(void *))
{
  return kmem_cache_create_usercopy(name, size, align, flags, 0, 0,
                    ctor);
}
```
```c
struct kmem_cache *
kmem_cache_create_usercopy(const char *name,
          unsigned int size, unsigned int align,
          slab_flags_t flags,
          unsigned int useroffset, unsigned int usersize,
          void (*ctor)(void *))
{
  struct kmem_cache *s = NULL;
  const char *cache_name;
  int err;

  // 获取 cpu_hotplug_lock，防止 cpu 热插拔改变 online cpu map
  get_online_cpus();
  // 获取 mem_hotplug_lock，防止访问内存的时候进行内存热插拔
  get_online_mems();
  // 获取 memcg_cache_ids_sem（caches array 大小）读写信号量
  memcg_get_cache_ids();
  // 获取 slab cache 链表的全局互斥锁
  mutex_lock(&slab_mutex);

  // 入参检查，校验 name 和 size 的有效性，防止创建过程在中断上下文中进行
  err = kmem_cache_sanity_check(name, size);
  if (err) {
    goto out_unlock;
  }

  // 检查有效的 slab flags 标记位，如果传入的 flag 是无效的，则拒绝本次创建请求
  if (flags & ~SLAB_FLAGS_PERMITTED) {
    err = -EINVAL;
    goto out_unlock;
  }

  // 设置创建 slab  cache 时用到的一些标志位
  flags &= CACHE_CREATE_MASK;

  // 校验 useroffset 和 usersize 的有效性
  if (WARN_ON(!usersize && useroffset) ||
      WARN_ON(size < usersize || size - usersize < useroffset))
    usersize = useroffset = 0;

  if (!usersize)
    // 在全局 slab cache 链表中查找与当前创建参数相匹配的 kmem_cache
    // 如果有，就不需要创建新的了，直接和已有的  slab cache  合并
    // 并且在 sys 文件系统中使用指定的 name 作为已有  slab cache  的别名
    s = __kmem_cache_alias(name, size, align, flags, ctor);
  if (s)
    goto out_unlock;
  // 在内核中为指定的 name 生成字符串常量并分配内存
  // 这里的 cache_name 就是将要创建的 slab cache 名称，用于在 /proc/slabinfo 中显示
  cache_name = kstrdup_const(name, GFP_KERNEL);
  if (!cache_name) {
    err = -ENOMEM;
    goto out_unlock;
  }
  // 按照我们指定的参数，创建新的 slab cache
  s = create_cache(cache_name, size,
            calculate_alignment(flags, align, size),
            flags, useroffset, usersize, ctor, NULL, NULL);
  if (IS_ERR(s)) {
    err = PTR_ERR(s);
    kfree_const(cache_name);
  }

out_unlock:
  // 走到这里表示创建 slab cache 失败，释放相关的自旋锁和信号量
  mutex_unlock(&slab_mutex);
  memcg_put_cache_ids();
  put_online_mems();
  put_online_cpus();

  if (err) {
    if (flags & SLAB_PANIC)
      panic("kmem_cache_create: Failed to create slab '%s'. Error %d\n",
          name, err);
    else {
      pr_warn("kmem_cache_create(%s) failed with error %d\n",
          name, err);
      dump_stack();
    }
    return NULL;
  }
  return s;
}
```
**②`create_cache`**
>**概述**：**申请并初始化**数据结构`kmem_cache`并将其插入`slab cache`在内核中的**全局链表**
{%list%}
内核在启动阶段，会专门为kmem_cache创建其专属的slab cache，保存在全局变量kmem_cache中
{%endlist%}
{%right%}
kmem_cache的初始化工作封装在__kmem_cache_create，该函数主要工作为kmem_cache_open
{%endright%}
{%warning%}
调用kmem_cache_open后会检查整个slab allocator体系的状态，只有slab_state为FULL才表示其可以正常运作
{%endwarning%}
>内核为`slab allocator`体系在`sys`文件系统中建立`/sys/kernel/slab`**目录节点**保存相关信息，其状态变为`FULL`
```c
static struct kmem_cache *create_cache(const char *name,
        unsigned int object_size, unsigned int align,
        slab_flags_t flags, unsigned int useroffset,
        unsigned int usersize, void (*ctor)(void *),
        struct mem_cgroup *memcg, struct kmem_cache *root_cache)
{
  struct kmem_cache *s;
  // 为将要创建的 slab cache 分配 kmem_cache 结构
  // kmem_cache 也是内核的一个核心数据结构，同样也会被它对应的 slab cache 所管理
  // 这里就是从 kmem_cache 所属的 slab cache 中拿出一个 kmem_cache 对象出来
  s = kmem_cache_zalloc(kmem_cache, GFP_KERNEL);

  // 利用我们指定的创建参数初始化 kmem_cache 结构
  s->name = name;
  s->size = s->object_size = object_size;
  s->align = align;
  s->ctor = ctor;
  s->useroffset = useroffset;
  s->usersize = usersize;
  // 创建 slab cache 的核心函数，这里会初始化 kmem_cache 结构中的其他重要属性
  // 包括创建初始化 kmem_cache_cpu 和 kmem_cache_node 结构
  err = __kmem_cache_create(s, flags);
  if (err)
      goto out_free_cache;
  // slab cache 初始状态下，引用计数为 1
  s->refcount = 1;
  // 将刚刚创建出来的 slab cache 加入到 slab cache 在内核中的全局链表管理
  list_add(&s->list, &slab_caches);

out:
  if (err)
      return ERR_PTR(err);
  return s;

out_free_cache:
  // 创建过程出现错误之后，释放 kmem_cache 对象
  kmem_cache_free(kmem_cache, s);
  goto out;
}

```
```c
int __kmem_cache_create(struct kmem_cache *s, slab_flags_t flags)
{
  int err;
  // 核心函数，在这里会初始化 kmem_cache 的其他重要属性
  err = kmem_cache_open(s, flags);
  if (err)
    return err;

  // 检查内核中 slab 分配器的整体体系是否已经初始化完毕，只有状态是 FULL 的时候才是初始化完毕，其他的状态表示未初始化完毕。
  // 在 slab  allocator 体系初始化的时候在 slab_sysfs_init 函数中将 slab_state 设置为 FULL
  if (slab_state <= UP)
    return 0;
  // 在 sys 文件系统中创建 /sys/kernel/slab/name 节点，该目录下的文件包含了对应 slab cache 运行时的详细信息
  err = sysfs_slab_add(s);
  if (err)
    // 出现错误则释放 kmem_cache 结构
    __kmem_cache_release(s);

  return err;
}
```
**③`kmem_cache_open`**
>**概述**：创建并初始化`kmem_cache`的**核心参数**如`oo`、`kmem_cache_cpu`和`kmem_cache_node`等
{%list%}
calculate_sizes根据flags设置了slab的内存块格式，并根据内存块大小计算出一个slab需要多少个物理页
{%endlist%}
>一个`slab`至少需要容纳**一个对象**
{%warning%}
kmem_cache_cpu是通过__alloc_percpu直接分配的，kmem_cache_node是在对应slab cache中申请的
{%endwarning%}
{%right%}
内核在启动阶段，会专门为kmem_cache_node创建其专属的slab cache，保存在全局变量kmem_cache_node中
{%endright%}
```c
static int kmem_cache_open(struct kmem_cache *s, slab_flags_t flags)
{
  // 计算 slab 中对象的整体内存布局所需要的 size
  // slab 所需最合适的内存页面大小 order，slab 中所能容纳的对象个数
  // 初始化 slab cache 中的核心参数 oo ,min,max的值
  if (!calculate_sizes(s, -1))
    goto error;

  // 设置 slab cache 在 node 缓存  kmem_cache_node 中的 partial 列表中 slab 的最小个数 min_partial
  set_min_partial(s, ilog2(s->size) / 2);
  // 设置 slab cache 在 cpu 本地缓存的 partial 列表中所能容纳的最大空闲对象个数
  set_cpu_partial(s);

  // 为 slab cache 创建并初始化 node cache 数组
  if (!init_kmem_cache_nodes(s))
    goto error;
  // 为 slab cache 创建并初始化 cpu 本地缓存列表
  if (alloc_kmem_cache_cpus(s))
    return 0;
}
```
```c
static int init_kmem_cache_nodes(struct kmem_cache *s)
{
  int node;
  // 遍历所有的 numa 节点，为 slab cache 创建 node cache
  for_each_node_state(node, N_NORMAL_MEMORY) {
    struct kmem_cache_node *n;

    if (slab_state == DOWN) {
      // 如果此时 slab allocator 体系还未建立，则调用该方法分配 kmem_cache_node 结构，并初始化。
      // slab cache 的正常创建流程不会走到这个分支，该分支用于在内核初始化的时候创建 kmem_cache_node 对象池使用
      early_kmem_cache_node_alloc(node);
      continue;
    }
    // 为 node cache 分配对应的 kmem_cache_node 对象
    // kmem_cache_node 对象也由它对应的 slab cache 管理
    n = kmem_cache_alloc_node(kmem_cache_node,
                    GFP_KERNEL, node);
    // 初始化 node cache
    init_kmem_cache_node(n);
    // 初始化 slab cache 结构 kmem_cache 中的 node 数组
    s->node[node] = n;
  }
  return 1;
}
```
```c
static inline int alloc_kmem_cache_cpus(struct kmem_cache *s)
{
  // 为 slab cache 分配 cpu 本地缓存结构 kmem_cache_cpu
  // __alloc_percpu 函数在内核中专门用于分配 percpu 类型的结构体（the percpu allocator）
  //  kmem_cache_cpu 结构也是 percpu 类型的，这里通过 __alloc_percpu 直接分配
  s->cpu_slab = __alloc_percpu(sizeof(struct kmem_cache_cpu),
                    2 * sizeof(void *));
  // 初始化 cpu 本地缓存结构 kmem_cache_cpu
  init_kmem_cache_cpus(s);
  return 1;
}
```
#### 2.4分配流程
**①`slab_alloc_node`**
>**概述**：`slab`**内存池**分配的入口，让某个`slab cache`从指定的`NUMA`**节点**中分配对象，代码如下所示
{%list%}
slab cache首先会尝试从cpu本地缓存的slab中获取对象，并保证tid的正确性
{%endlist%}
{%warning%}
如果cpu本地缓存slab没有空闲对象或者不属于当前节点，则需要进入慢速分配路径__slab_alloc
{%endwarning%}
{%right%}
__slab_alloc会在进入___slab_alloc前关闭中断，防止在慢速分配过程中，进程被抢占
{%endright%}
```c
static __always_inline void *slab_alloc_node(struct kmem_cache *s,
        gfp_t gfpflags, int node, unsigned long addr)
{
  // 用于指向分配成功的对象
  void *object;
  // slab cache 在当前 cpu 下的本地 cpu 缓存
  struct kmem_cache_cpu *c;
  // object 所在的内存页
  struct page *page;
  // 当前 cpu 编号
  unsigned long tid;

redo:
  // slab cache 首先尝试从当前 cpu 本地缓存 kmem_cache_cpu 中获取空闲对象
  // 因为进程可能由于抢占或者中断的原因被调度到其他 cpu 上执行，所以需要确保两者的 tid 一致
  do {
    // 获取执行当前进程的 cpu 中的 tid 字段
    tid = this_cpu_read(s->cpu_slab->tid);
    // 获取 cpu 本地缓存 cpu_slab
    c = raw_cpu_ptr(s->cpu_slab);
    // 如果开启了 CONFIG_PREEMPT 表示允许优先级更高的进程抢占当前 cpu
  } while (IS_ENABLED(CONFIG_PREEMPT) &&
        unlikely(tid != READ_ONCE(c->tid)));

  // 从 slab cache 的 cpu 本地缓存 kmem_cache_cpu 中获取缓存的 slab 空闲对象列表
  object = c->freelist;
  // 获取本地 cpu 缓存的 slab
  page = c->page;
  // 如果 slab cache 的 cpu 本地缓存没有空闲对象，需要进入慢速路径中分配对象
  if (unlikely(!object || !node_match(page, node))) {
    // 慢速路径
    object = __slab_alloc(s, gfpflags, node, addr, c);
    stat(s, ALLOC_SLOWPATH);
  } else {
    // 走到该分支表示，slab cache 的 cpu 本地缓存中还有空闲对象，直接分配
    void *next_object = get_freepointer_safe(s, object);
    // 更新 kmem_cache_cpu 结构中的 freelist 指向 next_object
    if (unlikely(!this_cpu_cmpxchg_double(
            s->cpu_slab->freelist, s->cpu_slab->tid,
            object, tid,
            next_object, next_tid(tid)))) {
      note_cmpxchg_failure("slab_alloc", s, tid);
      goto redo;
    }
    // cpu 预取 next_object 的 freepointer 到 cpu 高速缓存，加快下一次分配对象的速度
    prefetch_freepointer(s, next_object);
    stat(s, ALLOC_FASTPATH);
  }

  // 如果 gfpflags 掩码中设置了  __GFP_ZERO，则需要将对象所占的内存初始化为零值
  if (unlikely(slab_want_init_on_alloc(gfpflags, s)) && object)
    memset(object, 0, s->object_size);
  // 返回分配好的对象
  return object;
}
```
```c
static void *__slab_alloc(struct kmem_cache *s, gfp_t gfpflags, int node,
              unsigned long addr, struct kmem_cache_cpu *c)
{
  void *p;
  unsigned long flags;
  // 关闭 cpu 中断，防止并发访问
  local_irq_save(flags);
#ifdef CONFIG_PREEMPT
  // 当开启了 CONFIG_PREEMPT，表示允许其他进程抢占当前 cpu
  // 运行进程的当前 cpu 可能会被其他优先级更高的进程抢占，当前进程可能会被调度到其他 cpu 上
  // 所以这里需要重新获取 slab cache 的 cpu 本地缓存
  c = this_cpu_ptr(s->cpu_slab);
#endif
  // 进入 slab cache 的慢速分配路径
  p = ___slab_alloc(s, gfpflags, node, addr, c);
  // 恢复 cpu 中断
  local_irq_restore(flags);
  return p;
}
```
**②`___slab_alloc`**
>**概述**：`slab`**内存池**的**慢速分配**入口，代码如下所示
{%list%}
再真正进入慢速分配即new_slab处前，还会再次检查cpu本地缓存slab是否有空闲对象，有则直接走快速分配
{%endlist%}
>进程在**快速分配失败**到调用`__slab_alloc`期间可能被抢占，重新调度后`cpu`本地缓存`slab`可能有空闲对象了
{%right%}
进入new_slab后，内核会遍历cpu本地缓存的partial链表检查是否有一个slab可以分配对象
{%endright%}
>如果有，则将该`slab`从`partial`链表中摘下，提升为新的`cpu`本地缓存`slab`并从中分配对象
{%warning%}
如果cpu本地缓存的partial链表为空，则需要进入new_slab_objects获取新的slab
{%endwarning%}
```c
static void *___slab_alloc(struct kmem_cache *s, gfp_t gfpflags, int node,
              unsigned long addr, struct kmem_cache_cpu *c)
{
  // 指向 slub 中可供分配的第一个空闲对象
  void *freelist;
  // 空闲对象所在的 slub （用 page 表示）
  struct page *page;
  // 从 slab cache 的本地 cpu 缓存中获取缓存的 slub
  page = c->page;
  if (!page)
    // 如果缓存的 slub 中的对象已经被全部分配出去，没有空闲对象了
    // 那么就会跳转到 new_slab 分支进行降级处理走慢速分配路径
    goto new_slab;
redo:
  // 检查c->freelist，即slab cache本地 cpu 缓存中的 freelist 是否有空闲对象
  freelist = c->freelist;
  if (freelist)
    // 从 cpu 本地缓存中的 slab 中直接分配对象
    goto load_freelist;
  // 检查page->freelist是否有空闲对象，该链表存放其他cpu释放的空闲对象
  freelist = get_freelist(s, page);
  // 如果上述两个链表均没有空闲对象，则走慢速分配
  if (!freelist) {
    c->page = NULL;
    stat(s, DEACTIVATE_BYPASS);
    goto new_slab;
  }
  stat(s, ALLOC_REFILL);

load_freelist:
  // 被 slab cache 的 cpu 本地缓存的 slab 所属的 page 必须是 frozen 冻结状态
  VM_BUG_ON(!c->page->frozen);
  // 获取cpu本地缓存slab第一个空闲对象，并更新freelist指针
  c->freelist = get_freepointer(s, freelist);
  // 更新 slab cache 的 cpu 本地缓存分配对象时的全局 transaction id
  // 每当分配完一次对象，kmem_cache_cpu 中的 tid 都需要改变
  c->tid = next_tid(c->tid);
  // 返回第一个空闲对象
  return freelist;
new_slab:
  // 查看 kmem_cache_cpu->partial 链表中是否有 slab 可供分配对象
  if (slub_percpu_partial(c)) {
    // 获取 cpu 本地缓存 kmem_cache_cpu 的 partial 列表中的第一个 slab 
    // 并将这个 slab 提升为 cpu 本地缓存中的 slab，赋值给 c->page
    page = c->page = slub_percpu_partial(c);
    // 将 partial 列表中第一个 slab （c->page）从 partial 列表中摘下
    // 并将列表中的下一个 slab 更新为 partial 列表的头结点
    slub_set_percpu_partial(c, page);
    // 更新状态信息，记录本次分配是从 kmem_cache_cpu 的 partial 列表中分配
    stat(s, CPU_PARTIAL_ALLOC);
    // 跳转到redo从中分配对象并更新page->freelist和c->freelist
    goto redo;
  }
  // 如果 slab cache 中的 cpu 本地缓存 partial 列表中也没有 slab ，则进入new_slab_objects
  // 从kmem_cache_node->partial获取slab或者从伙伴系统中申请slab
  freelist = new_slab_objects(s, gfpflags, node, &c);
  // 如果伙伴系统中无法分配 slub 所需的 page，那么就提示内存不足，分配失败，返回 null
  if (unlikely(!freelist)) {
    slab_out_of_memory(s, gfpflags, node);
    return NULL;
  }
  // 将new_slab_objects中获取的slab作为新的cpu 本地缓存中的 slab
  page = c->page;
  if (likely(!kmem_cache_debug(s) && pfmemalloc_match(page, gfpflags)))
    goto load_freelist;
}
```
**③`new_slab_objects`**
>**概述**：从`kmem_cache_node`的`partial`链表获取`slab`或者从**伙伴系统**中申请新的`slab`
{%list%}
内核会尝试遍历节点缓存的partial链表获取slab，若当前节点没有，会尝试从备用节点缓存的partial链表中获取slab
{%endlist%}
>如果有，则将该`slab`从`partial`链表中摘下，提升为新的`cpu`本地缓存`slab`并从中分配对象
{%right%}
此外，内核还会继续遍历kmem_cache_node的partial链表将后续slab填充进kmem_cache_cpu->partial中
{%endright%}
>最多只能填充`kmem_cache->cpu_partial / 2`个`slab`
{%warning%}
如果当前节点以及备用节点的partial链表为空，则需要从伙伴系统中获取新的slab
{%endwarning%}
>如果申请成功，则将该`slab`初始化，并提升为新的`cpu`本地缓存`slab`并从中分配对象
```c
static inline void *new_slab_objects(struct kmem_cache *s, gfp_t flags,
            int node, struct kmem_cache_cpu **pc)
{
  // 从 numa node cache 中获取到的空闲对象列表
  void *freelist;
  // slab cache 本地 cpu 缓存
  struct kmem_cache_cpu *c = *pc;
  // 分配对象所在的内存页
  struct page *page;
  // 尝试从指定的 node 节点缓存 kmem_cache_node 中的 partial 列表获取可以分配空闲对象的 slub
  // 如果指定 numa 节点的内存不足，则会根据 cpu 访问距离的远近，进行跨 numa 节点分配
  freelist = get_partial(s, flags, node, c);
  if (freelist)
    // 返回 numa cache 中缓存的空闲对象列表
    return freelist;
  // 流程走到这里说明 numa cache 里缓存的 slab 也用尽了，无法找到可以分配对象的 slab 了
  // 只能向底层伙伴系统重新申请内存页（slab），然后从新的 slab 中分配对象
  page = new_slab(s, flags, node);
  // 将新申请的内存页 page ，缓存到 slab cache 的本地 cpu 缓存中
  if (page) {
    // 获取 slab cache 的本地 cpu 缓存
    c = raw_cpu_ptr(s->cpu_slab);
    // 刷新本地 cpu 缓存，将旧的 slab 缓存与 cpu 本地缓存解绑
    if (c->page)
      flush_slab(s, c);
    // 将新申请的 slab 与 cpu 本地缓存绑定，page->freelist 赋值给 kmem_cache_cpu->freelist
    freelist = page->freelist;
    // 绑定之后  page->freelist 置空
    page->freelist = NULL;
    stat(s, ALLOC_SLAB);
    // 将新申请的 slab 对应的 page 赋值给 kmem_cache_cpu->page
    c->page = page;
    *pc = c;
  }
  // 返回空闲对象列表
  return freelist;
}
```
#### 2.5回收流程
**①`do_slab_free`**
>**概述**：`slab`**内存池**回收的入口，将**对象**释放到指定`slab cache`中
{%list%}
判断回收对象是否属于cpu本地缓存slab，如果是则直接将其释放到cpu本地缓存slab中即可
{%endlist%}
{%warning%}
如果释放对象不属于cpu本地缓存slab，则进入慢速回收路径__slab_free
{%endwarning%}

```c
static __always_inline void do_slab_free(struct kmem_cache *s,
                struct page *page, void *head, void *tail,
                int cnt, unsigned long addr)
{
  void *tail_obj = tail ? : head;
  struct kmem_cache_cpu *c;
  unsigned long tid;
redo:
  // 获取 slab cache 的 cpu 本地缓存并保证tid正确
  do {
    // 获取执行当前进程的 cpu 中的 tid 字段
    tid = this_cpu_read(s->cpu_slab->tid);
    // 获取 cpu 本地缓存 cpu_slab
    c = raw_cpu_ptr(s->cpu_slab);
  } while (IS_ENABLED(CONFIG_PREEMPT) &&
        unlikely(tid != READ_ONCE(c->tid)));
  // 如果释放对象所属的 slab 正好是 cpu 本地缓存的 slab
  // 那么直接将对象释放到 cpu 缓存的 slub 中即可，这里就是快速释放路径 fastpath
  if (likely(page == c->page)) {
    // 将对象释放至 cpu 本地缓存 freelist 中的头结点处
    // 释放对象中的 freepointer 指向原来的 c->freelist
    set_freepointer(s, tail_obj, c->freelist);
    // cas 更新 cpu 本地缓存 s->cpu_slab 中的 freelist，以及 tid
    if (unlikely(!this_cpu_cmpxchg_double(
          s->cpu_slab->freelist, s->cpu_slab->tid,
          c->freelist, tid,
          head, next_tid(tid)))) {
      note_cmpxchg_failure("slab_free", s, tid);
      goto redo;
    }
    stat(s, FREE_FASTPATH);
  } else
    // 如果当前释放对象并不在 cpu 本地缓存中，那么就进入慢速释放路径 slowpath
    __slab_free(s, page, head, tail_obj, cnt, addr);
}
```
**②`__slab_free`**
>**概述**：**清理对象信息**并将其释放回所在的`slab`中，更新`slab`并根据不同情况调整`slab`的**所在位置**
{%list%}
如果释放对象后slab从partial slab变为empty slab，需要将其插入kmem_cache_node的partial链表中
{%endlist%}
>**前提条件**为其不在`kmem_cache_cpu`的`partial`链表中
{%right%}
如果释放对象后slab从full slab变为partial slab，且其不在kmem_cache_cpu的partial链表中，需要将其插入该链表
{%endright%}
>因为`slab`为`full slab`说明进程经常从该`slab`中分配对象，拥有**较好的局部性**
{%warning%}
将slab插入kmem_cache_node或kmem_cache_cpu的partial链表前，需要判断slab的个数是否超出了对应限制
{%endwarning%}
>如果`kmem_cache_cpu->partial`的`slab`数量过多，需要先将其所有`slab`转移到`kmem_cache_node->partial`

>随后将**释放对象对应**的`slab`插入到`kmem_cache_cpu->partial`

>如果`kmem_cache_node->partial`的`slab`数量过多，则将**释放对象对应**的`slab`回收到**伙伴系统**
```c
static void __slab_free(struct kmem_cache *s, struct page *page,
            void *head, void *tail, int cnt,
            unsigned long addr)

{
  // 用于指向对象释放回 slab 之前，slab 的 freelist
  void *prior;
  // 对象所属的 slab 之前是否在本地 cpu 缓存 partial 链表中
  int was_frozen;
  // 后续会对 slab 对应的 page 结构相关属性进行修改，将其保存在new中
  struct page new;
  unsigned long counters;
  struct kmem_cache_node *n = NULL;
  stat(s, FREE_SLOWPATH);

  // 清理对象内存无用信息，重新恢复对象内存布局到初始状态
  if (kmem_cache_debug(s) &&
    !free_debug_processing(s, page, head, tail, cnt, addr))
    return;

  do {
    // 获取 slab 中的空闲对象列表
    prior = page->freelist;
    counters = page->counters;
    // 将释放的对象插入到 freelist 的头部，将对象释放回 slab
    // 将 tail 对象的 freepointer 设置为 prior
    set_freepointer(s, tail, prior);
    // 将原有 slab 的相应属性赋值给 new page
    new.counters = counters;
    // 获取原来 slab 中的 frozen 状态，判断其是否在 cpu 缓存 partial 链表中
    was_frozen = new.frozen;
    // 更新 inuse 即已经分配出去的对象个数
    new.inuse -= cnt;
    // !new.inuse 表示此时 slab 变为了一个 empty slab
    // !prior 表示由于本次对象的释放，slab 刚刚从一个 full slab 变成了一个 partial slab
    // !was_frozen 表示该 slab 不在 cpu 本地缓存以及其 partial 列表中
    if ((!new.inuse || !prior) && !was_frozen) {
      // 如果 cpu 本地缓存 kmem_cache_cpu 结构中包含 partial 链表且 !prior 成立
      // 冻结该 slub，后续会将该 slub 插入到 kmem_cache_cpu 的 partial 列表中
      // 反之直接那么直接释放至 kmem_cache_node 中
      if (kmem_cache_has_cpu_partial(s) && !prior) {
        new.frozen = 1;
      } else { 
        n = get_node(s, page_to_nid(page));
        // 后续会操作 kmem_cache_node 中的 partial 列表，所以这里需要获取 list_lock
        spin_lock_irqsave(&n->list_lock, flags);
      }
    }
    // cas 更新 slub 中的 freelist 以及 counters
  } while (!cmpxchg_double_slab(s, page,
      prior, counters,
      head, new.counters,
      "__slab_free"));

  // 如果 !n 成立，表示slab应该被插入到 cpu 本地缓存的 partial 链表中
  if (likely(!n)) {
    if (new.frozen && !was_frozen) {
      // 将 slub 插入到 kmem_cache_cpu 中的 partial 列表中
      put_cpu_partial(s, page, 1);
      stat(s, CPU_PARTIAL_FREE);
    }
    // 因为之前已经通过 set_freepointer 将对象释放回 slub 了，这里只需要记录 slub 状态即可
    if (was_frozen)
      stat(s, FREE_FROZEN);
    return;
  }
  
  // 如果 n 被创建，表示slab应该被插入到 kmem_cache_node 的 partial 链表中
  // 在此之前，需要判断 kmem_cache_node->nr_partial 是否大于 kmem_cache->min_partial
  // 如果是，需要将其释放回伙伴系统，而不是插入 kmem_cache_node 的 partial 链表
  if (unlikely(!new.inuse && n->nr_partial >= s->min_partial))
    goto slab_empty;

  // 如果 cpu 本地缓存中没有配置 partial 列表并且 slab 刚刚从 full slab 变为 partial slab
  // 则将 slab 插入到 kmem_cache_node 中
  if (!kmem_cache_has_cpu_partial(s) && unlikely(!prior)) {
    remove_full(s, n, page);
    add_partial(n, page, DEACTIVATE_TO_TAIL);
    stat(s, FREE_ADD_PARTIAL);
  }
  spin_unlock_irqrestore(&n->list_lock, flags);
  // 剩下的情况均属于 slab 原来就在 kmem_cache_node 中的 partial 列表中
  // 直接将对象释放回 slab 即可，无需改变 slab 的位置，直接返回
  return;

slab_empty:
  // 将 slub 从对应的管理链表上删除
  if (prior) {
      remove_partial(n, page);
      stat(s, FREE_REMOVE_PARTIAL);
  } else {
      remove_full(s, n, page);
  }
  spin_unlock_irqrestore(&n->list_lock, flags);
  stat(s, FREE_SLAB);
  // 释放 slub 回伙伴系统，底层调用 __free_pages 将 slub 所管理的所有 page 释放回伙伴系统
  discard_slab(s, page);
}
```
