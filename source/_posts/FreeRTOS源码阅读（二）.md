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

>`heap_3.c`：本质上是对标准`C`库的`malloc`和`free`的封装，其具体的**内存分配**与**释放机制**由底层`C`库实现决定

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

**④`pvPortMalloc`**
>**概述**：负责**从头遍历**空闲链表使用**首次匹配算法**分配空闲内存块，并根据剩余空间决定是否进行**内存块分割**
{%list%}
内核实际分配的内存大小为用户请求大小 + 块头，并继续向上对齐到portBYTE_ALIGNMENT的整数倍
{%endlist%}
>`FreeRTOS`还提供`pvPortCalloc`，用于申请**连续堆内存**并将其初始化为`0`，本质上是对`pvPortMalloc`的封装
{%right%}
heap_4.c使用内存块大小的最高位作为内存块是否被分配的标记，当最高位为1时，表明该内存块被分配
{%endright%}
{%warning%}
如果选中空闲块在满足本次申请后，剩余空间大于heapMINIMUM_BLOCK_SIZE，需要进行内存块分割避免产生过小的空闲内存块
{%endwarning%}
{%wrong%}
分配前需要检查尺寸计算是否发生整数溢出、请求大小是否占用xBlockSize的最高状态位，以及请求大小是否超过当前总空闲内存
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
```
```c
/*
 * 函数功能：
 * 从按地址排序的空闲链表中选择首个足够大的块，必要时拆分，并返回块头后的有效载荷地址
 *
 * 参数：
 * xWantedSize  调用者请求的有效载荷字节数
 *
 * 返回值：
 * 非 NULL  指向已分配块有效载荷的首地址
 * NULL      请求尺寸无效、算术溢出、空闲总量不足或没有足够大的连续块
 */
