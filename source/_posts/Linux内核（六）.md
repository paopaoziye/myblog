---
title: Linux内核（六）
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
summary: 文件系统
---
# Linux内核（六）
## 文件系统
### 1.虚拟文件系统
#### 1.1引言
**①简介**
>**概述**：`Linux`对各种**文件系统**的一层抽象，从而通过**统一的系统调用接口**读写各种类型的文件
{%list%}
虚拟文件系统提供一个通用文件系统模型，包含任何文件系统都支持的功能接口和数据结构
{%endlist%}
{%right%}
通用文件系统模型根据实际文件系统的种类使用对应功能接口和数据结构
{%endright%}
>**用户空间**调用`write`，`write`调用**虚拟文件系统**的`sys_write`，`sys_write`调用**实际文件系统**对应接口

**②对象类型**
>**概述**：`VFS`主要对象类型有**超级块**、**索引节点**、**目录项**和**文件**
{%list%}
超级块代表一个具体的文件系统，索引节点代表一个具体的文件，目录项为文件路径的一部分
{%endlist%}
{%right%}
每个对象都包含一个操作对象xx_operations，描述内核针对该对象提供的对应接口
{%endright%}
{%warning%}
如果xx_operations中对应函数指针为NULL，会调用VFS提供的通用函数，通常什么也不做
{%endwarning%}

