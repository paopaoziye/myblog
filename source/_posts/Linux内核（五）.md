---
title: Linux内核（五）
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
summary: 进程管理
---
# Linux内核（一）
## 进程子系统
### 1.进程管理
#### 1.1引言
**①进程和线程**
>**概述**：进程即处于**执行期的程序**，线程为进程中的**执行单元**，**进程描述符**`task_struct`如下所示
{%list%}
进程不仅仅局限于一段可执行代码，还包括一系列进程资源如打开的文件和虚拟内存空间等
{%endlist%}
{%right%}
Linux将线程看作为一种和其他进程共享某些资源的进程
{%endright%}
{%warning%}
内核调度的对象是线程而不是进程
{%endwarning%}
```c
struct task_struct {  
  /* 其余成员略 */
  pid_t pid;                   /* 进程ID */
  pid_t tgid;                  /* 所属进程 */

  volatile long state;         /* 进程状态 */  
  unsigned int flags;          /* 进程标志 */  

  void *stack;                 /* 进程堆栈 */   
  struct list_head tasks;      /* 包含的线程 */  
  struct mm_struct *mm;        /* 虚拟内存空间  */  
  struct files_struct *files;  /* 打开的文件描述信息 */ 
};  
```
**②`thread_info`**
>**概述**：记录**部分进程信息**，其`task`成员指向对应**进程描述符**`task_struct`
{%list%}
thread_info存放在进程内核栈的栈底，便于进程查找，进而获取进程描述符
{%endlist%}
>如下所示，`current`先通过`current_thread_info`在**进程内核栈**找到`thread_info`，进而找到**当前进程描述符**
{%right%}
某些体系结构提供一个专门寄存器存放指向当前进程描述符的指针
{%endright%}
{%warning%}
因为task_struct较大，不能存放在内核栈中
{%endwarning%}
```c
#define current get_current()
#define get_current() (current_thread_info()->task)
```
**③内核线程**
>**概述**：独立运行在**内核空间**的标准进程，用于执行内核的某些**后台操作**，如`flush`
{%list%}
内核线程没有自己独立的虚拟内存空间，其mm指针为NULL
{%endlist%}
{%right%}
当内核线程访问虚拟内存空间时，会使用调度前用户进程/线程的mm和页表
{%endright%}
{%warning%}
内核线程只在内核空间运行，且只能由内核线程创建
{%endwarning%}
#### 1.2进程创建
**①引言**
>**概述**：进程可通过**库函数**`fork`、`vfork`和`clone`创建**进程**、**轻量级进程**和**线程**
{%list%}
fork创建出的子进程采用写时复制对父进程进行拷贝，vfork类似于fork，但是和父进程共享虚拟内存空间和页表
{%endlist%}
{%right%}
clone通过传递clone_flags更加精细的设置父子进程共享的资源种类和创建进程的行为
{%endright%}
{%warning%}
使用vfork创建子进程时，会阻塞父进程，直到子进程退出或者调用exec
{%endwarning%}
```c
/* fork */
SYSCALL_DEFINE0(fork)
{
  struct kernel_clone_args args = {
    .exit_signal = SIGCHLD,
  };
  return _do_fork(&args);
}
```
```c
/* vfork */
SYSCALL_DEFINE0(vfork)
{
  struct kernel_clone_args args = {
    .flags    = CLONE_VFORK | CLONE_VM,
    .exit_signal  = SIGCHLD,
  };
  return _do_fork(&args);
}
```
```c
/* clone */
SYSCALL_DEFINE5(clone, unsigned long, clone_flags, unsigned long, newsp,
     int __user *, parent_tidptr,
     int __user *, child_tidptr,
     unsigned long, tls)
{
  struct kernel_clone_args args = {
    .flags    = (clone_flags & ~CSIGNAL),
    .pidfd    = parent_tidptr,
    .child_tid  = child_tidptr,
    .parent_tid  = parent_tidptr,
    .exit_signal  = (clone_flags & CSIGNAL),
    .stack    = newsp,
    .tls    = tls,
  };
  if (!legacy_clone_args_valid(&args))
    return -EINVAL;
  return _do_fork(&args);
}
```
**②`_do_fork`**
>**概述**：`fork`、`vfork`和`clone`最终都会调用`_do_fork`，`_do_fork`**核心工作**封装在`copy_process`中
{%list%}
copy_process为子进程申请task_struct，并调用各类copy函数继承父进程的各种资源填充task_struct并分配pid
{%endlist%}
{%right%}
如果clone_flags设置了共享资源标志，会直接将父进程对应资源对象直接赋予子进程
{%endright%}
{%warning%}
子进程申请task_struct后，将其状态设置为不可中断，防止其投入运行，直到资源继承完毕再唤醒子进程
{%endwarning%}
```c
long _do_fork(struct kernel_clone_args *args)
{
  u64 clone_flags = args->flags;
  struct completion vfork;
  struct pid *pid;
  struct task_struct *p;
  int trace = 0;
  long nr;
  /* 其余工作略 */

  // 创建新进程的核心工作
  p = copy_process(NULL, trace, NUMA_NO_NODE, args);
  // 获取新进程ID 
  pid = get_task_pid(p, PIDTYPE_PID);
  nr = pid_vnr(pid);
  // 启动新创建的进程
  wake_up_new_task(p);
  // 如果设置了CLONE_VFORK，阻塞父进程，并保证其在子进程完成后再运行
  if (clone_flags & CLONE_VFORK) {
    if (!wait_for_vfork_done(p, &vfork))
      ptrace_event_pid(PTRACE_EVENT_VFORK_DONE, pid);
  }
  put_pid(pid);
  return nr;
}
```
```c
static __latent_entropy struct task_struct *copy_process(
     unsigned long clone_flags,
     unsigned long stack_start,
     unsigned long stack_size,
     int __user *child_tidptr,
     struct pid *pid,
     int trace,
     unsigned long tls,
     int node)
{
  /* 其余工作略 */
  struct task_struct *p;
  // 创建 task_struct 结构、thread_info 结构和内核栈
  p = dup_task_struct(current, node);
  /* 参数检验，并将子进程状态设置为不可中断，防止其投入运行*/
  // 继承父进程打开的文件描述符
  retval = copy_files(clone_flags, p);
  // 继承父进程所属的文件系统
  retval = copy_fs(clone_flags, p);
  // 继承父进程注册的信号以及信号处理函数
  retval = copy_sighand(clone_flags, p);
  retval = copy_signal(clone_flags, p);
  // 继承父进程的虚拟内存空间
  retval = copy_mm(clone_flags, p);
  // 继承父进程的 namespaces
  retval = copy_namespaces(clone_flags, p);
  // 继承父进程的 IO 信息
  retval = copy_io(clone_flags, p);
  // 分配 CPU
  retval = sched_fork(clone_flags, p);
  // 分配 pid
  pid = alloc_pid(p->nsproxy->pid_ns_for_children);
}
```
```c
static int copy_mm(unsigned long clone_flags, struct task_struct *tsk)
{
  struct mm_struct *mm, *oldmm;
  int retval;
  /* 其余参数设置略 */
  tsk->mm = NULL;
  tsk->active_mm = NULL;

  oldmm = current->mm;
  if (!oldmm)
      return 0;

  /* 如果CLONE_VM置位，则共享当前进程mm_struct */
  if (clone_flags & CLONE_VM) {
      atomic_inc(&oldmm->mm_users);
      mm = oldmm;
      goto good_mm;
  }

  retval = -ENOMEM;
  /* 为子进程申请mm，并将父进程的mm拷贝给子进程的mm */
  mm = dup_mm(tsk);
  if (!mm)
      goto fail_nomem;

good_mm:
  tsk->mm = mm;
  tsk->active_mm = mm;
  return 0;

fail_nomem:
  return retval;
}
```
#### 1.3进程终结
**①引言**
>**概述**：进程**主动调用**`exit()`，或者接收到**不能处理也不能忽略**的**信号和异常**时，进程会终结
{%list%}
进程终结核心工作被封装在do_exit()中，释放进程占用的相关资源并进行一些善后工作，最后进行进程调度
{%endlist%}
{%right%}
C语言编译器会在main函数返回点后调用exit()
{%endright%}
{%warning%}
进程调用do_exit后，还持有内核栈、task_struct结构和thread_info结构等资源，向父进程提供相关信息
{%endwarning%}
```c
void __noreturn do_exit(long code)
{
  // 获取当前进程的进程描述符
  struct task_struct *tsk = current;
  int group_dead;

  /* 其余工作略 */
  // 若当前进程处于中断上下文中或者为空闲任务，停止执行
  if (unlikely(in_interrupt()))
    panic("Aiee, killing interrupt handler!");
  if (unlikely(!tsk->pid))
    panic("Attempted to kill the idle task!");

  // 收集进程退出的统计信息
  acct_collect(code, group_dead);

  // 释放相关资源
  exit_mm();
  exit_sem(tsk);
  exit_shm(tsk);
  exit_files(tsk);
  exit_fs(tsk);
  if (group_dead)
    disassociate_ctty(1);
  exit_task_namespaces(tsk);
  exit_task_work(tsk);
  exit_thread(tsk);
  exit_umh(tsk);
  ...
  // 通知父进程该进程已经退出，如果父进程已经退出
  exit_notify(tsk, group_dead);

  // 设置进程标志，表明进程已经完成退出
  tsk->flags |= PF_EXITPIDONE;

  // 调用schedule()触发调度
  do_task_dead();
}
EXPORT_SYMBOL_GPL(do_exit);
```
**②`wait()`**
>**概述**：父进程接收到**子进程终结**的信息时，调用`wait()`，该函数通过`wait4`**系统调用**实现
{%list%}
wait4系统调用核心工作被封装在wait_task_zombie()中，代码如下所示
{%endlist%}
{%right%}
如果父进程不需要子进程相关信息，调用release_task()释放子进程的task_struct结构等剩余资源
{%endright%}
{%warning%}
如果父进程在子进程终结前终结，会导致子进程永远处于僵死状态，白白浪费内存
{%endwarning%}
>若父进程已经终结，进程终结时会在`do_exit()`中的`exit_notify()`为**其及其子进程**寻找**养父进程**

