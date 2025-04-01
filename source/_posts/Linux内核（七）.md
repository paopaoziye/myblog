---
title: Linux内核（七）
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
summary: 进程同步和通信
---
# Linux内核（六）
## 进程同步和通信
### 1.进程同步
#### 1.1引言
**①同步**
>**概述**：保证多个进程/线程按照**特定的顺序**执行，避免**数据冲突**和**资源竞争**
{%list%}
访问和操作共享资源的代码段称为临界区，如果多个多个进程/线程可能同时处于同一个临界区，称为竞争
{%endlist%}
{%right%}
共享资源分为互斥共享资源和同步共享资源，前者同一时刻只允许一个进程访问，后者同一时刻允许多个进程访问
{%endright%}
{%warning%}
某一时刻只能有一个进程/线程能够访问互斥共享资源，从而避免出现不一致的结果
{%endwarning%}
**②原子操作**
>**概述**：一种**逻辑上不可中断**的操作，在执行过程中不会被**任何其他操作**打断
{%list%}
原子操作的实现通常依赖于硬件提供的指令，不同的硬件平台提供了不同的支持
{%endlist%}
{%right%}
原子操作是实现同步机制如锁机制的基石
{%endright%}
{%warning%}
如果原子操作被其他执行流打断，被打断的执行流会失败，并且重新执行一次
{%endwarning%}
**③`percpu`**
>**概述**：为每个`CPU`生成一份独有的**数据备份**，占用**独立的内存**，每个`CPU`只能修改**属于自己**的`percpu`数据
{%list%}
每个CPU都有自己的缓存，当CPU修改数据时，通常在缓存中进行修改并将其同步到内存中
{%endlist%}
{%warning%}
一个CPU对全局数据的修改会导致所有其他CPU对该全局数据的缓存失效，需要全部更新，从而带来性能上的损失
{%endwarning%}
{%right%}
percpu避免了多CPU对全局数据的竞争问题
{%endright%}
{%wrong%}
percpu只适用于在逻辑上是独立的CPU的数据
{%endwrong%}

