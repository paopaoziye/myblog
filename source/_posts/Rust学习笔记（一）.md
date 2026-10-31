---
title: Rust学习笔记（一）
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
  - 《Rust 权威学习指南》
  - Rust
categories: 编程语言
keywords:
  - Rust
  - rustup
  - Cargo
  - rustfmt
  - Clippy
updated: ''
img: /medias/featureimages/30.webp
date: 2026-07-19 01:32:03
summary: Rust 工具链、项目创建与代码检查
---
# 编程语言
## Rust学习笔记
### Rust学习笔记（一）
#### Hello World
**①引言**
>**概述**：`Rust`是一门注重**运行效率**、**内存安全**与**并发安全**的**编译型**、**静态类型**的通用编程语言，适合系统级开发
{%list%}
Rust通过所有权、借用及生命周期等机制，在编译阶段约束数据的访问与共享，防止悬垂引用、重复释放及数据竞争等问题
{%endlist%}
{%right%}
Rust 的核心设计思想是将资源管理与访问约束融入语言规则和类型系统，使潜在的内存安全问题尽可能在编译阶段被发现
{%endright%}
{%warning%}
Rust的学习曲线较陡、编译耗时较长，且即使代码逻辑看似正确，也可能因不满足所有权、借用及生命周期等规则而无法通过编译
{%endwarning%}
{%wrong%}
Rust的编译期检查无法消除逻辑错误、死锁及所有并发问题，且某些场景可能需要使用unsafe，需要由开发者自行保证其安全性
{%endwrong%}

**②环境配置**
>**概述**：本小节以`Ubuntu 24.04`为例，通过`rustup`安装和管理`Rust`工具链，主要包括`rustc`、`cargo`和`rustup`，如下所示
{%list%}
rustup为工具链管理器，负责安装、更新和切换不同版本的Rust工具链，并支持添加交叉编译目标及开发组件
{%endlist%}
{%right%}
cargo是Rust的项目构建与包管理工具，负责项目创建、依赖管理、代码编译、程序运行、自动化测试及软件包发布等开发流程
{%endright%}
{%warning%}
rustc是Rust的编译器，负责将源代码编译为目标程序，日常开发通常通过cargo统一管理构建流程，由其自动调用rustc完成编译
{%endwarning%}
```shell
# 安装依赖
sudo apt update
sudo apt install -y \
    build-essential \
    curl \
    ca-certificates \
    git \
    pkg-config \
    libssl-dev

# 使用 rustup 安装 Rust，出现选项时选择 1 表明安装稳定版 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 让环境变量生效，默认情况下 Rust 的工具位于 ~/.cargo/bin/
source "$HOME/.cargo/env" 
```
**③Hello world**
>**概述**：运行如下命令通过`Cargo`**创建**、**检查**、**编译**并**运行**`Hello World`工程，该工程**主要目录结构**如下所示
{%list%}
Cargo.toml是Rust项目的配置文件，用于记录项目名称、语言版本及依赖关系等信息，为Cargo的项目构建与依赖管理提供依据
{%endlist%}
{%right%}
cargo check会完成语法检查、类型检查、借用检查和依赖分析但不会进行代码生成与链接，比cargo build快很多，适合频繁使用
{%endright%}
>除此之外，`Cargo`还提供还有`cargo fmt`、`cargo clippy`和`cargo test`等工具，分别用于**格式化**、**静态检查**和**代码验证**
{%warning%}
cargo build默认生成便于调试的开发版本，可以添加--release参数生成经过编译优化的发布版，后者性能更好但编译更耗时
{%endwarning%}
```shell
# 创建并进入项目
cargo new hello_rust
cd hello_rust

# 检查代码格式，不修改源文件
cargo fmt --check

# 自动格式化源代码
cargo fmt

# 快速检查代码及依赖，不生成可执行程序
cargo check

# 静态分析，检查潜在问题和不推荐的写法
# -- 表示将后续参数传递给 Clippy 使用的编译器
# -D warnings 表示将所有警告视为错误
cargo clippy -- -D warnings

# 编译并执行测试用例
cargo test

# 编译调试版本
cargo build

# 编译优化版本
cargo build --release

# 编译并运行程序
cargo run
```
```shell
hello_rust/
├── Cargo.toml
└── src/
    └── main.rs
```
```rust
fn main() {
    println!("Hello, world!");
}
```
**④编译流程**
>**概述**：`Cargo`会在特定时刻调用`rustc`完成**源代码分析**、**类型与借用检查**、**代码生成**及**链接**等过程，最终生成可执行程序
{%list%}
运行cargo build时，Cargo会读取Cargo.toml
{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}
**⑤**
>**概述**：
{%list%}

{%endlist%}
{%right%}

{%endright%}
{%warning%}

{%endwarning%}
{%wrong%}

{%endwrong%}

