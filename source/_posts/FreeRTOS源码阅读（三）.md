---
title: FreeRTOS源码阅读（三）
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
date: 2026-09-10 10:39:00
keywords:
  - FreeRTOS
  - 任务调度
  - 调度器
summary: FreeRTOS列表结构，主要围绕list.c和list.h
---
# RTOS
## FreeRTOS
### FreeRTOS源码阅读（三）
#### 列表结构
**①引言**
>**概述**：在深入`tasks.c`之前，需要先理解`list.c`和`list.h`，是`FreeRTOS`所提供的一种非常重要的**数据结构**，其定义如下所示
{%list%}
列表本质上是一个循环双向链表，每个节点均保存前驱指针和后继指针，并通过哨兵节点xListEnd将链表首尾连接起来
{%endlist%}
>**初始列表**仅包含一个**首尾自环**的`xListEnd`哨兵节点，`pxIndex`指向该节点，从而构成一个**空的循环双向链表**，如下所示
{%right%}
通过始终存在的xListEnd哨兵节点，链表在空表和非空状态下都能保持统一的循环结构，从而简化插入、删除和遍历时的边界处理
{%endright%}
{%warning%}
pxIndex并不是传统链表中的头指针，而是其遍历索引，链表中的首个普通节点实际由xListEnd.pxNext指向
{%endwarning%}
```c
/*
 * 可加入 FreeRTOS 链表的完整节点
 * 同时保存排序键、双向链接、所属对象以及当前容器
 */
struct xLIST_ITEM
{
    configLIST_VOLATILE TickType_t xItemValue;                 // 排序键，调度器中可表示优先级或解除阻塞的时刻
    struct xLIST_ITEM * configLIST_VOLATILE pxNext;            // 循环双向链表中的后继节点
    struct xLIST_ITEM * configLIST_VOLATILE pxPrevious;        // 循环双向链表中的前驱节点
    void * pvOwner;                                            // 内嵌此链表项的对象，调度器通常在此保存 TCB 地址
    struct xLIST * configLIST_VOLATILE pxContainer;            // 当前容纳此节点的链表，未入链或移除后为 NULL
};
typedef struct xLIST_ITEM ListItem_t;

/*
 * FreeRTOS 循环双向链表对象
 * 保存有效节点数、轮转遍历位置以及不计入长度的尾部哨兵
 */
typedef struct xLIST
{
    configLIST_VOLATILE UBaseType_t uxNumberOfItems;           // 链表中的普通节点数，不包含 xListEnd 哨兵
    ListItem_t * configLIST_VOLATILE pxIndex;                  // 轮转遍历索引，指向最近一次返回所有者的节点
    MiniListItem_t xListEnd;                                   // 最大排序键的尾部哨兵，同时提供循环链表的首尾入口
} List_t;

/* configUSE_MINI_LIST_ITEM 为 1 时，哨兵只保留排序和链接所需字段 */
#if ( configUSE_MINI_LIST_ITEM == 1 )
    /*
     * 链表尾部精简哨兵
     * 不包含所有者和容器字段，从而减少每个链表对象占用的存储空间
     */
    struct xMINI_LIST_ITEM
    {
        configLIST_VOLATILE TickType_t xItemValue;             // 固定设置为 portMAX_DELAY 的最大排序键
        struct xLIST_ITEM * configLIST_VOLATILE pxNext;        // 空链表时回指自身，非空时指向最小排序键节点
        struct xLIST_ITEM * configLIST_VOLATILE pxPrevious;    // 空链表时回指自身，非空时指向最大排序键普通节点
    };
    typedef struct xMINI_LIST_ITEM MiniListItem_t;
#else
    /* 未启用精简哨兵时复用完整链表项布局 */
    typedef struct xLIST_ITEM      MiniListItem_t;
#endif
```
```c
/*
 * 函数功能：
 * 初始化一个空链表，并建立首尾相接的哨兵节点
 *
 * 参数：
 * pxList  待初始化的链表对象，调用者负责提供有效存储空间
 *
 * 返回值：
 * 无返回值
 */
void vListInitialise( List_t * const pxList )
{
    // 遍历索引初始指向尾部哨兵，空链表中哨兵是唯一节点
    pxList->pxIndex = ( ListItem_t * ) &( pxList->xListEnd );

    // 使用最大延时值作为哨兵排序键，保证普通升序节点位于它之前
    pxList->xListEnd.xItemValue = portMAX_DELAY;

    // 空链表的前后指针都回指哨兵，形成闭合的双向环
    pxList->xListEnd.pxNext = ( ListItem_t * ) &( pxList->xListEnd );
    pxList->xListEnd.pxPrevious = ( ListItem_t * ) &( pxList->xListEnd );

    // 未使用精简哨兵结构时，还需初始化完整 ListItem_t 才具有的成员
    #if ( configUSE_MINI_LIST_ITEM == 0 )
    {
        // 哨兵不是任何任务或内核对象内嵌的节点，因此没有所有者
        pxList->xListEnd.pvOwner = NULL;
        // 哨兵属于链表结构本身，不登记为普通链表项
        pxList->xListEnd.pxContainer = NULL;
    }
    #endif

    // 哨兵不计入有效节点数，初始化后的链表长度为零
    pxList->uxNumberOfItems = ( UBaseType_t ) 0U;
}
/*
 * 函数功能：
 * 初始化一个链表项，使其处于尚未加入任何链表的状态
 *
 * 参数：
 * pxItem  待初始化的链表项，调用者负责提供有效存储空间
 *
 * 返回值：
 * 无返回值
 */
void vListInitialiseItem( ListItem_t * const pxItem )
{
    // 清空容器指针，表示该节点当前不属于任何链表
    pxItem->pxContainer = NULL;
}

```
**②列表插入**
>**概述**：`FreeRTOS`提供`vListInsertEnd`和`vListInsert`两种列表插入方式，分别用于维护**轮转访问顺序**以及`xItemValue`**升序排列**
{%list%}
vListInsertEnd直接将新节点插入当前pxIndex前一个位置，vListInsert则根据节点的xItemValue查找插入位置，使其保持升序排列
{%endlist%}
{%right%}
因为FreeRTOS通过pxIndex轮转访问列表元素，所以vListInsertEnd插入的新节点会被最后访问，相当于位于列表的逻辑尾部
{%endright%}
{%warning%}
vListInsert使用<=查找插入位置，因此当多个节点的xItemValue相同时，新节点会插入到已有同值节点之后
{%endwarning%}
{%wrong%}
同一列表通常应保持统一的插入规则，维护轮转顺序时使用vListInsertEnd，维护xItemValue排序时使用vListInsert，不宜混用
{%endwrong%}
```c
/*
 * 函数功能：
 * 将链表项插入当前遍历索引之前，使其在后续轮转遍历中最后被访问
 *
 * 参数：
 * pxList         目标链表
 * pxNewListItem  待插入且当前不属于其他链表的链表项
 *
 * 返回值：
 * 无返回值
 */
void vListInsertEnd( List_t * const pxList,
                     ListItem_t * const pxNewListItem )
{
    // 保存当前遍历索引，所有链接更新都围绕该位置完成
    ListItem_t * const pxIndex = pxList->pxIndex;

    // 新节点的后继设为遍历索引，前驱设为索引原来的前驱
    pxNewListItem->pxNext = pxIndex;
    pxNewListItem->pxPrevious = pxIndex->pxPrevious;

    // 将原前驱的后继和索引的前驱改为新节点，闭合双向链接
    pxIndex->pxPrevious->pxNext = pxNewListItem;
    pxIndex->pxPrevious = pxNewListItem;

    // 记录节点所在链表，后续移除操作可直接取得容器
    pxNewListItem->pxContainer = pxList;

    // 哨兵不参与计数，因此每插入一个普通节点长度加一
    ( pxList->uxNumberOfItems ) = ( UBaseType_t ) ( pxList->uxNumberOfItems + 1U );
}
```
```c
/*
 * 函数功能：
 * 按 xItemValue 升序插入链表项，相同键值的新节点排在已有同值节点之后
 *
 * 参数：
 * pxList         目标链表
 * pxNewListItem  待插入且已设置排序值的链表项
 *
 * 返回值：
 * 无返回值
 */
void vListInsert( List_t * const pxList,
                  ListItem_t * const pxNewListItem )
{
    // 指向搜索到的插入位置前驱节点
    ListItem_t * pxIterator;
    // 缓存新节点排序值，避免遍历期间重复解引用
    const TickType_t xValueOfInsertion = pxNewListItem->xItemValue;

    // 最大值与尾部哨兵键值相同，直接选择哨兵前驱以避免搜索循环越过哨兵后无法终止
    if( xValueOfInsertion == portMAX_DELAY )
    {
        pxIterator = pxList->xListEnd.pxPrevious;
    }
    else
    {
        // 从哨兵开始向前遍历，跳过所有键值小于或等于新值的节点
        // 使用小于等于可让同值新节点排在已有同值节点之后
        for( pxIterator = ( ListItem_t * ) &( pxList->xListEnd ); pxIterator->pxNext->xItemValue <= xValueOfInsertion; pxIterator = pxIterator->pxNext )
        {
            // 循环体无需修改状态，更新表达式负责推进到目标位置前驱
        }
    }

    // 将新节点接到搜索所得前驱与其原后继之间
    pxNewListItem->pxNext = pxIterator->pxNext;
    pxNewListItem->pxNext->pxPrevious = pxNewListItem;
    pxNewListItem->pxPrevious = pxIterator;
    pxIterator->pxNext = pxNewListItem;

    // 记录节点所在链表，使移除操作无需额外传入容器
    pxNewListItem->pxContainer = pxList;

    // 更新链表中普通节点的数量
    ( pxList->uxNumberOfItems ) = ( UBaseType_t ) ( pxList->uxNumberOfItems + 1U );
}
```
**③辅助操作**
>**概述**：`FreeRTOS`提供`uxListRemove`将指定节点**从所属列表中移除**，同时提供一组宏用于**获取节点**、**遍历列表**和**读取状态**
{%list%}
vListInsertEnd和节点移除操作均有对应的宏版本，而vListInsert由于需要遍历列表查找有序插入位置较为复杂则没有对应的宏版本
{%endlist%}
{%right%}
FreeRTOS将大量简单且高频的列表操作实现为宏，从而减少频繁函数调用带来的额外开销，提高内核执行效率
{%endright%}
{%warning%}
listREMOVE_ITEM和uxListRemove都只会解除节点与列表之间的链接关系，并不会释放其内存，需要由其所属对象或创建者管理
{%endwarning%}
{%wrong%}
单核调度通过pxIndex轮转访问列表节点，而SMP为避免多个核心共享同一遍历状态，不使用pxIndex进行轮转访问
{%endwrong%}
```c
/* 设置链表项所有者，通常把内嵌该节点的 TCB 与节点关联起来 */
#define listSET_LIST_ITEM_OWNER( pxListItem, pxOwner )    ( ( pxListItem )->pvOwner = ( void * ) ( pxOwner ) )
/* 取得链表项保存的所有者指针 */
#define listGET_LIST_ITEM_OWNER( pxListItem )             ( ( pxListItem )->pvOwner )
/* 设置链表项排序键，后续 vListInsert 将按该值升序定位 */
#define listSET_LIST_ITEM_VALUE( pxListItem, xValue )     ( ( pxListItem )->xItemValue = ( xValue ) )
/* 取得链表项排序键 */
#define listGET_LIST_ITEM_VALUE( pxListItem )             ( ( pxListItem )->xItemValue )
/* 取得链表首个普通节点的排序键，调用前应确保链表非空 */
#define listGET_ITEM_VALUE_OF_HEAD_ENTRY( pxList )        ( ( ( pxList )->xListEnd ).pxNext->xItemValue )
/* 取得链表首个普通节点；空链表时结果为尾部哨兵 */
#define listGET_HEAD_ENTRY( pxList )                      ( ( ( pxList )->xListEnd ).pxNext )
/* 沿循环双向链表取得指定节点的后继 */
#define listGET_NEXT( pxListItem )                        ( ( pxListItem )->pxNext )
/* 取得链表尾部哨兵的只读 ListItem_t 视图，便于遍历时判断结束 */
#define listGET_END_MARKER( pxList )                      ( ( ListItem_t const * ) ( &( ( pxList )->xListEnd ) ) )
/* 根据普通节点计数判断链表是否为空，返回 pdTRUE 或 pdFALSE */
#define listLIST_IS_EMPTY( pxList )                       ( ( ( pxList )->uxNumberOfItems == ( UBaseType_t ) 0 ) ? pdTRUE : pdFALSE )
/* 返回链表中的普通节点数，不包含尾部哨兵 */
#define listCURRENT_LIST_LENGTH( pxList )                 ( ( pxList )->uxNumberOfItems )
/* 取得链表首个普通节点的所有者，调用前应确保链表非空 */
#define listGET_OWNER_OF_HEAD_ENTRY( pxList )            ( ( &( ( pxList )->xListEnd ) )->pxNext->pvOwner )
/* 比较节点记录的容器与目标链表，返回 pdTRUE 或 pdFALSE */
#define listIS_CONTAINED_WITHIN( pxList, pxListItem )    ( ( ( pxListItem )->pxContainer == ( pxList ) ) ? ( pdTRUE ) : ( pdFALSE ) )
/* 返回链表项当前记录的容器指针；未入链或移除后结果为 NULL */
#define listLIST_ITEM_CONTAINER( pxListItem )            ( ( pxListItem )->pxContainer )
/* 通过哨兵排序键是否为 portMAX_DELAY 粗略判断链表是否已初始化 */
#define listLIST_IS_INITIALISED( pxList )                ( ( pxList )->xListEnd.xItemValue == portMAX_DELAY )
/*
 * 不返回剩余节点数的内联移除操作
 * pxItemToRemove 必须已加入某个链表，宏从其 pxContainer 取得容器
 * 先跨过该节点重连前后邻居；若遍历索引命中被删节点则回退到前驱
 * 最后清空容器指针并将普通节点计数减一
 */
#define listREMOVE_ITEM( pxItemToRemove ) \
    do {                                  \
        /* 节点保存其所属链表指针，因此可直接从节点取得容器 \
         * 并用于后续链接和计数更新 */                                                         \
        List_t * const pxList = ( pxItemToRemove )->pxContainer;                                    \
                                                                                                    \
        ( pxItemToRemove )->pxNext->pxPrevious = ( pxItemToRemove )->pxPrevious;                    \
        ( pxItemToRemove )->pxPrevious->pxNext = ( pxItemToRemove )->pxNext;                        \
        /* 若遍历索引命中待移除节点，则将索引回退到仍然有效的前驱 */                              \
        if( pxList->pxIndex == ( pxItemToRemove ) )                                                 \
        {                                                                                           \
            pxList->pxIndex = ( pxItemToRemove )->pxPrevious;                                       \
        }                                                                                           \
                                                                                                    \
        ( pxItemToRemove )->pxContainer = NULL;                                                     \
        ( ( pxList )->uxNumberOfItems ) = ( UBaseType_t ) ( ( ( pxList )->uxNumberOfItems ) - 1U ); \
    } while( 0 )

/*
 * vListInsertEnd 的内联版本
 * 把 pxNewListItem 插到 pxList 当前遍历索引之前，使其他节点先被轮转访问
 * 宏会验证可选完整性校验值、建立双向链接、登记容器并增加节点计数
 */
#define listINSERT_END( pxList, pxNewListItem )           \
    do {                                                  \
        ListItem_t * const pxIndex = ( pxList )->pxIndex; \
        /* 不按排序键插入，而是把新节点放在当前遍历索引之前 \
         * 这样轮转遍历会先返回链表中的其他节点 \
         * 再次到达索引位置时才返回新节点 */                                                       \
        ( pxNewListItem )->pxNext = pxIndex;                                                        \
        ( pxNewListItem )->pxPrevious = pxIndex->pxPrevious;                                        \
                                                                                                    \
        pxIndex->pxPrevious->pxNext = ( pxNewListItem );                                            \
        pxIndex->pxPrevious = ( pxNewListItem );                                                    \
                                                                                                    \
        /* 登记节点所在链表，供常量时间移除操作直接定位容器 */                                    \
        ( pxNewListItem )->pxContainer = ( pxList );                                                \
                                                                                                    \
        ( ( pxList )->uxNumberOfItems ) = ( UBaseType_t ) ( ( ( pxList )->uxNumberOfItems ) + 1U ); \
    } while( 0 )
```
```c
/*
 * 函数功能：
 * 将指定链表项从其所属链表中摘除，并返回移除后的有效节点数
 *
 * 参数：
 * pxItemToRemove  待移除的链表项，其 pxContainer 必须指向所属链表
 *
 * 返回值：
 * 移除操作完成后链表中的普通节点数
 */
UBaseType_t uxListRemove( ListItem_t * const pxItemToRemove )
{
    // 从节点保存的容器指针取得所属链表
    List_t * const pxList = pxItemToRemove->pxContainer;

    // 让前后相邻节点彼此连接，从双向环中绕过待移除节点
    pxItemToRemove->pxNext->pxPrevious = pxItemToRemove->pxPrevious;
    pxItemToRemove->pxPrevious->pxNext = pxItemToRemove->pxNext;

    // 若遍历索引正指向待移除节点，则回退到其前驱以保持索引有效
    if( pxList->pxIndex == pxItemToRemove )
    {
        pxList->pxIndex = pxItemToRemove->pxPrevious;
    }
    else
    {
    }

    // 清空容器指针，显式标记该节点已脱离链表
    pxItemToRemove->pxContainer = NULL;
    // 普通节点数量随移除操作减一
    ( pxList->uxNumberOfItems ) = ( UBaseType_t ) ( pxList->uxNumberOfItems - 1U );

    // 调用者可据此判断链表是否已变为空链表
    return pxList->uxNumberOfItems;
}
```
```c
/*
 * 单核调度器的轮转遍历操作
 * pxTCB 为接收下一节点所有者的左值，pxList 为目标链表
 * 索引前进一步后若命中尾部哨兵，就再前进到首个普通节点
 * 调用者必须保证链表非空；SMP 调度器不使用 pxIndex，因此不定义此宏
 */
#if ( configNUMBER_OF_CORES == 1 )
    #define listGET_OWNER_OF_NEXT_ENTRY( pxTCB, pxList )                                       \
    do {                                                                                       \
        List_t * const pxConstList = ( pxList );                                               \
        /* 索引前进到下一节点后返回该节点所有者 */                                         \
        /* 若前进后命中尾部哨兵，则继续跳到首个普通节点 */                                 \
        ( pxConstList )->pxIndex = ( pxConstList )->pxIndex->pxNext;                           \
        if( ( void * ) ( pxConstList )->pxIndex == ( void * ) &( ( pxConstList )->xListEnd ) ) \
        {                                                                                      \
            ( pxConstList )->pxIndex = ( pxConstList )->xListEnd.pxNext;                       \
        }                                                                                      \
        ( pxTCB ) = ( pxConstList )->pxIndex->pvOwner;                                         \
    } while( 0 )
#else
/* SMP 调度器要求 pxIndex 保持指向 xListEnd，故意不提供会更新索引的轮转宏 */
#endif
```