#### 1.2锁机制
**①简介**
>**概述**：一种**临界区**保护机制，使得**同一时刻**只有特定**进程/线程**可以访问临界区
{%list%}
当一个进程试图进入加锁的临界区时，会尝试获取锁，只有成功获取锁才能进入临界区
{%endlist%}
{%warning%}
锁的作用是使进程/线程以串行方式对资源进行访问，会降低系统的性能，锁的颗粒度越粗，系统性能降低越明显
{%endwarning%}
{%right%}
一开始采用粗颗粒的锁保护数据，当该锁争用明显时，细化锁的颗粒度
{%endright%}
{%wrong%}
若多个进程/线程都在等待被对方占用的锁，则他们永远都不会释放已经占有的锁并一直等待，也称为死锁
{%endwrong%}
**②自旋锁**
>**概述**：当一个进程无法获取**自旋锁**时，会**一直循环**等待直到**自旋锁被释放**
{%list%}
获取自旋锁时会关闭抢占和本地中断，因为切换后的进程/线程可能会试图获取当前线程持有的锁造成死锁
{%endlist%}
{%right%}
Linux使用owner和next表示自旋锁，初始时owner和next均为0，next对各个请求自旋锁的进程进行排序
{%endright%}
>加锁时，`next`**先加一**，若**加一前**的`next`和`owner`相等，则**获取锁**，反之则**一直等待**，解锁时，`owner`**加一**
{%warning%}
Linux实现的自旋锁是不能递归的，不能试图获取被自己持有的自旋锁，且不应该被长时间持有
{%endwarning%}
{%wrong%}
不要嵌套地使用自旋锁，会直接导致死锁
{%endwrong%}
```c
/* spinlock 核心结构 */
typedef struct {
  union {
    u32 slock;
    struct __raw_tickets {
      u16 owner;
      u16 next;
    } tickets;
  };
} arch_spinlock_t;
```
**③互斥锁**
>**概述**：类似于**自旋锁**，当一个进程无法获取**互斥锁**时，会**进入休眠或者不断自旋**直到**互斥锁被释放**
{%list%}
互斥锁使用owner保存占用该锁进程的描述符和一些标志信息，当owner不为0时，表明该锁被占用
{%endlist%}
{%right%}
当进程获取互斥锁失败时，若持有锁的进程正在执行，则获取osq锁并自旋等待锁释放，反之进入wait_list睡眠等待
{%endright%}
{%warning%}
若进入自旋的进程在自旋过程中发现自旋条件不成立，会释放osq锁进入wait_list睡眠等待
{%endwarning%}
{%wrong%}
互斥锁不能在中断或者其它不允许睡眠的场景使用
{%endwrong%}
```c
struct mutex {
  atomic_long_t       owner;
  spinlock_t      wait_lock;
#ifdef CONFIG_MUTEX_SPIN_ON_OWNER
  struct optimistic_spin_queue osq; 
#endif
  struct list_head    wait_list;
};
```
**④读写锁**
>**概述**：分为**读加/解锁**和**写加/解锁**，使得共享资源可以被**同时读取**，但必须**互斥写入**，适用于**读多写少**的情景
{%list%}
如果要执行写操作，必须自旋等待所有读/写进程释放读写锁，如果要执行读操作，必须自旋等待写进程释放读写锁
{%endlist%}
{%right%}
Linux使用lock表示读写锁，读加/解锁时lock加减一，写加/解锁时lock最高位置1/0
{%endright%}
{%warning%}
类似自旋锁，获取读写锁时会关闭抢占和本地中断
{%endwarning%}
{%wrong%}
读写锁读进程的优先级太低，导致写进程饥饿
{%endwrong%}
```c
typedef struct {
  u32 lock;
} arch_rwlock_t;
```
**⑤顺序锁**
>**概述**：类似于**读写锁**，但是让**写进程**的优先级始终**高于读进程**，适用于**读多写少**的情景
{%list%}
顺序所使用seqcount记录锁的状态，读进程加锁时只读取该变量，写进程/解锁时该变量都会加一
{%endlist%}
{%right%}
当seqcount为奇数时，说明有写进程正在写入，为偶数时说明写入完毕，使用自旋锁保护seqcount
{%endright%}
{%warning%}
读进程只有在seqcount变为偶数时才能执行读操作，并且在读操作前后比较seqcount的值，若不一致返回特定值
{%endwarning%}
```c
typedef struct {
  struct seqcount seqcount;
  spinlock_t lock;
} seqlock_t;
```
#### 1.3信号量
**①简介**
>**概述**：类似于**计数器**，用于**进程同步**和**进程通信**
{%list%}
信号量有初始值n，当进程/线程申请信号量时，该值减一，当进程/线程释放信号量时，该值加一
{%endlist%}
{%warning%}
当进程/线程申请信号量失败时，会被阻塞，直到有进程/线程释放信号量才会被唤醒
{%endwarning%}
{%right%}
初值为0的信号量常用于进程同步，如常见的生产者消费者模型，初值为1的信号量常用于互斥操作，类似于互斥锁
{%endright%}
>**生产者消费者模型**：当**生产者进程**`A`产生资源，**释放信号量**从而通知**消费者进程**`B`消费资源
{%wrong%}
信号量不能在中断或者其它不允许睡眠的场景使用
{%endwrong%}
```c
struct semaphore {
  raw_spinlock_t    lock;        // 自旋锁，用于count值的互斥访问
  unsigned int    count;         // 计数值
  struct list_head  wait_list;   // 等待链表
};
```
**②读写信号量**
>**概述**：类似于**读写锁**和**互斥锁**的结合体，使共享资源可以被**同时读取**，但必须**互斥写入**，适用于**读多写少**的情景
{%list%}
读写信号量使用owner保存占用该信号量进程的描述符和一些标志信息，bit0表示该信号量是否被读进程持有
{%endlist%}
{%right%}
读写信号量使用count表示是否有写进程持有该信号以及读者的数量等信息
{%endright%}
{%warning%}
进行读操作前，需要判断是否有写进程正在使用或者等待读写信号量，如果有则进入自旋或者睡眠
{%endwarning%}
```c
struct rw_semaphore {
  atomic_long_t count;
  atomic_long_t owner;
#ifdef CONFIG_RWSEM_SPIN_ON_OWNER
  struct optimistic_spin_queue osq; 
#endif
  raw_spinlock_t wait_lock;
  struct list_head wait_list;
};
```
### 2.进程通信
#### 2.1引言
**①简介**
>**概述**：为了进程间的协作，`Linux`提供了**管道**、**消息队列**、**共享内存**、**信号**、**信号量**和**套接字**等进行进程通信
{%list%}
进程的用户空间是独立的，而内核空间是共享的，所以进程通信必须通过内核
{%endlist%}
{%right%}
通常是在内核中开辟一片区域，进程通过copy_from_user和copy_to_user将该内核区域作为中转站传递信息
{%endright%}
{%warning%}
除了信号，其他进程通信机制都有可能因为发送/接收信息阻塞进程
{%endwarning%}

