# SecondBrain Desktop V2

SecondBrain Desktop 是现有知识库的桌面阅览与检索层。Markdown Vault 是唯一数据源；
应用读取用户选择的 `brains/` 文件夹，不修改任何 schema、raw、wiki、index 或 log。

## 桌面启动

```powershell
cd app
npm.cmd install
npm.cmd start
```

应用启动后会直接打开桌面窗口，不需要手动启动网关，也不会打开浏览器。开发仓库中的
`../brains/` 会被自动识别；安装到其他位置后，首次启动选择一次 `brains` 文件夹即可。
所选路径保存在 Electron 的用户配置目录，不会写入知识库。

顶部的文件夹按钮可以随时切换 Vault，刷新按钮会重新扫描当前 Vault。

## 打包

生成可直接运行的 Windows 目录：

```powershell
npm.cmd run pack
```

生成 Windows 安装程序：

```powershell
npm.cmd run dist
```

产物位于 `release/`。安装版会创建开始菜单入口，并可选择创建桌面快捷方式。

## 单一数据源

应用架构分支只负责代码，不拥有知识数据：

```text
同一个 brains/ Markdown Vault
        ↑             ↑
  master 方案     V2 桌面方案
```

`npm test` 会运行数据分支保护。只要当前分支不是 `master`，以下情况会使测试失败：

- `master...HEAD` 中存在已提交的 `brains/**` 差异；
- 暂存区中存在准备提交到架构分支的 `brains/**` 文件。

工作区中尚未暂存的笔记不会被改动。知识数据应先在 `master` 形成唯一历史；应用分支只读取
该物理 Vault。待桌面方案验证稳定后，可以再把 Vault 无损拆成独立私有仓库。

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