>**养父进程**通常为进程**所在线程组的其他进程**，若没有则为`init`进程
```c
static int wait_task_zombie(struct wait_opts *wo, struct task_struct *p)
{
  int state, status;
  pid_t pid = task_pid_vnr(p);
  uid_t uid = from_kuid_munged(current_user_ns(), task_uid(p));
  struct waitid_info *infop;

  if (!likely(wo->wo_flags & WEXITED))
    return 0;
  // 如果设置了WNOWAIT，表示父进程还需要子进程相关信息，所以只获取进程退出代码并返回
  if (unlikely(wo->wo_flags & WNOWAIT)) {
    status = p->exit_code;
    get_task_struct(p);
    read_unlock(&tasklist_lock);
    sched_annotate_sleep();
    if (wo->wo_rusage)
      getrusage(p, RUSAGE_BOTH, wo->wo_rusage);
    put_task_struct(p);
    goto out_info;
  }
  /* 将子进程状态，根据一定规则修改为EXIT_TRACE或EXIT_DEAD */

  // 若进程状态被修改为EXIT_TRACE，即正在被调试
  // 解除进程与调试器的关联并通知父进程，最终将状态更改为EXIT_ZOMBIE或EXIT_DEAD
  if (state == EXIT_TRACE) {
    write_lock_irq(&tasklist_lock);
    ptrace_unlink(p);
    state = EXIT_ZOMBIE;
    if (do_notify_parent(p, p->exit_signal))
      state = EXIT_DEAD;
    p->exit_state = state;
    write_unlock_irq(&tasklist_lock);
  }
  // 若进程状态被修改为EXIT_DEAD，调用release_task释放进程的进程描述符等
  if (state == EXIT_DEAD)
    release_task(p);
out_info:
  /* 填充退出信息，告诉父进程子进程的退出原因和状态，略 */

  return pid;
}
```
### 2.进程调度
#### 2.1引言
**①进程状态**
>**概述**：进程状态可分为**可运行**、**停止**、**休眠**和**终止**
{%list%}
进程刚被创建时为可运行状态，表示其可以被调度或正在运行
{%endlist%}
{%right%}
当进程接收到SIGSTOP信号会进入停止状态，如进程被调试时在断点处即为停止状态
{%endright%}
{%warning%}
当进程试图获取某种系统资源而无法获得时，会进入休眠状态让出CPU资源，当系统资源满足要求时被唤醒
{%endwarning%}
>休眠分为**可中断休眠**和**不可中断休眠**，前者可以**接收信号**提前退出休眠状态，后者必须等到系统资源**满足要求**
{%wrong%}
当进程终结后，处于终止状态，只留下其进程描述符以提供当前进程的退出情况、退出码以及一些统计信息
{%endwrong%}
**②进程优先级**
>**概述**：`Linux`采用`nice`值和**实时优先级**根据**进程的价值**和对**处理器时间的需求**对进程进行分级
{%list%}
nice值描述非实时进程的优先级，实时优先级描述实时进程的优先级
{%endlist%}
>`nice`值范围为`-20~19`，其值越大对应的**进程优先级越低**
{%right%}
高优先级的进程先运行，相同优先级的进程轮转运行，如果支持抢占，高优先级进程可以打断低优先级进程
{%endright%}
{%warning%}
任何实时进程的优先级都高于非实时进程，即nice值和实时优先级是两个互不相交的范畴
{%endwarning%}
>对于**实时进程**，优先级`prio`占用`0~99`，对于**非实时进程**，优先级`prio`占用`100~139`