void * pvPortMalloc( size_t xWantedSize )
{
    // 指向遍历后选中的空闲块
    BlockLink_t * pxBlock;
    // 记录选中块在空闲链表中的前驱，以便摘除或接入拆分块
    BlockLink_t * pxPreviousBlock;
    // 当选中块被拆分时，指向剩余空间形成的新空闲块头
    BlockLink_t * pxNewBlockLink;
    // 初始值为 NULL，分配成功后改为有效载荷地址
    void * pvReturn = NULL;
    // 保存把包含块头的请求尺寸补齐到对齐边界所需的额外字节数
    size_t xAdditionalRequiredSize;
    // 保存本次实际分配的块总大小，供跟踪接口使用
    size_t xAllocatedBlockSize = 0;

    // 零尺寸请求不参与块头开销与对齐计算
    if( xWantedSize > 0 )
    {
        // 先确认有效载荷尺寸加上块头尺寸不会发生 size_t 溢出
        if( heapADD_WILL_OVERFLOW( xWantedSize, xHeapStructSize ) == 0 )
        {
            // 实际块大小必须包含对调用者隐藏的管理头
            xWantedSize += xHeapStructSize;

            // portBYTE_ALIGNMENT_MASK 是端口对齐掩码，低位不为零表示当前大小尚未对齐
            if( ( xWantedSize & portBYTE_ALIGNMENT_MASK ) != 0x00 )
            {
                // portBYTE_ALIGNMENT 是端口要求的对齐字节数，这里计算还需补多少字节
                xAdditionalRequiredSize = portBYTE_ALIGNMENT - ( xWantedSize & portBYTE_ALIGNMENT_MASK );

                // 只有补齐操作不会令 size_t 溢出时才扩大请求尺寸
                if( heapADD_WILL_OVERFLOW( xWantedSize, xAdditionalRequiredSize ) == 0 )
                {
                    // 把实际块大小向上调整为端口要求的对齐倍数
                    xWantedSize += xAdditionalRequiredSize;
                }
                else
                {
                    // 对齐尺寸发生溢出，将请求大小置零，后续检查会拒绝该请求
                    xWantedSize = 0;
                }
            }
            else
            {
                // 标记请求尺寸原本已对齐的测试覆盖路径
                mtCOVERAGE_TEST_MARKER();
            }
        }
        else
        {
            // 加上块头后发生溢出，将请求大小置零，后续检查会拒绝该请求
            xWantedSize = 0;
        }
    }
    else
    {
        // 标记调用者传入零尺寸请求的测试覆盖路径
        mtCOVERAGE_TEST_MARKER();
    }

    // 暂停任务调度，串行保护首次初始化、链表修改以及堆统计量更新
    vTaskSuspendAll();
    {
        // 堆尾结束标记尚未创建，说明堆还没有初始化
        if( pxEnd == NULL )
        {
            // 建立对齐后的堆边界、空闲链表和初始统计量
            prvHeapInit();
        }
        else
        {
            // 标记堆已经初始化、无需重复初始化的测试覆盖路径
            mtCOVERAGE_TEST_MARKER();
        }

        // 最高位必须保持空闲，因为该位稍后用于记录块的所有权状态
        if( heapBLOCK_SIZE_IS_VALID( xWantedSize ) != 0 )
        {
            // 请求必须非零且不能超过全部空闲块的总字节数
            if( ( xWantedSize > 0 ) && ( xWantedSize <= xFreeBytesRemaining ) )
            {
                // 从地址最低的空闲块开始遍历，并同时维护当前节点的前驱
                pxPreviousBlock = &xStart;
                pxBlock = heapPROTECT_BLOCK_POINTER( xStart.pxNextFreeBlock );
                // 在解引用链表节点前确认解码指针仍落在堆数组内
                heapVALIDATE_BLOCK_POINTER( pxBlock );

                // 跳过过小的空闲块，直到找到足够大的块或到达链表末尾
                while( ( pxBlock->xBlockSize < xWantedSize ) && ( pxBlock->pxNextFreeBlock != heapPROTECT_BLOCK_POINTER( NULL ) ) )
                {
                    // 当前块成为下一候选块的前驱
                    pxPreviousBlock = pxBlock;
                    // 解码并沿地址有序链表取得下一个候选块
                    pxBlock = heapPROTECT_BLOCK_POINTER( pxBlock->pxNextFreeBlock );
                    // 每次推进后都验证候选块地址，尽早发现链表指针损坏
                    heapVALIDATE_BLOCK_POINTER( pxBlock );
                }

                // 当前节点不是结束标记，说明已经找到足够大的连续空闲块
                if( pxBlock != pxEnd )
                {
                    // 解码前驱保存的块地址并跳过块头，得到调用者可见的有效载荷地址
                    pvReturn = ( void * ) ( ( ( uint8_t * ) heapPROTECT_BLOCK_POINTER( pxPreviousBlock->pxNextFreeBlock ) ) + xHeapStructSize );
                    // 有效载荷仍应落在内部堆数组范围内
                    heapVALIDATE_BLOCK_POINTER( pvReturn );

                    // 从空闲链表摘除选中块，前驱直接接到其编码后的后继
                    pxPreviousBlock->pxNextFreeBlock = pxBlock->pxNextFreeBlock;

                    // 先断言选中块大小足以执行后续无符号减法
                    configASSERT( heapSUBTRACT_WILL_UNDERFLOW( pxBlock->xBlockSize, xWantedSize ) == 0 );

                    // 剩余空间足以容纳独立空闲块时，把选中块拆成已用部分和剩余部分
                    if( ( pxBlock->xBlockSize - xWantedSize ) > heapMINIMUM_BLOCK_SIZE )
                    {
                        // 新空闲块头位于选中块起点之后的 xWantedSize 偏移处
                        pxNewBlockLink = ( void * ) ( ( ( uint8_t * ) pxBlock ) + xWantedSize );
                        // 尺寸已对齐，因此拆分形成的新块头也必须满足端口对齐要求
                        configASSERT( ( ( ( size_t ) pxNewBlockLink ) & portBYTE_ALIGNMENT_MASK ) == 0 );

                        // 剩余块继承选中块超出请求的全部尾部空间
                        pxNewBlockLink->xBlockSize = pxBlock->xBlockSize - xWantedSize;
                        // 把选中块记录的大小缩减为本次实际请求的总块大小
                        pxBlock->xBlockSize = xWantedSize;

                        // 新空闲块位于原块地址处，直接接回前驱当前保存的后继
                        pxNewBlockLink->pxNextFreeBlock = pxPreviousBlock->pxNextFreeBlock;
                        // 前驱保存编码后的新块地址，恢复地址有序链表
                        pxPreviousBlock->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( pxNewBlockLink );
                    }
                    else
                    {
                        // 标记剩余空间过小、整个选中块都交给调用者的测试覆盖路径
                        mtCOVERAGE_TEST_MARKER();
                    }

                    // 从空闲总量中扣除最终交给调用者的块总大小
                    xFreeBytesRemaining -= pxBlock->xBlockSize;

                    // 当前空闲总量低于历史记录时更新最低水位
                    if( xFreeBytesRemaining < xMinimumEverFreeBytesRemaining )
                    {
                        // 更新历史最小空闲字节数
                        xMinimumEverFreeBytesRemaining = xFreeBytesRemaining;
                    }
                    else
                    {
                        // 标记本次分配未刷新最低水位的测试覆盖路径
                        mtCOVERAGE_TEST_MARKER();
                    }

                    // 在写入所有权标志前保存纯尺寸，供分配跟踪事件使用
                    xAllocatedBlockSize = pxBlock->xBlockSize;

                    // 置位块大小的最高位，将该块标记为已分配
                    heapALLOCATE_BLOCK( pxBlock );
                    // 已分配块不属于空闲链表，以受保护空指针标记其后继无效
                    pxBlock->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( NULL );
                    // 记录一次成功分配，供堆统计接口汇总
                    xNumberOfSuccessfulAllocations++;
                }
                else
                {
                    // 记录已经遍历到链表末尾但仍没有合适空闲块的测试路径
                    mtCOVERAGE_TEST_MARKER();
                }
            }
            else
            {
                // 标记请求为零或超过空闲总量的测试覆盖路径
                mtCOVERAGE_TEST_MARKER();
            }
        }
        else
        {
            // 标记请求尺寸占用所有权最高位而被拒绝的测试覆盖路径
            mtCOVERAGE_TEST_MARKER();
        }

        // 向跟踪设施报告结果地址以及本次实际占用的块总大小
        traceMALLOC( pvReturn, xAllocatedBlockSize );

        // 跟踪宏被配置为空时仍显式使用变量，避免产生未使用变量告警
        ( void ) xAllocatedBlockSize;
    }
    // 共享堆状态修改结束，恢复任务调度
    ( void ) xTaskResumeAll();

    // configUSE_MALLOC_FAILED_HOOK 为 1 时，分配失败后调用回调函数
    #if ( configUSE_MALLOC_FAILED_HOOK == 1 )
    {
        // 空返回地址表示本次请求没有获得内存块
        if( pvReturn == NULL )
        {
            // 调用分配失败回调函数
            vApplicationMallocFailedHook();
        }
        else
        {
            // 标记启用失败钩子但本次分配成功的测试覆盖路径
            mtCOVERAGE_TEST_MARKER();
        }
    }
    #endif

    // 无论成功或失败，返回值都必须满足端口对齐掩码检查；空指针通常也满足该表达式
    configASSERT( ( ( ( size_t ) pvReturn ) & ( size_t ) portBYTE_ALIGNMENT_MASK ) == 0 );
    // 返回有效载荷地址，分配失败时返回 NULL
    return pvReturn;
}
```
```c
/*
 * 函数功能：
 * 分配可容纳 xNum 个 xSize 字节元素的连续空间，并把有效载荷清零
 *
 * 参数：
 * xNum   元素数量
 * xSize  每个元素的字节数
 *
 * 返回值：
 * 非 NULL  已清零的有效载荷地址
 * NULL      尺寸乘法溢出或底层分配失败
 */
