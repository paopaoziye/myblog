---
title: FreeRTOS源码阅读（二）
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
tags:
  - FreeRTOS
categories: RTOS
updated: ''
img: /medias/featureimages/38.webp
date: 2026-09-08 11:07:54
keywords:
summary: FreeRTOS内存管理，主要围绕heap_4.c
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（二）
#### 内存管理
**①引言**
>**概述**：`FreeRTOS`创建内核对象时，需要为其**控制结构**及**相关存储区域**提供内存，有**静态内存分配**与**动态内存分配**两种方式
{%list%}
静态内存分配由用户提前提供对象所需内存，动态内存分配则由FreeRTOS在对象创建时从Heap中动态申请内存
{%endlist%}
{%right%}
FreeRTOS提供五种不同的动态内存分配算法，即portable/MemMang下的heap_x.c，统一实现pvPortMalloc和vPortFree接口
{%endright%}
>`heap_1.c`：只支持内存申请而**不支持释放**，通过不断移动**堆顶指针**完成内存申请，适合**对象创建后长期不删除**的系统

>`heap_2.c`：支持内存申请和释放，空闲内存块按照**块的大小**升序排列，但不会合并相**邻空闲块**，长期运行**容易产生碎片**

>`heap_3.c`：本质上是对标准`C`库的`malloc()`和`free()`的封装，其具体的**内存分配**与**释放机制**由底层`C`库实现决定

>`heap_4.c`：支持内存申请和释放，空闲内存块按照**起始地址大小**升序排列，采用**首次匹配算法**并支持**合并相邻空闲块**

>`heap_5.c`：在`heap_4.c`的基础上增加了对**多个非连续内存区域**的支持，适合系统中存在多块独立`RAM`区域的情况
{%warning%}
heap_3.c的实时性、内存碎片和线程安全依赖底层C库实现，可控性相对较弱，通常用于需要复用标准库内存管理机制的场景
{%endwarning%}
**②匹配算法**
>**概述**：常用的匹配算法有**最佳匹配算法**、**首次匹配算法**、**最坏匹配算法**和**临近匹配算法**，如下所示
{%list%}
在动态内存频繁申请和释放的过程中，往往会产生一些无法被充分利用的内存空间，主要分为内部碎片和外部碎片
{%endlist%}
>**内部碎片**：指**已分配内存块中**未被实际使用的空间，主要来源于**内存对齐**、**固定分配粒度**以及**最小块大小限制**

>**外部碎片**：指空闲内存被分散成**多个不连续的小块**，主要来源于**不同大小**内存块的**频繁申请和释放**
{%right%}
heap_4.c和heap_5.c采用首次匹配降低空闲块搜索开销，并结合相邻空闲块合并机制，在分配效率和碎片控制之间取得较好平衡
{%endright%}
>`heap_2.c`采用**最佳匹配**，尽量保留较大的空闲块**供后续分配使用**，但是长时间运行容易产生**外部内存碎片**
{%warning%}
heap_2.c和heap_4.c的工作机制不同，所以其空闲内存块组织方式不同，前者基于内存块大小，后者基于内存块起始地址
{%endwarning%}
>按照**内存块大小**组织空闲内存便于优先找到**与申请大小最接近的空闲块**，按照**内存块起始地址**组织空闲内存便于**合并相邻内存块**