**③进程抢占**
>**概述**：每个进程的`thread_info`结构中都有`need_resched`标志，当该标志**被设置时**，说明进程**需要被抢占**
{%list%}
当出现了优先级更高的进程时，内核会设置当前进程的need_resched标志
{%endlist%}
>内核在**每个时间片结束时**会调用`scheduler_tick()`，若当前进程的优先级**低于其他进程**，会设置该标志

>当内核调用`try_to_wake_up()`唤醒一个进程时，若**被唤醒的进程**的优先级高于当前进程，会设置该标志
{%right%}
进程从内核空间返回用户空间以及从中断返回内核空间时会检查该标志，前者为用户抢占，后者为内核抢占
{%endright%}
{%warning%}
内核抢占还需要确保进程没有持有锁，所以除了检查need_resched标志外，还会检查preempt_count标志
{%endwarning%}
>每个进程的`thread_info`结构中有`preempt_count`成员，每当进程**获取锁**该数值加一，**释放锁**则减一
#### 2.2调度器架构
**①调度策略**
>**概述**：决定进程调度的**时机和方式**，不同的进程使用**不同的调度策略**，用`task_struct->policy`描述
{%list%}
针对实时性进程，有SCHED_FIFO和SCHED_RR等，针对非实时性进程有SCHED_NORMAL和SCHED_BATCH等
{%endlist%}
>`SCHED_FIFO`：**相同优先级**的任务先到先运行，其会一直运行直到其被**阻塞**、**显式释放**`CPU`或被**抢占**