void * pvPortCalloc( size_t xNum,
                     size_t xSize )
{
    // 默认记录失败，只有乘法安全且 malloc 成功后才得到有效地址
    void * pv = NULL;

    // 先验证元素数量与元素大小的乘积能够由 size_t 表示
    if( heapMULTIPLY_WILL_OVERFLOW( xNum, xSize ) == 0 )
    {
        // 按全部元素所需的总字节数申请连续内存
        pv = pvPortMalloc( xNum * xSize );

        // 只有分配成功时才能访问并初始化有效载荷
        if( pv != NULL )
        {
            // 把所有元素占用的字节清零，实现 calloc 的初始化语义
            ( void ) memset( pv, 0, xNum * xSize );
        }
    }

    // 返回已清零地址，或把溢出与分配失败统一表示为空地址
    return pv;
}
```
**⑤`vPortFree`**
>**概述**：找到释放内存块**真实起始地址**，清除**分配标志**并通过`prvInsertBlockIntoFreeList`将其加入空闲链表并进行**内存块合并**
{%list%}
pvPortMalloc返回的块头之后的有效载荷地址，因此释放的时需要将用户传入地址向低地址方向回退xHeapStructSize得到真实地址
{%endlist%}
{%right%}
空闲链表中的内存块按照地址从低到高排列，因此插入位置的前驱和后继正好是最可能与释放块物理相邻的两个空闲块
{%endright%}
{%warning%}
释放前需要检查恢复出的块地址是否合法、内存块是否带有已分配标志，以及pxNextFreeBlock是否仍为受保护的NULL
{%endwarning%}
```c
/* 控制释放内存时是否清零：未定义 configHEAP_CLEAR_MEMORY_ON_FREE 时，默认设为 0，即释放时不清零 */
#ifndef configHEAP_CLEAR_MEMORY_ON_FREE
    #define configHEAP_CLEAR_MEMORY_ON_FREE    0