**③`Page Cache`**
>**概述**：本质上是由**内核管理**的内存区域，当进程调用`mmap`和**缓冲I/O**时，将**文件数据**读取到`Page Cache`
{%list%}
当进程访问文件时，会首先检查访问数据是否已经存在于Page Cache以减少磁盘访问，提高文件的读写性能
{%endlist%}
{%right%}
每个文件都有自己的Page Cache，通常对应于一个文件上的若干顺序块，因此可以通过顺序 I/O 的方式落盘
{%endright%}
{%warning%}
当系统内存紧张时，操作系统会回收不常用的Page Cache，并将它们写回磁盘或释放
{%endwarning%}
#### 1.2数据结构
**①`super_block`**
>**概述**：用于存储**特定文件系统**的信息，对应磁盘特定扇区中的**文件系统超级块/控制块**
{%list%}
如下所示，内核中所有超级块被组织在一个双向链表中
{%endlist%}
{%right%}
文件系统安装时，会从磁盘中读取文件系统超级块创建并初始化super_block结构
{%endright%}
{%warning%}
对于基于内存的文件系统如sysfs，内核会现场创建超级块并将其保存到内存中
{%endwarning%}
```c
struct super_block {
  /* 其余成员略 */
  struct list_head  s_list;              /* 指向组织所有超级块的双向链表 */
  dev_t      s_dev;                      /* 设备标识符 */
  struct file_system_type  *s_type;      /* 文件系统类型 */
  const struct super_operations  *s_op;  /* 超级块操作方法 */
  struct list_head  s_inodes;            /* 索引节点链表 */
} __randomize_layout;
```
**②`inode`**
>**概述**：用于存储**文件的元信息**，如**文件大小**和**数据在磁盘的位置**等，对应磁盘特定扇区中的**索引节点**
{%list%}
一个索引节点对应文件系统中的一个文件，当索引节点被访问时，内核会创建对应inode结构
{%endlist%}
{%right%}
VFS将目录视作为特殊的文件，存储该目录下所有文件的文件名、文件类型和对应的inode号
{%endright%}
{%warning%}
如果一个文件系统在磁盘上没有索引节点，文件系统都必须从磁盘中提取相关信息填充inode结构
{%endwarning%}
```c
struct inode {
  /* 其余成员略 */
  umode_t      i_mode;                    /* 代表的文件类型和访问权限 */
  unsigned int    i_flags;                /* 状态标志 */
  const struct inode_operations  *i_op;   /* inode操作方法 */
  struct super_block  *i_sb;              /* 所属超级块 */
  struct address_space  *i_mapping;       /* 指向文件所属 page cache */
  struct address_space  i_data;           /* 指向文件所属数据块 */
  unsigned long    i_ino;                 /* inode标识符 */
  loff_t      i_size;                     /* 文件的大小 */
  blkcnt_t    i_blocks;                   /* 文件占用的数据块数量 */
  struct list_head  i_lru;                /* inode所在LRU链表 */
} __randomize_layout;
```
**③`dentry`**
>**概述**：用于存储**文件路径**与`inode`之间的**映射关系**，内核执行**目录操作**时会现场创建**目录项对象**
{%list%}
目录项之间是相互关联的，多个目录项关联即形成目录结构，引用计数大于等于0的目录项对应一个有效索引节点
{%endlist%}
{%right%}
引用计数等于0的目录项说明其未被使用，但是由于局部性原理，需要保留在目录项缓存中
{%endright%}
{%warning%}
一个负状态的目录项没有对应的有效索引节点，因为该索引节点已经被删除或者对应路径不正确
{%endwarning%}
```c
struct dentry {
  /* 其余成员略 */
  struct dentry *d_parent;                /* 指向父目录项 */
  struct qstr d_name;                     /* 目录项的名称，包含文件名字符串以及其长度 */
  struct inode *d_inode;                  /* 对应的inode对象 */
  const struct dentry_operations *d_op;   /* 目录项操作方法 */
  struct super_block *d_sb;               /* 指向所属的超级块 */
  /* 目录项所属LRU链表或者等待链表 */
  union {
    struct list_head d_lru;    
    wait_queue_head_t *d_wait;  
  };
  struct list_head d_child;               /* 一级子目录项链表 */
  struct list_head d_subdirs;             /* 所有子目录项链表 */
} __randomize_layout;
```
**④`file`**
>**概述**：表示被**进程打开的文件**，由系统调用`open/close`**创建/销毁**
{%list%}
每个进程使用file结构数组存储所有打开的文件，对应下标即为文件描述符
{%endlist%}
{%warning%}
file结构是进程相关的，N个进程打开同一个文件会创建N个file结构，而inode和dentry结构与文件是一一对应的
{%endwarning%}
```c
struct task_struct {
  // 进程打开的文件信息
  struct files_struct  *files;
}
```
```c
struct files_struct {
  // 文件对象数组
  struct file __rcu * fd_array[NR_OPEN_DEFAULT];
};
```
```c
struct file {
  /* 其余成员略 */
  struct path    f_path;                  /* 存储相关路径信息，包含对应目录项和挂载点 */
  struct inode    *f_inode;               /* 对应inode结构 */
  const struct file_operations  *f_op;    /* 文件操作方法 */
  atomic_long_t    f_count;               /* 文件引用计数 */
  unsigned int     f_flags;               /* 文件状态 */
  fmode_t      f_mode;                    /* 文件访问模式 */
  loff_t      f_pos;                      /* 文件读取/写入位置 */
  struct fown_struct  f_owner;            /* 文件所属者 */
  struct address_space  *f_mapping;       /* 指向文件对应地址空间 */
} __randomize_layout
  __attribute__((aligned(4)));  /* lest something weird decides that 2 is OK */
```
### 2.文件系统
#### 2.1文件存储
**①连续空间存储**
>**概述**：文件**整个连续存放**在磁盘物理空间中，文件数据**紧密相连**
{%list%}
文件对应的索引节点需要记录文件起始块的位置和文件长度
{%endlist%}
{%right%}
连续空间存储方式读写效率很高，因为一次磁盘寻道就可以读出整个文件
{%endright%}
{%warning%}
连续空间存储方式有磁盘空间碎片和文件长度不易扩展的缺陷，磁盘中挪动文件非常耗时，进行磁盘规整不太现实
{%endwarning%}
**②链式方式存储**
>**概述**：文件**离散存放**在磁盘物理空间中，使用指针存放数据块的**链接关系**
{%list%}
如果指针存放在数据块中，称为隐式链接，如果指针存放在内存的文件分配表中，称为显式链接
{%endlist%}
{%right%}
隐式链接的查询在磁盘中进行，显式链接的查询在内存中进行的，后者减少了访问磁盘的次数并提高了检索速度
{%endright%}
{%warning%}
由于需要将文件分配表存放在内存中，显式链接不适用于大磁盘
{%endwarning%}
**③索引方式存储**
>**概述**：文件**离散存放**在磁盘物理空间中，每个文件都有一个**索引数据块**
{%list%}
文件对应的索引节点需要包含索引数据块的指针，索引数据块包含文件数据块的指针列表
{%endlist%}
{%right%}
如果文件过大，某些索引数据块指针对应的数据块也是索引数据块，类似于多级页表
{%endright%}
