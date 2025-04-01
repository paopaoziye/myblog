---
title: Freertos入门（一）
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
  - 操作系统
categories: 工作流
keywords: 文章关键词
updated: ''
img: /medias/featureimages/38.webp
date:
summary: 内存管理
---
# Freertos
## Freertos入门（一）
### 1.引言
#### 1.1裸机设计模式
**①轮询**
>**概述**：在一个**死循环**中**依此调用**需要处理的任务函数
{%list%}
任务之间会相互影响，当有一个任务耗时较长时，会影响到其他任务，要求每个任务执行速度都较快
{%endlist%}
```c
void main(){ 
  /* 初始化 */
  init();
  /* 主循环 */
  while(1){
    do_task1();
    do_task2();
  }
}
```
**②前后台**
>**概述**：平常都是在**死循环**中运行**后台任务**，接收到**中断**后去执行对应的**前台任务**
{%list%}
后台程序无法影响到前台程序，但前台程序会影响到后台程序
{%endlist%}
{%right%}
本质上还是因为中断优先级较高，如果task1和task2都为前台任务，那么和轮询没有本质上的区别
{%endright%}
```c
void main(){
  /* 初始化 */
  init();
  /* 主循环 */
  while(1){
    do_task1();
  }
}
/* 中断处理函数 */
void task2_irq(){
  do_task2();
}
```
**③定时器驱动**
>**概述**：启动**定时器**，每隔一段时间产生一次**定时器中断**，中断函数在**合适的时间**调用**对应任务函数**
{%list%}
是前后台模式的一种，可以按照不用的频率执行各种函数
{%endlist%}
```c
void main(){
  /* 初始化 */
  init();
  while(1){
    //后台程序
  }
}
void timer_irq(){
  static int cnt;
  cnt++;
  if(cnt % 2 == 0){
    do_task1();
  }
  else if(cnt % 5 == 0){
    do_task2();
  }
}
```
**④状态机**
>**概述**：将一个任务拆分成**多个小任务**，**每次进入**到这个函数**只执行一个小任务**
{%list%}
状态机一定程度上解决了以上裸机设计模式的缺点，减少了任务之间的相互影响
{%endlist%}
{%right%}
状态机本质上是对时间片的模拟，让每个任务每次只执行一段时间
{%endright%}
{%warning%}
但是很多场景中，任务并不容易拆分为多个状态，且这些状态执行的时间并不好控制
{%endwarning%}
```c
void main(){
  /* 初始化 */
  init();
  /* 主循环 */
  while(1){
    do_task1();
    do_task2();
  }
}
/* 任务1处理函数 */
void do_task1(void){
  static int task1_state = 0;
  if(task1_state == 0){
    do_task1_state0();
    task1_state++;
  }else if(task1_state == 1){
    d0_task1_state1();
    task1_state++;
  }else{
    task1_state = 0;
  }
}
/* 任务2处理函数 */
void do_task2(void){
  static int task2_state = 0;
  if(task2_state == 0){
    do_task2_state0();
    task2_state++;
  }else if(task2_state == 1){
    d0_task2_state1();
    task2_state++;
  }else{
    task2_state = 0;
  }
}
```
#### 1.2FreeRTOS
**①简介**
>**概述**：一个轻量级且免费的**实时多任务操作系统**，被**移植**到了很多**不同的微处理器**上
{%list%}
Freertos内核由C语言编写，可移植性较高，通常情况下占⽤4k-9k字节的空间
{%endlist%}
{%right%}
Freertos提供任务调度、内存管理以及任务间通信等机制，可以解决裸机设计模式的缺点
{%endright%}
```c
void main(){
  //初始化
  init();
  //创建任务
  create_task(task1);
  create_task(task2);
  //启动调度器
  start_scheduler();
}
void task1(void){
  while(1){
    do_task1();
  }
}
void task2(void){
  while(1){
    do_task2();
  }
}
```
**②源码结构**
>**概述**：可以在[官网](https://freertos.org/)中下载到**源码**，下载的`FreeRTOSv202212.01`版本
{%list%}
这里只关注文件夹FreeRTOS，其中Demo存放示例程序，License存放许可信息，Source存放真正的源码
{%endlist%}
{%right%}
可以看到FreeRTOS的源码非常简洁，其中portable文件夹存放FreeRTOS和不同的编译环境和硬件之间的连接桥梁
{%endright%}
![FreeRTOS源码](/image/Freertos_1.png)
**③系统移植**
>**概述**：在**工程主目录**下创建`FreeRTOS`文件夹，并将**源码**复制到该目录下
{%list%}
需要对portable下的文件夹进行筛选，以MDK编译环境下的STM32F103为例，只需要保留keil、MemMang和RVDS
{%endlist%}
>`MemMang`存放**内存管理**相关文件，有五个`heapx.c`文件，选择合适的**内存管理算法**即可，通常选择`heap4.c`

>`keil`只有一个文件`See-also-the-RVDSdirectory.txt`，表示参考`RVDS`

>`RVDS`针对**不同架构**做出了分类，`STM32F103`保留`ARM_CM3`文件夹即可，其中有`port.c`和`portmacro.h`
{%right%}
在工程中新建分组FreeRTOS_CORE和FreeRTOS_PORTABLE，添加对应的源文件，随后添加对应的头文件路径
{%endright%}
>分组`FreeRTOS_CORE`和`FreeRTOS_PORTABLE`分别添加**FreeRTOS源码**和`portable`文件夹中的源文件

>**头文件路径**即`...\FreeRTOS\include`和`...\FreeRTOS\portable\RVDS\ARM_CM3`
{%warning%}
需要自己添加FreeRTOSConfig.h，即FreeRTOS的配置文件，可以从示例程序中寻找
{%endwarning%}
#### 1.3列表
**①简介**
>**概述**：`FreeRTOS`中的一个**数据结构**，**相关结构体**定义如下
{%list%}
由定义可知，FreeRTOS的列表实质是一个双向链表
{%endlist%}
{%right%}
listFIRST_LIST_INTEGRITY_CHECK_VALUE为FreeRTOS定义的一个宏，插入一个已知值，以验证数据完整性
{%endright%}
{%warning%}
configLIST_VOLATILE为FreeRTOS的定义一个宏，用于将相关变量标记为volatile，每次访问该变量时从内存中提取
{%endwarning%}
>因为该变量**被访问时**可能会被**另一个任务/中断**修改
```c
//列表
typedef struct xLIST
{
    listFIRST_LIST_INTEGRITY_CHECK_VALUE      
    volatile UBaseType_t uxNumberOfItems;      //列表项的数量
    ListItem_t * configLIST_VOLATILE pxIndex;  //链表索引指针，记录当前访问列表项
    MiniListItem_t xListEnd;                   //链表结束项
    listSECOND_LIST_INTEGRITY_CHECK_VALUE     
} List_t;
//列表项
struct xLIST_ITEM
{
    listFIRST_LIST_ITEM_INTEGRITY_CHECK_VALUE           
    configLIST_VOLATILE TickType_t xItemValue;           //列表项的值
    struct xLIST_ITEM * configLIST_VOLATILE pxNext;      //指向下一个列表项的指针
    struct xLIST_ITEM * configLIST_VOLATILE pxPrevious;  //指向上一个列表项的指针
    void * pvOwner;                                      //包含此列表项的对象的指针
    struct xLIST * configLIST_VOLATILE pxContainer;      //包含此列表项的列表的指针
    listSECOND_LIST_ITEM_INTEGRITY_CHECK_VALUE          
};
typedef struct xLIST_ITEM ListItem_t; 
//最小列表项
struct xMINI_LIST_ITEM
{
    listFIRST_LIST_ITEM_INTEGRITY_CHECK_VALUE
    configLIST_VOLATILE TickType_t xItemValue;
    struct xLIST_ITEM * configLIST_VOLATILE pxNext;
    struct xLIST_ITEM * configLIST_VOLATILE pxPrevious;
};
typedef struct xMINI_LIST_ITEM MiniListItem_t;
```
**②初始化**
>**概述**：**初始化**主要工作为设置**列表哨兵项**`pxList->xListEnd`，**遍历**主要工作为找到**下一个列表项**并返回其**所有者**
{%list%}
将列表哨兵项的前后指针指向自己，表示链表为空
{%endlist%}
{%right%}
遍历时遇到哨兵项会再向后移动一项
{%endright%}
```c
void vListInitialise( List_t * const pxList )
{
    /* 将列表索引项初始化为列表哨兵项 */
    pxList->pxIndex = ( ListItem_t * ) &( pxList->xListEnd );

    listSET_FIRST_LIST_ITEM_INTEGRITY_CHECK_VALUE( &( pxList->xListEnd ) );
    /* 将哨兵项的xItemValue设置为最大值portMAX_DELAY */
    pxList->xListEnd.xItemValue = portMAX_DELAY;
    /* 列表哨兵项的前指针和后指针都指向自己 */
    pxList->xListEnd.pxNext = ( ListItem_t * ) &( pxList->xListEnd );
    pxList->xListEnd.pxPrevious = ( ListItem_t * ) &( pxList->xListEnd ); 
    #if ( configUSE_MINI_LIST_ITEM == 0 )
    {
        pxList->xListEnd.pvOwner = NULL;
        pxList->xListEnd.pxContainer = NULL;
        listSET_SECOND_LIST_ITEM_INTEGRITY_CHECK_VALUE( &( pxList->xListEnd ) );
    }
    #endif
    /* 设置uxNumberOfItems为0 */
    pxList->uxNumberOfItems = ( UBaseType_t ) 0U;

    listSET_LIST_INTEGRITY_CHECK_1_VALUE( pxList );
    listSET_LIST_INTEGRITY_CHECK_2_VALUE( pxList );
}
```
```c
#define listGET_OWNER_OF_NEXT_ENTRY( pxTCB, pxList )                                           \
    {                                                                                          \
        //将传入的列表指针存储为常量
        List_t * const pxConstList = ( pxList );                                               \
        //将索引指针指向下一个列表项
        ( pxConstList )->pxIndex = ( pxConstList )->pxIndex->pxNext;                           \
        //如果新的索引指针指向了列表的结束标记，则再向后移动一次
        if( ( void * ) ( pxConstList )->pxIndex == ( void * ) &( ( pxConstList )->xListEnd ) ) \
        {                                                                                      \
            ( pxConstList )->pxIndex = ( pxConstList )->pxIndex->pxNext;                       \
        }                                                                                      \
        //并将传入的pxTCB设置为该列表项的所有者
        ( pxTCB ) = ( pxConstList )->pxIndex->pvOwner;                                         \
    }
```
**③插入**
>**概述**：常用的API为`vListInsert()`，函数定义如下，可知`FreeRTOS`列表项是按照**升序**排列的
{%list%}
还有一个API为vListInsertEnd()，将列表项插入到列表末尾
{%endlist%}
```c
void vListInsert( List_t * const pxList,
                  ListItem_t * const pxNewListItem )
{
  /* 指示插入位置的指针 */
  ListItem_t * pxIterator;
  const TickType_t xValueOfInsertion = pxNewListItem->xItemValue;
  /* 检查列表和列表项的完整性 */
  listTEST_LIST_INTEGRITY( pxList );
  listTEST_LIST_ITEM_INTEGRITY( pxNewListItem );
  /* 若插入项xItemValue成员为portMAX_DELAY，将其插入到列表末尾 */
  /* 反之，从头开始遍历列表，找到比插入项xItemValue大的第一个成员，将其插入该成员之前 */
  if( xValueOfInsertion == portMAX_DELAY )
  {
    pxIterator = pxList->xListEnd.pxPrevious;
  }
  else
  {
    for( pxIterator = ( ListItem_t * ) &( pxList->xListEnd ); 
    pxIterator->pxNext->xItemValue <= xValueOfInsertion; pxIterator = pxIterator->pxNext ) 
    {

    }
  }
  /* 将列表项插入列表，注意pxIterator此时指向比插入项xItemValue大的第一个成员的前一个成员 */
  pxNewListItem->pxNext = pxIterator->pxNext;
  pxNewListItem->pxNext->pxPrevious = pxNewListItem;
  pxNewListItem->pxPrevious = pxIterator;
  pxIterator->pxNext = pxNewListItem;

  pxNewListItem->pxContainer = pxList;

  ( pxList->uxNumberOfItems )++;
}
```
![列表插入](/image/Freertos_3.png)
### 2.内存管理
#### 2.1内存管理算法
**①heap1.c**
>**概述**：只分配内存，⼀旦申请内存成功就**不允许释放**
{%list%}
具有可确定性，即执⾏所花费的时间⼤多数都是⼀样的
{%endlist%}
{%right%}
适用于⼀旦创建好任务、信号量和队列就再也不会删除的应⽤
{%endright%}
**②heap2.c**
>**概述**：分配内存后**允许回收**，但是**不会合并空闲内存**
{%list%}
具有不可确定性，即每次调用相关函数花费的时间可能都不相同，但是远比mallo()和free()效率⾼
{%endlist%}
{%right%}
适用于申请释放内存大小较为稳定的应用，理想情况下不会产生内存碎片，即刚释放的内存刚好用于下一次分配
{%endright%}
{%warning%}
如果每次申请释放的内存大小较为随机，随着申请释放的次数增多，可能会导致过多的内存碎片
{%endwarning%}
![内存碎片](/image/Freertos_4.png)
**③heap3.c**
>**概述**：对标准C的函数`malloc()`和`free()`的简单封装，但是他们并非**线程安全**的，**FreeRTOS**对其做出**线程保护**
{%list%}
具有不可确定性，很少使用，通常是为了其可移植性
{%endlist%}
{%right%}
heap3.c中先暂停FreeRTOS的调度器，再去调用这些函数，使用这种方法实现了线程安全
{%endright%}
{%warning%}
在FreeRTOS中很少使用，因为在小型嵌入式系统中效率不高，会占用很多的代码空间，且会产生内存碎片
{%endwarning%}
**④heap4.c**
>**概述**：提供了⼀个最优的**匹配算法**，并且支持**内存块合并**
{%list%}
具有不可确定性，但是远比mallo()和free()效率⾼
{%endlist%}
{%right%}
不会产生严重的内存碎片，是最常用的方法
{%endright%}
**⑤heap5.c**
>**概述**：在`heap4.c`的基础上支持内存堆使用**多个不连续的内存块**
{%list%}
具有不可确定性，但是远比mallo()和free()效率⾼
{%endlist%}
{%right%}
当需要外接SRAM甚⾄⼤容量的SDRAM时，可以将内部RAM和他们一起当作堆使用，也可以使用heap4.c二选一
{%endright%}
{%warning%}
需要先调⽤函数vPortDefineHeapRegions()来对内存堆做初始化处理，指定使用的内存块起始地址和大小
{%endwarning%}
#### 2.2heap4.c实现
**①初始化**
>**概述**：主要工作为初始化`xStart`、`pxEnd`，分别为**空闲内存链表**的头部和尾部，并将**整个堆**视为**一个空闲内存**
{%list%}
由初始化代码可知，每个内存块都有其头部，空闲内存块的头部串联为一个单向链表
{%endlist%}
{%right%}
内存对齐即要求数据的起始地址满足一定的规则，即N字节的数据地址需要是N的倍数
{%endright%}
{%warning%}
若不满足内存对齐，会增加访问内存所需的CPU周期数，且某些硬件平台要求数据访问必须对齐，否则会出现异常
{%endwarning%}
```c
/* 相关数据结构 */
/* 被管理的堆，本质为一个静态数组，大小默认由编译器决定 */
PRIVILEGED_DATA static uint8_t ucHeap[ configTOTAL_HEAP_SIZE ];
/* 内存块头部结构体 */
typedef struct A_BLOCK_LINK
{
  struct A_BLOCK_LINK * pxNextFreeBlock;
  size_t xBlockSize;
} BlockLink_t;
/* 经过对齐处理后的内存块头部的大小 */
static const size_t xHeapStructSize = ( sizeof( BlockLink_t ) + ( ( size_t ) ( portBYTE_ALIGNMENT - 1 ) ) ) & ~( ( size_t ) portBYTE_ALIGNMENT_MASK );
/* 内存块头部链表的头节点和尾部节点指针 */
PRIVILEGED_DATA static BlockLink_t xStart;
PRIVILEGED_DATA static BlockLink_t * pxEnd = NULL;
```
```c
/* 初始化函数 */
static void prvHeapInit( void )
{
  BlockLink_t * pxFirstFreeBlock;
  uint8_t * pucAlignedHeap;
  portPOINTER_SIZE_TYPE uxAddress;
  size_t xTotalHeapSize = configTOTAL_HEAP_SIZE;
  /* 读取堆的起始地址，并且保证其对齐 */
  uxAddress = ( portPOINTER_SIZE_TYPE ) ucHeap;
  if( ( uxAddress & portBYTE_ALIGNMENT_MASK ) != 0 )
  {
    uxAddress += ( portBYTE_ALIGNMENT - 1 );
    uxAddress &= ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK );
    xTotalHeapSize -= uxAddress - ( portPOINTER_SIZE_TYPE ) ucHeap;
  }
  /* 读取对齐后的堆起始地址 */
  pucAlignedHeap = ( uint8_t * ) uxAddress;
  /* 初始化xStart，并将其后指针指向堆的起始地址 */
  xStart.pxNextFreeBlock = ( void * ) pucAlignedHeap;
  xStart.xBlockSize = ( size_t ) 0;
  /* 计算堆的末尾地址，并在堆的末尾处给pxEnd留出位置 */
  uxAddress = ( ( portPOINTER_SIZE_TYPE ) pucAlignedHeap ) + xTotalHeapSize;
  uxAddress -= xHeapStructSize;
  uxAddress &= ~( ( portPOINTER_SIZE_TYPE ) portBYTE_ALIGNMENT_MASK );
  pxEnd = ( BlockLink_t * ) uxAddress;
  /* 初始化pxEnd */
  pxEnd->xBlockSize = 0;
  pxEnd->pxNextFreeBlock = NULL;
  /* 创建第一个内存块头部 */
  pxFirstFreeBlock = ( BlockLink_t * ) pucAlignedHeap;
  pxFirstFreeBlock->xBlockSize = ( size_t ) ( uxAddress - ( portPOINTER_SIZE_TYPE ) pxFirstFreeBlock );
  pxFirstFreeBlock->pxNextFreeBlock = pxEnd;
  /* 初始化全局变量xMinimumEverFreeBytesRemaining和xFreeBytesRemaining，分别代表最小空闲内存和当前可用的空闲内存 */
  xMinimumEverFreeBytesRemaining = pxFirstFreeBlock->xBlockSize;
  xFreeBytesRemaining = pxFirstFreeBlock->xBlockSize;
}
```
![内存碎片](/image/Freertos_5.png)
**②申请**
>**概述**：检查堆的**初始化**，若申请的内存**合法**，则从**空闲块链表**中分配一块**空闲内存**，并将其**标记为分配**
{%list%}
若分配的空闲块过大，还需要将其分割出一块新的空闲内存
{%endlist%}
{%right%}
FreeRTOS将内存块大小的最高位用于标记该内存块是否被分配
{%endright%}
{%warning%}
由于分配内存过程中使用了公用数据xStart，所以需要挂起其他任务防止竞争
{%endwarning%}
```c
/* 标记内存块状态的相关宏 */
#define heapBLOCK_ALLOCATED_BITMASK    ( ( ( size_t ) 1 ) << ( ( sizeof( size_t ) * heapBITS_PER_BYTE ) - 1 ) )
#define heapBLOCK_SIZE_IS_VALID( xBlockSize )    ( ( ( xBlockSize ) & heapBLOCK_ALLOCATED_BITMASK ) == 0 )
#define heapBLOCK_IS_ALLOCATED( pxBlock )        ( ( ( pxBlock->xBlockSize ) & heapBLOCK_ALLOCATED_BITMASK ) != 0 )
#define heapALLOCATE_BLOCK( pxBlock )            ( ( pxBlock->xBlockSize ) |= heapBLOCK_ALLOCATED_BITMASK )
#define heapFREE_BLOCK( pxBlock )                ( ( pxBlock->xBlockSize ) &= ~heapBLOCK_ALLOCATED_BITMASK )
```
```c
void * pvPortMalloc( size_t xWantedSize )
{
  BlockLink_t * pxBlock;
  BlockLink_t * pxPreviousBlock;
  BlockLink_t * pxNewBlockLink;
  void * pvReturn = NULL;
  size_t xAdditionalRequiredSize;
  //暂停所有任务
  vTaskSuspendAll();
  {
    /* 如果堆没有被初始化，则初始化堆 */
    if( pxEnd == NULL )
    {
      prvHeapInit();
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }

    if( xWantedSize > 0 )
    {
      /* 每个内存块都需要一个头部，计算头部大小，需要满足对齐要求 */
      xAdditionalRequiredSize = xHeapStructSize + portBYTE_ALIGNMENT - ( xWantedSize & portBYTE_ALIGNMENT_MASK );
      /* 检查分配xWantedSize大小后是否会溢出 */
      if( heapADD_WILL_OVERFLOW( xWantedSize, xAdditionalRequiredSize ) == 0 )
      {
          xWantedSize += xAdditionalRequiredSize;
      }
      else
      {
          xWantedSize = 0;
      }
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }
    /* 检查是否被分配 */
    if( heapBLOCK_SIZE_IS_VALID( xWantedSize ) != 0 )
    {
      /* 如果有足够的空闲内存 */
      if( ( xWantedSize > 0 ) && ( xWantedSize <= xFreeBytesRemaining ) )
      {
        /* 开始遍历空闲内存块头部链表，直到找到合适的内存块 */
        pxPreviousBlock = &xStart;
        pxBlock = xStart.pxNextFreeBlock;
        while( ( pxBlock->xBlockSize < xWantedSize ) && ( pxBlock->pxNextFreeBlock != NULL ) )
        {
          pxPreviousBlock = pxBlock;
          pxBlock = pxBlock->pxNextFreeBlock;
        }
        /* 若pxBlock不等于pxEnd，表示找到了合适的内存块 */
        if( pxBlock != pxEnd )
        {
          /* 将pvReturn设置为该内存块初始地址加上内存块头部大小，并将该内存块从空闲链表中移除 */
          pvReturn = ( void * ) ( ( ( uint8_t * ) pxPreviousBlock->pxNextFreeBlock ) + xHeapStructSize );
          pxPreviousBlock->pxNextFreeBlock = pxBlock->pxNextFreeBlock;
          /*如果分配的空闲内存块减去需要的内存，剩余内存大于heapMINIMUM_BLOCK_SIZE，需要将剩余内存提取为新的空闲内存 */
          if( ( pxBlock->xBlockSize - xWantedSize ) > heapMINIMUM_BLOCK_SIZE )
          {
            pxNewBlockLink = ( void * ) ( ( ( uint8_t * ) pxBlock ) + xWantedSize );
            configASSERT( ( ( ( size_t ) pxNewBlockLink ) & portBYTE_ALIGNMENT_MASK ) == 0 );
            pxNewBlockLink->xBlockSize = pxBlock->xBlockSize - xWantedSize;
            pxBlock->xBlockSize = xWantedSize;
            /* 将该空闲块插入空闲链表 */
            prvInsertBlockIntoFreeList( pxNewBlockLink );
          }
          else
          {
            mtCOVERAGE_TEST_MARKER();
          }
          /* 更新剩余空闲内存大小和最小空闲内存块大小 */
          xFreeBytesRemaining -= pxBlock->xBlockSize;

          if( xFreeBytesRemaining < xMinimumEverFreeBytesRemaining )
          {
            xMinimumEverFreeBytesRemaining = xFreeBytesRemaining;
          }
          else
          {
            mtCOVERAGE_TEST_MARKER();
          }

          /* 将分配的内存块标记为已分配，并且记录成功分配的次数 */
          heapALLOCATE_BLOCK( pxBlock );
          pxBlock->pxNextFreeBlock = NULL;
          xNumberOfSuccessfulAllocations++;
        }
        else
        {
          mtCOVERAGE_TEST_MARKER();
        }
      }
      else
      {
        mtCOVERAGE_TEST_MARKER();
      }
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }
    /* 将该块标记为已分配 */
    traceMALLOC( pvReturn, xWantedSize );
  }
  /* 恢复所有任务 */
( void ) xTaskResumeAll();
/* 处理分配失败的情况 */
#if ( configUSE_MALLOC_FAILED_HOOK == 1 )
{
    if( pvReturn == NULL )
    {
        vApplicationMallocFailedHook();
    }
    else
    {
        mtCOVERAGE_TEST_MARKER();
    }
  }
  #endif
  /* 检查返回的地址是否对齐 */
  configASSERT( ( ( ( size_t ) pvReturn ) & ( size_t ) portBYTE_ALIGNMENT_MASK ) == 0 );
  return pvReturn;
}
```
**③释放**
>**概述**：若该内存块是**可释放**的，将其标记为**未分配**，并将其放回**空闲链表**
{%right%}
内存合并操作在空闲链表插入操作中实现，根据地址大小找到插入位置后，分别判断前后空闲链表项是否可以合并
{%endright%}
```c
void vPortFree( void * pv )
{
  uint8_t * puc = ( uint8_t * ) pv;
  BlockLink_t * pxLink;

  if( pv != NULL )
  {
    /* 找到内存块的头部 */
    puc -= xHeapStructSize;
    pxLink = ( void * ) puc;
    /* 确保这个内存块是被分配的且不是空闲块 */
    configASSERT( heapBLOCK_IS_ALLOCATED( pxLink ) != 0 );
    configASSERT( pxLink->pxNextFreeBlock == NULL );
    if( heapBLOCK_IS_ALLOCATED( pxLink ) != 0 )
    {
      if( pxLink->pxNextFreeBlock == NULL )
      {
        /* 将这个块标记为未分配 */
        heapFREE_BLOCK( pxLink );
        /* 如果定义了该宏，将内存清零 */
        #if ( configHEAP_CLEAR_MEMORY_ON_FREE == 1 )
        {
          ( void ) memset( puc + xHeapStructSize, 0, pxLink->xBlockSize - xHeapStructSize );
        }
        #endif
        /* 暂停所有任务 */
        vTaskSuspendAll();
        {
          /* 更新xFreeBytesRemaining和xNumberOfSuccessfulFrees，并将其放入空闲链表*/
          xFreeBytesRemaining += pxLink->xBlockSize;
          traceFREE( pv, pxLink->xBlockSize );
          prvInsertBlockIntoFreeList( ( ( BlockLink_t * ) pxLink ) );
          xNumberOfSuccessfulFrees++;
        }
        ( void ) xTaskResumeAll();
      }
      else
      {
        mtCOVERAGE_TEST_MARKER();
      }
    }
    else
    {
      mtCOVERAGE_TEST_MARKER();
    }
  }
}
```
```c
/* 空闲链表插入操作 */
static void prvInsertBlockIntoFreeList( BlockLink_t * pxBlockToInsert ) 
{
  BlockLink_t * pxIterator;
  uint8_t * puc;
  /* 遍历空闲内存链表，找到第一个地址高于pxBlockToInsert的空闲内存块的前一个空闲内存块 */
  for( pxIterator = &xStart; pxIterator->pxNextFreeBlock < pxBlockToInsert; pxIterator = pxIterator->pxNextFreeBlock )
  {
  }

  /* 记录该空闲内存块地址 */
  puc = ( uint8_t * ) pxIterator;
  /* 如果该空闲块和插入块为相邻内存块，将两块内存块合并 */
  if( ( puc + pxIterator->xBlockSize ) == ( uint8_t * ) pxBlockToInsert )
  {
    pxIterator->xBlockSize += pxBlockToInsert->xBlockSize;
    pxBlockToInsert = pxIterator;
  }
  else
  {
    mtCOVERAGE_TEST_MARKER();
  }

  /* 检查其与下一个空闲内存是否相邻，需要判断其是否为pxEnd */
  puc = ( uint8_t * ) pxBlockToInsert;

  if( ( puc + pxBlockToInsert->xBlockSize ) == ( uint8_t * ) pxIterator->pxNextFreeBlock )
  {
    if( pxIterator->pxNextFreeBlock != pxEnd )
    {
      pxBlockToInsert->xBlockSize += pxIterator->pxNextFreeBlock->xBlockSize;
      pxBlockToInsert->pxNextFreeBlock = pxIterator->pxNextFreeBlock->pxNextFreeBlock;
    }
    else
    {
      pxBlockToInsert->pxNextFreeBlock = pxEnd;
    }
  }
  else
  {
    pxBlockToInsert->pxNextFreeBlock = pxIterator->pxNextFreeBlock;
  }
  /* 如果pxIterator和pxBlockToInsert不相等，表示前后合并都没有发生 */
  if( pxIterator != pxBlockToInsert )
  {
    pxIterator->pxNextFreeBlock = pxBlockToInsert;
  }
  else
  {
    mtCOVERAGE_TEST_MARKER();
  }
}
```