![匹配算法](/image/FreeRTOS_1.png)
**③堆初始化**
>**概述**：以下主要围绕`heap_4.c`进行拆解，其相关**数据结构**、**统计信息**、**宏定义**和**堆初始化接口**`prvHeapInit`如下所示
{%list%}
heap_4.c采用静态数组作为内存堆，每个内存块都有一个块头BlockLink_t，将空闲内存块按照起始地址大小串联为一个单向链表
{%endlist%}
{%right%}
内存堆有两个哨兵节点xStart和pxEnd，初始时整个内存堆（不包含pxEnd）为唯一的空闲内存块，详细如下图所示
{%endright%}
{%warning%}
内存对齐要求数据起始地址满足一定的规则，若不满足内存对齐，会增加访问内存所需的CPU周期数甚至引发异常
{%endwarning%}
![初始堆内存](/image/Freertos_5.png)
```c
/* 控制释放内存时是否清零：未定义 configHEAP_CLEAR_MEMORY_ON_FREE 时，默认设为 0，即释放时不清零 */
#ifndef configHEAP_CLEAR_MEMORY_ON_FREE
    #define configHEAP_CLEAR_MEMORY_ON_FREE    0
#endif

// configAPPLICATION_ALLOCATED_HEAP 为 1 时使用外部 ucHeap，否则由本文件定义
#if ( configAPPLICATION_ALLOCATED_HEAP == 1 )
    // ucHeap 在其他文件中定义，可通过链接配置安排其存放位置
    extern uint8_t ucHeap[ configTOTAL_HEAP_SIZE ];
#else
    // 在本文件的特权数据区定义堆数组
    PRIVILEGED_DATA static uint8_t ucHeap[ configTOTAL_HEAP_SIZE ];
#endif /* 结束堆数组来源选择 */

/*
 * 空闲块链表节点，同时作为每个内存块前部的管理头
 * 空闲链表按内存地址升序排列，从而能够判断并合并物理相邻块
 */
typedef struct A_BLOCK_LINK
{
    // 指向地址更高的下一个空闲块，启用堆保护时保存异或编码后的地址
    struct A_BLOCK_LINK * pxNextFreeBlock;
    // 保存包含本块管理头在内的总字节数，最高位兼作已分配标志
    size_t xBlockSize;
} BlockLink_t;

// configENABLE_HEAP_PROTECTOR 为 1 时，使用随机指针保护值对链表指针进行异或编码
#if ( configENABLE_HEAP_PROTECTOR == 1 )

    // 外部函数通过输出参数返回随机指针保护值
    extern void vApplicationGetRandomHeapCanary( portPOINTER_SIZE_TYPE * pxHeapCanary );

    // 保存空闲链表指针使用的随机保护值
    PRIVILEGED_DATA static portPOINTER_SIZE_TYPE xHeapCanary;

    // 写入和读取指针时使用同一保护值异或，指针损坏后更容易被范围断言发现
    #define heapPROTECT_BLOCK_POINTER( pxBlock )    ( ( BlockLink_t * ) ( ( ( portPOINTER_SIZE_TYPE ) ( pxBlock ) ) ^ xHeapCanary ) )
#else

    // configENABLE_HEAP_PROTECTOR 不为 1 时，链表指针保持原值
    #define heapPROTECT_BLOCK_POINTER( pxBlock )    ( pxBlock )

#endif /* 结束堆保护器配置分支 */

// 断言解码后的块指针位于内部堆数组的首尾地址范围内
#define heapVALIDATE_BLOCK_POINTER( pxBlock )                          \
    configASSERT( ( ( uint8_t * ) ( pxBlock ) >= &( ucHeap[ 0 ] ) ) && \
                  ( ( uint8_t * ) ( pxBlock ) <= &( ucHeap[ configTOTAL_HEAP_SIZE - 1 ] ) ) )

// 声明按地址插入空闲块并合并前后物理相邻块的内部函数
static void prvInsertBlockIntoFreeList( BlockLink_t * pxBlockToInsert ) PRIVILEGED_FUNCTION;

// 声明首次分配时调用的堆边界与首个空闲块初始化函数
static void prvHeapInit( void ) PRIVILEGED_FUNCTION;

// 把块头结构大小向上调整为端口对齐单位的整数倍
static const size_t xHeapStructSize = ( sizeof( BlockLink_t ) + ( ( size_t ) ( portBYTE_ALIGNMENT - 1 ) ) ) & ~( ( size_t ) portBYTE_ALIGNMENT_MASK );

// 起始哨兵保存空闲链表入口；结束哨兵指针在首次初始化后指向堆尾块头
PRIVILEGED_DATA static BlockLink_t xStart;
PRIVILEGED_DATA static BlockLink_t * pxEnd = NULL;

/* 堆使用情况和操作次数统计 */
PRIVILEGED_DATA static size_t xFreeBytesRemaining = ( size_t ) 0U;             // 当前空闲字节总数，不代表最大连续空闲块
PRIVILEGED_DATA static size_t xMinimumEverFreeBytesRemaining = ( size_t ) 0U;  // 历史最小空闲字节数
PRIVILEGED_DATA static size_t xNumberOfSuccessfulAllocations = ( size_t ) 0U;  // 成功分配次数
PRIVILEGED_DATA static size_t xNumberOfSuccessfulFrees = ( size_t ) 0U;        // 成功释放次数
```
```c
/*
 * 函数功能：
 * 初始化哨兵节点xStart和pxEnd，将剩余内存作为第一个空闲内存块并建立链表逻辑，最后更新相关统计信息
 *
 * 参数：
 * 无
 *
 * 返回值：
 * 无返回值
 */
static void prvHeapInit( void )
{
    // 指向初始化后创建的第一个空闲块
    BlockLink_t * pxFirstFreeBlock;

    // 保存整理后的堆首地址和堆尾结束标记地址
    portPOINTER_SIZE_TYPE uxStartAddress, uxEndAddress;

    // 记录实际可用于初始化堆的容量
    size_t xTotalHeapSize = configTOTAL_HEAP_SIZE;

    // 转成整数地址，便于检查和调整堆首的对齐位置，32位系统上默认为uint32_t
    uxStartAddress = ( portPOINTER_SIZE_TYPE ) ucHeap;

    // 堆首未对齐时，将它移到下一个对齐位置
    if( ( uxStartAddress & portBYTE_ALIGNMENT_MASK ) != 0 )
    {
        // 未对齐的地址加上“对齐值减一”，跨到下一个对齐区间
        uxStartAddress += ( portBYTE_ALIGNMENT - 1 );

        // 清掉地址低位，得到对齐后的堆首地址
        uxStartAddress &= ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK );

        // 扣掉堆数组开头因对齐而不能使用的字节
        xTotalHeapSize -= ( size_t ) ( uxStartAddress - ( portPOINTER_SIZE_TYPE ) ucHeap );
    }

    // 启用堆保护时，获取用于编码空闲链表指针的随机值
    #if ( configENABLE_HEAP_PROTECTOR == 1 )
    {
        // 将随机指针保护值保存到 xHeapCanary
        vApplicationGetRandomHeapCanary( &( xHeapCanary ) );
    }
    #endif

    // 将空闲链表表头连接到堆中的第一个空闲块
    xStart.pxNextFreeBlock = ( void * ) heapPROTECT_BLOCK_POINTER( uxStartAddress );

    // 链表表头不对应实际堆块，因此块大小为零
    xStart.xBlockSize = ( size_t ) 0;

    // 计算这段堆空间末尾的地址
    uxEndAddress = uxStartAddress + ( portPOINTER_SIZE_TYPE ) xTotalHeapSize;

    // 在堆尾留出一个块管理头，用作空闲链表的结束标记
    uxEndAddress -= ( portPOINTER_SIZE_TYPE ) xHeapStructSize;

    // 将结束标记的地址向下调整到对齐位置
    uxEndAddress &= ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK );

    // 让 pxEnd 指向堆尾的结束标记
    pxEnd = ( BlockLink_t * ) uxEndAddress;

    // pxEnd 不包含可分配空间
    pxEnd->xBlockSize = 0;

    // 空指针表示空闲链表到此结束
    pxEnd->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( NULL );

    // 在对齐后的堆首放置第一个空闲块的管理头
    pxFirstFreeBlock = ( BlockLink_t * ) uxStartAddress;

    // 第一个空闲块占据堆首到结束标记之间的全部空间
    pxFirstFreeBlock->xBlockSize = ( size_t ) ( uxEndAddress - ( portPOINTER_SIZE_TYPE ) pxFirstFreeBlock );

    // 第一个空闲块后面连接堆尾的结束标记
    pxFirstFreeBlock->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( pxEnd );

    // 初始时只有一个空闲块，当前值也是历史最小空闲量
    xMinimumEverFreeBytesRemaining = pxFirstFreeBlock->xBlockSize;
    xFreeBytesRemaining = pxFirstFreeBlock->xBlockSize;
}
```