#endif
```
```c
/*
 * 函数功能：
 * 校验并释放一个已分配块，按配置擦除有效载荷，再把它插入地址有序链表并合并相邻块
 *
 * 参数：
 * pv  先前由本分配器返回的有效载荷地址；NULL 不触发任何操作
 *
 * 返回值：
 * 无返回值
 */
void vPortFree( void * pv )
{
    // 用字节指针保存调用者地址，便于向前移动到隐藏块头
    uint8_t * puc = ( uint8_t * ) pv;
    // 指向从有效载荷地址恢复出的块管理头
    BlockLink_t * pxLink;

    // 空地址无需执行块头恢复和链表操作
    if( pv != NULL )
    {
        // 有效载荷之前紧邻一个经过对齐的 BlockLink_t 管理头
        puc -= xHeapStructSize;

        // 把字节地址转换为块头指针，供后续读取大小和所有权状态
        pxLink = ( void * ) puc;

        // 在读取块头字段前确认恢复出的地址位于内部堆数组范围内
        heapVALIDATE_BLOCK_POINTER( pxLink );
        // 正常释放的块必须仍带有已分配所有权标志
        configASSERT( heapBLOCK_IS_ALLOCATED( pxLink ) != 0 );
        // 正常释放的块不应链接在空闲链表中
        configASSERT( pxLink->pxNextFreeBlock == heapPROTECT_BLOCK_POINTER( NULL ) );

        // 即使 configASSERT 未启用，也只处理带有已分配标志的块
        if( heapBLOCK_IS_ALLOCATED( pxLink ) != 0 )
        {
            // 受保护空后继进一步防止把已在空闲链表中的块重复释放
            if( pxLink->pxNextFreeBlock == heapPROTECT_BLOCK_POINTER( NULL ) )
            {
                // 清除块大小最高位，使 xBlockSize 恢复为纯块尺寸并标记为空闲
                heapFREE_BLOCK( pxLink );
                // configHEAP_CLEAR_MEMORY_ON_FREE 为 1 时，释放前清零有效载荷
                #if ( configHEAP_CLEAR_MEMORY_ON_FREE == 1 )
                {
                    // 块大小必须不小于块头，才能安全计算有效载荷长度
                    if( heapSUBTRACT_WILL_UNDERFLOW( pxLink->xBlockSize, xHeapStructSize ) == 0 )
                    {
                        // 跳过管理头，将整个有效载荷区域按字节清零
                        ( void ) memset( puc + xHeapStructSize, 0, pxLink->xBlockSize - xHeapStructSize );
                    }
                }
                #endif

                // 暂停任务调度，串行保护空闲链表、计数器和容量统计
                vTaskSuspendAll();
                {
                    // 先把该块的总大小归还到空闲字节统计值
                    xFreeBytesRemaining += pxLink->xBlockSize;
                    // 向跟踪设施报告调用者地址和本次释放的块总大小
                    traceFREE( pv, pxLink->xBlockSize );
                    // 按地址插回空闲链表，并尝试与前后物理相邻块合并
                    prvInsertBlockIntoFreeList( ( ( BlockLink_t * ) pxLink ) );
                    // 记录一次成功释放，供堆统计接口汇总
                    xNumberOfSuccessfulFrees++;
                }
                // 共享堆状态更新完成后恢复任务调度
                ( void ) xTaskResumeAll();
            }
            else
            {
                // 标记块后继状态异常、拒绝重复释放的测试覆盖路径
                mtCOVERAGE_TEST_MARKER();
            }
        }
        else
        {
            // 标记块未处于已分配状态、拒绝释放的测试覆盖路径
            mtCOVERAGE_TEST_MARKER();
        }
    }
}
```
```c
/*
 * 函数功能：
 * 按内存地址把空闲块插入链表，并在地址连续时与前驱和后继合并
 *
 * 参数：
 * pxBlockToInsert  待插入的空闲块头；调用者已清除其分配标志
 *
 * 返回值：
 * 无返回值
 */
