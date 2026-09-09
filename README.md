# Zfk's Study Notes

这是一个基于 [Hexo](https://hexo.io/) 构建的个人技术博客，主要记录嵌入式系统、通信协议、RTOS 以及软件开发相关的学习笔记。

博客地址：<https://paopaoziye.github.io>

## 内容方向

- 嵌入式系统与单片机开发
- CAN、IIC、SPI、UART 等通信协议
- ARM、RISC-V 与设备树
- FreeRTOS、U-Boot 等开源项目源码阅读
- Rust、C/C++ 及相关软件开发实践

## 环境要求

- Node.js
- npm
- Hexo 5.4.2（项目依赖已在 `package.json` 中声明）

## 快速开始

在项目根目录执行：

```bash
npm ci
npm run server
```

然后访问 <http://localhost:4000> 预览博客。

## 常用命令

```bash
# 启动本地预览服务器
npm run server

# 清理 Hexo 生成的缓存和输出目录
npm run clean

# 生成静态网站到 public/ 目录
npm run build

# 验证文章元数据和代码块格式，并完成完整构建校验
npm run verify

# 仅验证文章代码块标签和自定义 Prism 语法
npm run validate:codeblocks

# 验证已生成的网站
npm run validate:site

# 生成并部署到 GitHub Pages
npm run deploy
```

`npm run deploy` 需要已配置对应的 Git SSH 凭据，并会将网站发布到配置的 GitHub Pages 仓库。提交源代码前请确认部署目标和凭据配置正确。

## 项目结构

```text
.
├── _config.yml                         # Hexo 主配置
├── package.json                         # 项目脚本和依赖
├── package-lock.json                    # 锁定的依赖版本
├── scaffolds/                           # 新文章模板
├── source/                              # 文章、页面和静态资源
│   ├── _posts/                          # Markdown 文章
│   ├── _data/                           # 站点数据
│   └── image/                           # 文章图片等资源
├── themes/hexo-theme-matery/            # 本地定制主题
├── tools/                               # 构建和内容校验工具
└── public/                              # Hexo 生成的静态网站（忽略目录）
```

文章源文件位于 `source/_posts/`。文章图片通常使用 `/image/...` 根路径引用，并对应存放在 `source/image/` 下。主题行为和样式位于 `themes/hexo-theme-matery/`，修改后需要重新生成网站才能生效。

## 新建文章

可以使用 Hexo scaffold 创建文章：

```bash
npx hexo new post "文章标题"
```

创建后编辑生成的 Markdown 文件，并保留文章 Front-matter 中的日期、目录、标签、分类、摘要和封面图等字段。完成修改后建议执行：

```bash
npm run validate:metadata
npm run validate:codeblocks
npm run clean
npm run build
npm run validate:site
```

项目使用 Prism.js 处理代码高亮；文章代码块应使用项目约定的语言标签，例如 `arm-gas`、`riscv`、`devicetree`、`kconfig`、`cmake` 和 `makefile`。

## 许可证

本仓库中的文章、图片和主题定制内容归仓库作者所有。第三方主题、插件及依赖遵循其各自的许可证。未经许可，请勿转载原创文章和配图。