>`SCHED_RR`：类似于`SCHED_FIFO`，但是引入了**时间片轮转**
{%right%}
SCHED_NORMAL为系统的默认调度策略，进程根据其动态时间片循环调度，动态时间片由nice属性值决定
{%endright%}
{%warning%}
虽然Linux支持实时调度策略，但是其相关机制如磁盘读写缓存等，导致IO时间不确定，不能达到硬实时
{%endwarning%}

**②调度器类**
>**概述**：对调度策略的**模块化封装**，每个进程属于一个**特定的调度器类**，用`task_struct->sched_class`描述
{%list%}
每个调度器类对应一个或多个调度策略，如fair_sched_class对应SCHED_NORMAL和SCHED_BATCH
{%endlist%}
{%right%}
每个调度器类都有其优先级，基础调度器会挑选出优先级最高且拥有可执行进程的调度器类进行调度
{%endright%}
>优先级为`stop_sched_class > dl_sched_class > rt_sched_class > fair_sched_class > idle_sched_class`
```c
/* 调度器类 */
extern const struct sched_class stop_sched_class;
extern const struct sched_class dl_sched_class;
extern const struct sched_class rt_sched_class;
extern const struct sched_class fair_sched_class;
extern const struct sched_class idle_sched_class;
```
**③调度实体**
>**概述**：调度器的**管理对象**，本质为一个**进程/进程组**，每个进程对应一个**调度实体**，用`task_struct->se`等描述
{%list%}
每个调度器类的调度实体不同，fair_sched_class的调度实体为sched_entity，代码如下所示
{%endlist%}
{%right%}
每个调度实体被组织在对应调度器类的就绪队列中
{%endright%}
```c
struct sched_entity {
  // load 表示当前调度实体的权重，这个权重决定了一个调度实体的运行优先级
  struct load_weight      load;
  // 红黑树的数据节点，使用该 rb_node 将当前节点挂到对应就绪队列上
  struct rb_node          run_node;
  // 链表节点，被链接到 percpu 的 rq->cfs_tasks 上
  struct list_head        group_node;
  // 标志位，代表当前调度实体是否在就绪队列上
  unsigned int            on_rq;
  // 当前实体上次被调度执行的时间
  u64             exec_start;
  // 当前实体总执行时间
  u64             sum_exec_runtime;
  // 截止到上次统计，进程执行的时间
  u64             prev_sum_exec_runtime;
  // 当前实体的虚拟时间
  u64             vruntime;
  // 实体执行迁移的次数
  u64             nr_migrations;
  // 进程的属性统计
  struct sched_statistics     statistics;

#ifdef CONFIG_FAIR_GROUP_SCHED

  // 由于调度实体可能是调度组，调度组中存在嵌套的调度实体，这个标志表示当前实体处于调度组中的深度
  int             depth;
  // 指向父级调度实体
  struct sched_entity     *parent;
  // 当前调度实体属于的 cfs_rq.
  struct cfs_rq           *cfs_rq;

  // 如果当前调度实体是一个调度组，那么它将拥有自己的 cfs_rq
  // 属于该组内的所有调度实体在该 cfs_rq 上排列
  struct cfs_rq           *my_q;
#endif

#ifdef CONFIG_SMP
  // 在多核系统中，需要记录 CPU 的负载，其统计方式精确到每一个调度实体
  struct sched_avg        avg ____cacheline_aligned_in_smp;
#endif
};
```
#### 2.3CFS调度器
**①简介**
>**概述**：允许每个进程**运行一段时间**，循环轮转，并从**就绪队列**中选择**虚拟时间最小**的进程作为**下一个调度进程**
{%list%}
每个进程加入CFS就绪队列时，虚拟时间均为min_vruntime，进程在CPU上执行时，其虚拟时间会增加
{%endlist%}
{%right%}
CFS调度器中，运行相同时间，优先级越高的进程虚拟时间增加得越慢，所以优先级越高的进程会运行更长时间
{%endright%}
```c
/* CFS就绪队列 */
struct cfs_rq {

  // 表示当前 cfs_rq 上所有实体的 load 总和。
  struct load_weight load;
  // 对当前 cfs_rq 上实体的统计，后者会递归会递归地包含子调度组中的所有实体 
  unsigned int nr_running, h_nr_running;
  // 当前 cfs_rq 上执行的时间 
  u64 exec_clock;
  //每个 cfs_rq 都会维护一个最小虚拟时间 min_vruntime
  u64 min_vruntime;
  // cfs_rq 维护的红黑树结构，包含其根节点以及最左边实体
  struct rb_root_cached tasks_timeline;
  // curr：cfs_rq 上当前正在运行的实体
  struct sched_entity *curr;
  /* 其余成员略 */
};
```
**②时间记账**
>**概述**：内核在`tick`**中断处理程序**中周期性更新**进程时间信息**，并判断**是否需要调度**
{%list%}
scheduler_tick会根据当前进程的调度器类，调用对应的task_tick回调函数，最后调用update_curr进行更新
{%endlist%}
{%right%}
update_curr根据当前进程运行的实际时间及其优先级更新虚拟时间，还会更新当前就绪队列的min_vruntime
{%endright%}
{%warning%}
min_vruntime为当前就绪队列的基准，需要将min_vruntime及时更新为当前就绪队列的最小vruntime
{%endwarning%}
```c
void scheduler_tick(void)
{
  /* 其余工作略 */
  // 根据当前进程的调度器类，调用对应的 task_tick 回调函数
  curr->sched_class->task_tick(rq,curr，0);
}
```
```c
static void task_tick_fair(struct rq *rq, struct task_struct *curr, int queued)
{
  struct cfs_rq *cfs_rq;
  struct sched_entity *se = &curr->se;
  // 遍历每个调度器实体
  for_each_sched_entity(se) {
    cfs_rq = cfs_rq_of(se);
    entity_tick(cfs_rq, se, queued);
  }
}
```
```c
static void
entity_tick(struct cfs_rq *cfs_rq， struct sched_entity *curr， int queued)
{
  // 更新当前进程的vruntime以及当前就绪队列的min_vruntime
  update_curr(cfs_rq);
  /* 其余工作略 */
  // 判断是否需要重新调度
  if (cfs_rq->nr_running > 1)
    check_preempt_tick(cfs_rq， curr);
}
```
**③`check_preempt_tick`**
>**概述**：根据当前进程**本次执行时间**，**期望执行时间**以及**虚拟时间**的关系判断是否需要调度
{%list%}
进程期望执行时间由调度延迟、当前就绪队列调度实体数和进程优先级决定，调度延迟通常被内核设置为6/12ms
{%endlist%}
>**调度延迟**为就绪队列上**所有进程运行一次**所需要的时间
{%right%}
当进程本次执行时间大于期望执行时间或其虚拟时间和就绪队列最小虚拟时间之差大于期望执行时间会触发调度
{%endright%}
{%warning%}
若进程本次执行时间小于最小执行时间时，就算虚拟时间达到调度要求，也不会触发调度
{%endwarning%}
>**最小执行时间**为调度延迟除以**当前就绪队列调度实体数**
```c
static void
check_preempt_tick(struct cfs_rq *cfs_rq， struct sched_entity *curr)
{
  unsigned long ideal_runtime， delta_exec;
  struct sched_entity *se;
  s64 delta;
  // 计算出在一个周期内，该 se 应该运行的时间，详见下文
  ideal_runtime = sched_slice(cfs_rq， curr);

  // 计算本次进程投入运行以来执行的时间 
  delta_exec = curr->sum_exec_runtime - curr->prev_sum_exec_runtime;

  // 如果运行时间大于 task 应该运行的时间，则设置抢占标志，表示当前进程需要被抢占.  
  if (delta_exec > ideal_runtime) {
    resched_curr(rq_of(cfs_rq));
    clear_buddies(cfs_rq， curr);
    return;
  }

  // 如果运行时间小于预设的进程运行时间最小值，不执行调度
  if (delta_exec < sysctl_sched_min_granularity)
    return;

  // 在 cfs_rq 中选择 vruntime 值最小的进程，也就是 leftmost 进程.
  se = __pick_first_entity(cfs_rq);

  // 计算两个进程 vruntime 之间的差值 delta.  
  delta = curr->vruntime - se->vruntime;

  if (delta < 0)
    return;
  // 当差值大于进程应该运行的时间，那么当前进程就应该被调度.  
  if (delta > ideal_runtime)
    resched_curr(rq_of(cfs_rq));
}
```
#### 2.4进程切换
**①引言**
>**概述**：当进程`need_resched`标志被设置**内核调用**`schedule()`或进程**主动调用**`schedule()`，会发生**进程切换**
{%list%}
schedule()主要工作被封装在__schedule中，其参数为false表示非抢占
{%endlist%}
{%right%}
__schedule清除当前进程的need_resched标志，找到并切换到下一个进程
{%endright%}
{%warning%}
调用__schedule前需要关闭抢占，在__schedule完成后再允许抢占，防止进程切换过程中产生抢占
{%endwarning%}
```c
void __sched schedule(void)
{
  struct task_struct *tsk = current;
  /* 其他工作略 */
  do {
    preempt_disable();
    __schedule(false);
    sched_preempt_enable_no_resched();
  } while (need_resched());
}

```
```c
static void __sched notrace __schedule(bool preempt)
{
  // prev表示当前进程，next表示下一个将要执行的进程
  struct task_struct *prev, *next;

  /* 获取相关信息，调度前的检查，进制本地中断等，略 */

  // 处理当前进程相关信息略


  // 找到下一个进程并清除当前进程的 need_resched 标志
  next = pick_next_task(rq, prev, &rf);
  clear_tsk_need_resched(prev);
  clear_preempt_need_resched();
  // 进行上下文切换
  if (likely(prev != next)) {
    /* 其余操作略 */
    rq = context_switch(rq, prev, next, &rf);
  } else {
    rq->clock_update_flags &= ~(RQCF_ACT_SKIP|RQCF_REQ_SKIP);
    rq_unlock_irq(rq, &rf);
  }
  // 进行负载均衡
  balance_callback(rq);
}
```
**②`pick_next_task`**
>**概述**：根据优先级**遍历所有调度器类**，调用对应的`pick_next_task`函数选择下一个任务
{%list%}
如果内核找不到合适的进程，最终会将进程切换到空闲进程
{%endlist%}
{%right%}
Linux大部分情况下只使用CFS调度器，内核会先假设下一个进程属于CFS调度器，从而加速寻找
{%endright%}
```c
static inline struct task_struct *
pick_next_task(struct rq *rq, struct task_struct *prev, struct rq_flags *rf)
{
  const struct sched_class *class;
  struct task_struct *p;
  // 如果当前进程属于空闲调度类或者公平调度类且没有其他调度器类的进程就绪
  // 说明下一个进程属于CFS调度器，调用对应回调函数找到下一个进程
  if (likely((prev->sched_class == &idle_sched_class ||
        prev->sched_class == &fair_sched_class) &&
       rq->nr_running == rq->cfs.h_nr_running)) {

    p = fair_sched_class.pick_next_task(rq, prev, rf);
    // 没有合适的进程，可以选择重试
    if (unlikely(p == RETRY_TASK))
      goto restart;
    // 没有进程，则在空闲调度类中选择任务
    if (unlikely(!p))
      p = idle_sched_class.pick_next_task(rq, prev, rf);
    return p;

  }

restart:
#ifdef CONFIG_SMP

  for_class_range(class, prev->sched_class, &idle_sched_class) {
    if (class->balance(rq, prev, rf))
      break;
  }
#endif
  // 将当前任务从调度器的就绪队列中移除
  put_prev_task(rq, prev);
  // 根据优先级遍历所有调度器类，调用各个调度器类的pick_next_task函数选择下一个任务
  for_each_class(class) {
    p = class->pick_next_task(rq, NULL, NULL);
    if (p)
      return p;
  }

  BUG();
}
```
**③`context_switch`**
>**概述**：切换进程的**虚拟内存空间**并调用`switch_to`切换**相关寄存器**完成进程的切换
{%list%}
若下一个进程为内核线程，则借用当前进程虚拟地址空间，若下一个进程为用户进程/线程，则切换虚拟地址空间
{%endlist%}
{%right%}
TLB中缓存了页表对应的虚拟地址到物理地址的映射，如果不涉及虚拟地址空间的切换，暂时不清除TLB
{%endright%}
{%warning%}
如果当前进程为内核线程，需要清除其借用的虚拟地址空间
{%endwarning%}
```c
static __always_inline struct rq *
context_switch(struct rq *rq, struct task_struct *prev,
         struct task_struct *next, struct rq_flags *rf)
{
  // 上下文切换预处理
  prepare_task_switch(rq, prev, next);
  arch_start_context_switch(prev);
  // 如果下一个进程为内核线程，需要借用当前进程的虚拟内存空间
  // 如果下一个进程为用户进程/线程，切换进程的虚拟内存空间
  if (!next->mm) {      
    // TLB懒清除                   
    enter_lazy_tlb(prev->active_mm, next);
    next->active_mm = prev->active_mm;
    // 如果当前进程为用户进程/线程，增加内存空间的计数
    // 如果当前进程也为内核线程，将其借用的虚拟内存空间直接给下一个进程即可
    if (prev->mm)                          
      mmgrab(prev->active_mm);
    else
      prev->active_mm = NULL;
  } else {                                        
    membarrier_switch_mm(rq, prev->active_mm, next->mm);
    switch_mm_irqs_off(prev->active_mm, next->mm, next);
    // 如果当前进程为内核线程，则将其借用的虚拟内存空间保存在 rq->prev_mm
    if (!prev->mm) {                        
      rq->prev_mm = prev->active_mm;
      prev->active_mm = NULL;
    }
  }
  rq->clock_update_flags &= ~(RQCF_ACT_SKIP|RQCF_REQ_SKIP);
  prepare_lock_switch(rq, next, rf);
  // 具体的进程切换操作，如保存和恢复寄存器
  switch_to(prev, next, prev);
  barrier();
  // 收尾工作
  return finish_task_switch(prev);
}
```