static void prvInsertBlockIntoFreeList( BlockLink_t * pxBlockToInsert )
{
    // 遍历结束后指向插入位置之前的空闲块，插在链表开头时指向 xStart
    BlockLink_t * pxIterator;
    // 用字节地址计算块尾，以判断两个块在物理内存中是否连续
    uint8_t * puc;

    // 从链表头开始，按地址寻找待插入块的前一个节点
    for( pxIterator = &xStart; heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock ) < pxBlockToInsert; pxIterator = heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock ) )
    {
        // 循环推进由 for 的迭代表达式完成，循环体无需修改状态
    }

    // xStart 位于堆数组之外，仅对实际空闲块检查地址范围
    if( pxIterator != &xStart )
    {
        // 确认插入位置前驱仍位于内部堆数组范围内
        heapVALIDATE_BLOCK_POINTER( pxIterator );
    }

    // 将前驱起始地址转换为字节指针，以“起点加大小”计算其尾后地址
    puc = ( uint8_t * ) pxIterator;

    // 前驱尾后地址等于待插入块首地址时，两块在物理上相邻
    if( ( puc + pxIterator->xBlockSize ) == ( uint8_t * ) pxBlockToInsert )
    {
        // 扩大前驱块，使其覆盖待插入块的全部空间
        pxIterator->xBlockSize += pxBlockToInsert->xBlockSize;
        // 后续操作统一以合并后的前驱块作为待连接块
        pxBlockToInsert = pxIterator;
    }
    else
    {
        // 标记待插入块未与前驱相邻的测试覆盖路径
        mtCOVERAGE_TEST_MARKER();
    }

    // 重新计算当前待连接块的字节首地址，以检查它与后继是否相邻
    puc = ( uint8_t * ) pxBlockToInsert;

    // 当前块尾后地址等于解码后的后继地址时，两块在物理上相邻
    if( ( puc + pxBlockToInsert->xBlockSize ) == ( uint8_t * ) heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock ) )
    {
        // pxEnd 只表示链表末尾，不能把它占用的块头空间合并进普通空闲块
        if( heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock ) != pxEnd )
        {
            // 把后继空闲块大小并入当前块，形成更大的连续空闲区域
            pxBlockToInsert->xBlockSize += heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock )->xBlockSize;
            // 跳过被合并的后继块，继承它保存的受保护后继指针
            pxBlockToInsert->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( pxIterator->pxNextFreeBlock )->pxNextFreeBlock;
        }
        else
        {
            // 当前块紧邻堆尾时，直接连接到结束标记
            pxBlockToInsert->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( pxEnd );
        }
    }
    else
    {
        // 未与后继相邻时，保持链表关系并接到前驱原有的受保护后继
        pxBlockToInsert->pxNextFreeBlock = pxIterator->pxNextFreeBlock;
    }

    // 未与前驱合并时，需要显式让前驱指向新插入块
    if( pxIterator != pxBlockToInsert )
    {
        // 保存经过可选异或编码的待插入块地址
        pxIterator->pxNextFreeBlock = heapPROTECT_BLOCK_POINTER( pxBlockToInsert );
    }
    else
    {
        // 与前驱合并时前驱本身已在链表中，无需修改其前驱链接
        mtCOVERAGE_TEST_MARKER();
    }
}
```
**⑥状态检测**
>**概述**：`heap_4.c` 提供堆状态查询接口`vPortGetHeapStats`，用于查看**当前空闲空间**、**历史最低空闲空间**以及**空闲块分布情况**
{%list%}
除此之外，heap_4.c还提供其他接口查看堆内存的部分状态，如xPortGetFreeHeapSize用于查看空闲字节总量
{%endlist%}
{%right%}
通过比较总空闲空间、最大连续空闲块和空闲块数量，可以辅助判断堆中是否存在较严重的外部内存碎片
{%endright%}
{%warning%}
vPortGetHeapStats() 遍历空闲链表时会暂停任务调度，并在读取统计变量时短暂进入临界区，不宜在高实时性路径中频繁调用
{%endwarning%}

```c
/*
 * 函数功能：
 * 汇总空闲块数量、最大与最小块尺寸，以及分配释放计数和空闲水位
 *
 * 参数：
 * pxHeapStats  输出参数，接收当前堆统计快照
 *
 * 返回值：
 * 无返回值
 */