**②信号**
>**概述**：`Linux`提供几十种信号响应各种**异常情况**，如`SIGINT`表示需要**终止进程**
{%list%}
信号是软件层次上对中断机制的一种模拟，当出现硬件故障、特定函数调用以及非法操作等，均会产生信号
{%endlist%}
{%right%}
当进程接收到信号后，可以执行默认操作，也可以执行自己定义的信号处理函数，甚至忽略信号
{%endright%}
{%warning%}
对于SIGKILL和SEGSTOP信号，进程只能执行默认操作
{%endwarning%}
**③共享内存**
>**概述**：本质就是将不同进程的**某块虚拟地址空间**映射到**相同的物理内存**
{%list%}
当一个进程修改共享内存的数据，会立刻被其他能够访问到该共享内存的进程得知从而进行通信
{%endlist%}
{%right%}
不同于其他进程通信方式，共享内存不需要通过内核区域作为中转站传递信息，传输速度非常快
{%endright%}
{%warning%}
共享内存并未提供同步机制，需要用户使用信号量等同步机制控制进程对共享内存的访问
{%endwarning%}

#### 2.2管道通信
**①简介**
>**概述**：本质上是内核中的**环形缓冲区**，用于在进程间**传递信息**，对于**使用管道的进程**而言就是**一个文件**
{%list%}
管道通信是半双工的，且提供面向字节流的服务，即传递的数据无规则，没有明显边界
{%endlist%}
{%right%}
创建管道后，通过write和open系统调用即可向管道读写数据从而进行通信
{%endright%}
{%warning%}
管道内部提供互斥和同步机制，用于保护管道
{%endwarning%}
>**互斥**：当一个进程正在对`pipe`进行**读/写操作**时，另一个进程必须**睡眠等待**

>**同步**：当**读/写进程**从`pipe`中**读取/写入**一定的数据后，便去**睡眠等待**，直到**写/读进程**从`pipe`中**写入/读取**
```c
// 创建匿名管道
int pipe(int pipefd[2]);
// 创建有名管道
int mkfifo(const char *path,mode_t mode);
```
**②匿名管道**
>**概述**：使用`pipe`创建，在具有**亲缘关系**的进程之间传递信息，示例代码如下所示
{%list%}
pipefd[0]为读端，pipefd[1]写端，进程只能使用管道的一段，另一端需要关闭
{%endlist%}
{%right%}
父进程创建子进程时，子进程会继承其文件描述符列表，从而继承其管道
{%endright%}
{%warning%}
使用管道读取/写入数据时，需要保证有进程开启该管道的写端/读端
{%endwarning%}
>如果**所有进程的管道写端**都被关闭，使用`read`从其读端读取数据会返回`0`