**④内存块分配**
>**概述**：接口为`pvPortMalloc`，负责**从头遍历**空闲链表并分配**第一个符合要求**的空闲内存块，并视情况进行**内存块分割**
{%list%}
申请内存块的真实所需大小为用户请求大小 + 块头 + 补充字节，补充字节用于满足内存对齐要求
{%endlist%}
{%right%}
heap4.c使用内存块大小的最高位作为内存块是否被分配的标记，当最高位为1时，表明该内存块被分配
{%endright%}
{%warning%}
如果分配的内存块大小减去真实所需大小大于heapMINIMUM_BLOCK_SIZE，需要进行内存块分割控制内部碎片
{%endwarning%}
{%wrong%}
在内存分配前，需要检查申请内存块大小是否会导致堆溢出和整数溢出，且最终的内存块大小最高位不能为1
{%endwrong%}
```c
// 拆分后剩余部分必须大于两个对齐块头，避免产生过小的独立空闲块
#define heapMINIMUM_BLOCK_SIZE    ( ( size_t ) ( xHeapStructSize << 1 ) )

/* size_t 位宽和算术溢出检查相关 */
#define heapBITS_PER_BYTE                         ( ( size_t ) 8 )                                                    // 每字节 8 位，供最高位标志计算使用
#define heapSIZE_MAX                              ( ~( ( size_t ) 0 ) )                                               // size_t 能表示的最大值
#define heapMULTIPLY_WILL_OVERFLOW( a, b )        ( ( ( a ) > 0 ) && ( ( b ) > ( heapSIZE_MAX / ( a ) ) ) )           // 判断 a*b 是否溢出
#define heapADD_WILL_OVERFLOW( a, b )             ( ( a ) > ( heapSIZE_MAX - ( b ) ) )                                // 判断 a+b 是否溢出
#define heapSUBTRACT_WILL_UNDERFLOW( a, b )       ( ( a ) < ( b ) )                                                   // 判断 a-b 是否下溢

/* 内存块分配状态相关 */
#define heapBLOCK_ALLOCATED_BITMASK               ( ( ( size_t ) 1 ) << ( ( sizeof( size_t ) * heapBITS_PER_BYTE ) - 1 ) )  // xBlockSize 的最高位作为已分配标志
#define heapBLOCK_SIZE_IS_VALID( xBlockSize )      ( ( ( xBlockSize ) & heapBLOCK_ALLOCATED_BITMASK ) == 0 )                // 最高位未占用时，块大小有效
#define heapBLOCK_IS_ALLOCATED( pxBlock )          ( ( ( pxBlock->xBlockSize ) & heapBLOCK_ALLOCATED_BITMASK ) != 0 )       // 判断内存块是否已分配
#define heapALLOCATE_BLOCK( pxBlock )              ( ( pxBlock->xBlockSize ) |= heapBLOCK_ALLOCATED_BITMASK )               // 把内存块标记为已分配
#define heapFREE_BLOCK( pxBlock )                  ( ( pxBlock->xBlockSize ) &= ~heapBLOCK_ALLOCATED_BITMASK )              // 把内存块标记为空闲
```
```c

```
**②内存块释放**
>**概述**：找到释放内存块**真正的起始地址**，并使用`prvInsertBlockIntoFreeList`将其添加到空闲链表
{%list%}
用户使用的内存不包含块头BlockLink_t，所以需要将用户传入地址前移xHeapStructSize得到内存块真实起始地址
{%endlist%}
{%right%}
可以定义configHEAP_CLEAR_MEMORY_ON_FREE将清除释放内存块内容防止信息外泄
{%endright%}
{%warning%}
在对内存块进行释放操作前，需要检查其地址有效性并检查其是否被分配以及是否不在空闲链表中
{%endwarning%}
```c
/* 内存块释放 */
void vPortFree( void * pv )
{
    //puc用于字节级别的地址计算，pxLink用于访问内存块的管理信息
    uint8_t * puc = ( uint8_t * ) pv;
    BlockLink_t * pxLink;
    //确保释放内存有效
    if( pv != NULL )
    {
        //找到内存块真正的起始地址
        puc -= xHeapStructSize;
        pxLink = ( void * ) puc;
        //确认块确实被分配以及pxLink->pxNextFreeBlock == NULL即内存块不在空闲链表中，防止块重复释放
        if( heapBLOCK_IS_ALLOCATED( pxLink ) != 0 )
        {
            if( pxLink->pxNextFreeBlock == NULL )
            {
                //将其标记为空闲
                heapFREE_BLOCK( pxLink );
                //如果定义了configHEAP_CLEAR_MEMORY_ON_FREE，将释放内存全部填充0
                #if ( configHEAP_CLEAR_MEMORY_ON_FREE == 1 )
                {
                    if( heapSUBTRACT_WILL_UNDERFLOW( pxLink->xBlockSize, xHeapStructSize ) == 0 )
                    {
                        ( void ) memset( puc + xHeapStructSize, 0, pxLink->xBlockSize - xHeapStructSize );
                    }
                }
                #endif
                //暂停调度并将该内存块通过prvInsertBlockIntoFreeList添加到空闲链表
                vTaskSuspendAll();
                {
                    xFreeBytesRemaining += pxLink->xBlockSize;
                    prvInsertBlockIntoFreeList( ( ( BlockLink_t * ) pxLink ) );
                    //增加xNumberOfSuccessfulFrees
                    xNumberOfSuccessfulFrees++;
                }
                //恢复调度
                ( void ) xTaskResumeAll();
            }
        }
    }
}
```
**③内存块合并**
>**概述**：遍历空闲链表找到其**插入位置**，并尝试进行**前驱块/后继块**和插入块的合并，最后将其插入空闲链表
{%list%}
空闲链表将内存块按照地址从低到高排列
{%endlist%}
{%right%}
当插入内存块的起始地址/结束地址等于其前驱块的结束地址/后继块的起始地址，说明需要发生内存块合并
{%endright%}
{%warning%}
如果需要合并后继块时后继块为pxEnd，只简单更新pxBlockToInsert->pxNextFreeBlock为pxEnd而不进行合并
{%endwarning%}
```c
/* 将释放的内存块重新插入空闲列表，并执行前后相邻块的合并 */
static void prvInsertBlockIntoFreeList( BlockLink_t * pxBlockToInsert ) 
{
    //puc用于字节级别的地址计算，pxIterator用于访问内存块的管理信息
    BlockLink_t * pxIterator;
    uint8_t * puc;
    //遍历空闲列表，使得pxIterator的地址小于插入块，pxIterator->pxNextFreeBlock的地址大于插入块
    //即pxIterator指向前驱块，pxIterator->pxNextFreeBlock指向后驱块
    for( pxIterator = &xStart; pxIterator->pxNextFreeBlock < pxBlockToInsert; pxIterator = pxIterator->pxNextFreeBlock )
    {

    }
    puc = ( uint8_t * ) pxIterator;
    //如果前驱块的结束地址等于待插入块的起始地址，则合并两个内存块
    //pxBlockToInsert更新为pxIterator，即后续处理以前驱块为主
    if( ( puc + pxIterator->xBlockSize ) == ( uint8_t * ) pxBlockToInsert )
    {
        pxIterator->xBlockSize += pxBlockToInsert->xBlockSize;
        pxBlockToInsert = pxIterator;
    }
    puc = ( uint8_t * ) pxBlockToInsert;
    //如果待插入块的结束地址等于后继块的起始地址
    if( ( puc + pxBlockToInsert->xBlockSize ) == ( uint8_t * )pxIterator->pxNextFreeBlock )
    {
        //若后继块不为pxEnd，合并两个内存块
        if( pxIterator->pxNextFreeBlock != pxEnd )
        {
            pxBlockToInsert->xBlockSize += pxIterator->pxNextFreeBlock->xBlockSize;
            pxBlockToInsert->pxNextFreeBlock = pxIterator->pxNextFreeBlock->pxNextFreeBlock;
        }
        //反之只更新pxBlockToInsert->pxNextFreeBlock为pxEnd
        else
        {
            pxBlockToInsert->pxNextFreeBlock = pxEnd;
        }
    }
    //反之将更新pxBlockToInsert->pxNextFreeBlock为后继块
    else
    {
        pxBlockToInsert->pxNextFreeBlock = pxIterator->pxNextFreeBlock;
    }
    //如果没有发生前向合并，更新前驱块的pxNextFreeBlock指针
    if( pxIterator != pxBlockToInsert )
    {
        pxIterator->pxNextFreeBlock = pxBlockToInsert;
    }
}
```
