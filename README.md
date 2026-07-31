# SecondBrain 桌面版

SecondBrain 是本地优先的个人知识桌面应用。安装后像普通软件一样从桌面或开始菜单打开，
应用会自动找到知识内容，并在内容变化后自动更新。日常使用不需要终端、npm、端口或手动扫描。

## 普通使用

运行 `release/SecondBrain-Setup-1.0.0.exe` 完成安装。安装程序会创建开始菜单入口，
并可创建桌面快捷方式。以后双击 `SecondBrain` 即可。

通常应用会自动找到 `Documents/SecondBrain` 或与程序相邻的知识库。只有无法自动识别时，
才会显示首次使用页面，让用户选择一次资料位置。路径、刷新等低频操作统一收在“设置”中。

## 开发者运行

```powershell
cd app
npm.cmd install
npm.cmd start
```

应用读取知识库但不修改任何 `schema`、`raw`、`wiki`、`index` 或 `log`。用户选择和窗口设置
保存在应用自己的配置目录，不会写入知识库。

## 打包

生成可直接运行的 Windows 目录：

```powershell
npm.cmd run pack
```

生成 Windows 安装程序：

```powershell
npm.cmd run dist
```

产物位于 `release/`。

## 单一数据源

应用架构分支只负责代码，不拥有知识数据：

```text
同一个 brains/ Markdown Vault
        ↑             ↑
  知识维护流程     SecondBrain 桌面版
```

`npm test` 会运行数据分支保护。只要当前分支不是 `master`，以下情况会使测试失败：

- `master...HEAD` 中存在已提交的 `brains/**` 差异；
- 暂存区中存在准备提交到架构分支的 `brains/**` 文件。

工作区中尚未暂存的笔记不会被改动。知识数据在 `master` 形成唯一历史，桌面应用只读取
同一份物理知识库。

## 可选网页调试

桌面应用不依赖 HTTP 服务，但原来的网页调试入口仍然保留：

```powershell
npm.cmd run web
```

访问 `http://127.0.0.1:4173`。这只是开发兼容模式，不是日常启动方式。

## 目录

```text
app/
├── config/brains.json       # 脑区注册表
├── src/desktop.mjs          # Electron 主进程
├── src/preload.cjs          # 安全 IPC 桥接
├── src/service.mjs          # 桌面数据服务
├── src/markdown.mjs         # Markdown 与 wikilink 渲染
├── src/wiki.mjs             # 只读索引、链接解析、审计、搜索
├── src/server.mjs           # 可选网页调试服务
├── scripts/                 # 分支数据保护
├── public/                  # 桌面界面
└── tests/                   # 索引器、外部 Vault 和渲染测试
```