void vPortGetHeapStats( HeapStats_t * pxHeapStats )
{
    // 遍历期间指向当前空闲块
    BlockLink_t * pxBlock;
    // SIZE_MAX 是 size_t 能表示的最大值，便于首次比较时记录任意实际空闲块
    // 这三个变量分别累计空闲块数量、最大块大小和最小块大小
    size_t xBlocks = 0, xMaxSize = 0, xMinSize = SIZE_MAX;

    // 暂停任务调度，避免分配或释放在遍历过程中改变空闲链表
    vTaskSuspendAll();
    {
        // 从链表头取出第一个空闲块地址，并在启用保护时完成解码
        pxBlock = heapPROTECT_BLOCK_POINTER( xStart.pxNextFreeBlock );

        // 堆尚未初始化时链表入口为空，不执行块遍历
        if( pxBlock != NULL )
        {
            // 逐块访问，直到到达不计入空闲块数量的结束标记
            while( pxBlock != pxEnd )
            {
                // 当前节点代表一个独立的连续空闲区域
                xBlocks++;

                // 当前块大于已知最大值时刷新最大连续空闲块尺寸
                if( pxBlock->xBlockSize > xMaxSize )
                {
                    xMaxSize = pxBlock->xBlockSize;
                }

                // 当前块小于已知最小值时刷新最小空闲块尺寸
                if( pxBlock->xBlockSize < xMinSize )
                {
                    xMinSize = pxBlock->xBlockSize;
                }

                // 解码当前节点保存的后继地址并推进到下一空闲块
                pxBlock = heapPROTECT_BLOCK_POINTER( pxBlock->pxNextFreeBlock );
            }
        }
    }
    // 链表遍历结束后恢复任务调度
    ( void ) xTaskResumeAll();

    // 写出遍历得到的最大连续空闲块尺寸
    pxHeapStats->xSizeOfLargestFreeBlockInBytes = xMaxSize;
    // 写出遍历得到的最小空闲块尺寸；堆未初始化时保持初始 SIZE_MAX
    pxHeapStats->xSizeOfSmallestFreeBlockInBytes = xMinSize;
    // 写出地址链表中统计到的空闲块数量
    pxHeapStats->xNumberOfFreeBlocks = xBlocks;

    // 使用任务临界区读取可能被分配或释放路径更新的标量统计值
    taskENTER_CRITICAL();
    {
        // 写出所有空闲块的当前总字节数
        pxHeapStats->xAvailableHeapSpaceInBytes = xFreeBytesRemaining;
        // 写出成功分配累计次数
        pxHeapStats->xNumberOfSuccessfulAllocations = xNumberOfSuccessfulAllocations;
        // 写出成功释放累计次数
        pxHeapStats->xNumberOfSuccessfulFrees = xNumberOfSuccessfulFrees;
        // 写出运行以来记录到的最小空闲字节总量
        pxHeapStats->xMinimumEverFreeBytesRemaining = xMinimumEverFreeBytesRemaining;
    }
    // 统计快照复制完成后退出任务临界区
    taskEXIT_CRITICAL();
}
```