>如果**所有进程的管道读端**都被关闭，使用`write`从其读端读取数据会导致**写入进程**收到信号`SIGPIPE`进而被**终止**
```c
#define BUF_SIZE 128

int main() {
  // 存储管道对应的文件描述符
  int pipefd[2];
  pid_t pid;
  char message[] = "Hello from parent process!";
  char buffer[BUF_SIZE];

  // 创建管道
  if (pipe(pipefd) == -1) {
    perror("pipe");
    return 1;
  }
  // 创建子进程
  pid = fork();
  if (pid == -1) {
    perror("fork");
    return 1;
  }
  if (pid > 0) { // 父进程
    //关闭管道的读端，并将数据写入管道
    close(pipefd[0]);
    write(pipefd[1], message, strlen(message) + 1);
    // 关闭管道的写端
    close(pipefd[1]);
    wait(NULL);
  } else { //子进程
    // 关闭管道的写端，并从管道读取数据
    close(pipefd[1]);
    read(pipefd[0], buffer, BUF_SIZE);
    printf("Child: Received message: %s\n", buffer);
    // 关闭管道的读端
    close(pipefd[0]);
  }
  return 0;
}
```
**③命名管道**
>**概述**：使用`mkfifo`创建，可以在**任意进程**之间传递信息，示例代码如下所示
{%list%}
创建命名管道时需要指定管道的访问权限
{%endlist%}
{%right%}
相较于匿名管道，命名管道提供一个路径名与之关联，只要可以访问该路径，就可通过命名管道进行通信
{%endright%}
{%warning%}
如果以只读/写打开命名管道，open将阻塞进程直至其他进程以只写/读的打开该命名管道
{%endwarning%}
```c
/* 写进程 */
int main() {
  const char *pipe_name = "/tmp/my_pipe";
  
  // 创建有名管道
  if (mkfifo(pipe_name, 0666) == -1) {
    perror("mkfifo");
    return 1;
  }
  // 打开管道用于写入
  int fd = open(pipe_name, O_WRONLY);  
  if (fd == -1) {
    perror("open");
    return 1;
  }
  // 向管道写数据
  const char *msg = "Hello from parent!";
  write(fd, msg, strlen(msg));  
  close(fd); 

  return 0;
}
```
```c
int main() {
  const char *pipe_name = "/tmp/my_pipe";

  // 打开管道用于读取
  int fd = open(pipe_name, O_RDONLY);  
  if (fd == -1) {
    perror("open");
    return 1;
  }
  // 从管道读取数据
  char buf[1024];
  read(fd, buf, sizeof(buf));  
  printf("Child received: %s\n", buf);
  close(fd);  

  return 0;
}
```
#### 2.3消息队列
**①简介**
>**概述**：本质上是内核中的**消息链表**，其中组织了一个个**独立的消息体**，相关接口如下所示
{%list%}
消息体是用户自定义的数据类型，发送方和接收方要约定好消息体的数据类型和消息队列的键值key
{%endlist%}
{%right%}
发送进程不需要等待接收进程接收消息
{%endright%}
{%warning%}
接收进程根据消息类型按照FIFO顺序接收信息，如果消息队列为空，则会导致接收进程阻塞
{%endwarning%}
```c
// 创建或打开消息队列
int msgget(key_t key, int msgflg);   
// 向消息队列发送消息
int msgsnd(int msqid, const void *msgp, size_t msgsz, int msgflg);   
// 从消息队列接收消息
ssize_t msgrcv(int msqid, void *msgp, size_t msgsz, long msgtyp, int msgflg);   
// 控制消息队列
int msgctl(int msqid, int cmd, struct msqid_ds *buf);   
```
**②使用示例**
>**概述**：发送进程和接收进程均通过`msgget`**创建/打开**消息队列，并通过`msgsnd`和`msgrcv`传递消息
{%list%}
消息结构体的第一个程序必须为消息类型，对应msgrcv中的msgtyp
{%endlist%}
{%right%}
一个消息队列可以存储不同类型的消息
{%endright%}
{%warning%}
消息队列长度和消息大小不能超过系统规定的最大值
{%endwarning%}
```c
/* 发送进程 */
#define MSG_KEY 1234  // 消息队列键值
struct msgbuf {
  long mtype;       // 消息类型
  char mtext[100];  // 消息内容
};
int main() {
  int msgid;
  struct msgbuf message;
  // 创建消息队列
  msgid = msgget(MSG_KEY, IPC_CREAT | 0666);
  if (msgid == -1) {
    perror("msgget failed");
    return 1;
  }
  // 准备消息
  message.mtype = 1;  
  strcpy(message.mtext, "Hello, World!");
  // 发送消息
  if (msgsnd(msgid, &message, sizeof(message.mtext), 0) == -1) {
    perror("msgsnd failed");
    return 1;
  }
  printf("Message sent: %s\n", message.mtext);
  return 0;
}
```
```c
/* 接收进程 */
#define MSG_KEY 1234  // 消息队列键值
struct msgbuf {
  long mtype;       // 消息类型
  char mtext[100];  // 消息内容
};
int main() {
  int msgid;
  struct msgbuf message;
  // 获取消息队列
  msgid = msgget(MSG_KEY, 0666);
  if (msgid == -1) {
    perror("msgget failed");
    return 1;
  }
  // 接收消息
  if (msgrcv(msgid, &message, sizeof(message.mtext), 1, 0) == -1) {
    perror("msgrcv failed");
    return 1;
  }
  printf("Received message: %s\n", message.mtext);
  // 删除消息队列
  if (msgctl(msgid, IPC_RMID, NULL) == -1) {
    perror("msgctl failed");
    return 1;
  }
  return 0;
}
```


