# SecondBrain 桌面版

SecondBrain 是本地优先的个人知识桌面应用。安装后像普通软件一样从桌面或开始菜单打开，
应用会自动找到知识内容，并在内容变化后自动更新。日常使用不需要终端、npm、端口或手动扫描。

本仓库只包含**桌面应用代码**；知识数据存放在独立的私有仓库中，不随软件发布。

## 普通使用

从 [GitHub Releases](https://github.com/NikolaYingZhao/SecondBrain-App/releases) 下载
最新的 `SecondBrain-Setup-<version>.exe` 完成安装。安装程序会创建开始菜单入口，并可创建
桌面快捷方式。以后双击 `SecondBrain` 即可。

**自动更新**：安装版启动后会自动检查 GitHub Releases，发现新版本即静默下载；下载完成后
在"设置 → 检查更新"中点击"重启安装"完成升级。绿色解压版（win-unpacked）不支持自动更新。

通常应用会自动找到 `Documents/SecondBrain` 或与程序相邻的知识库。只有无法自动识别时，
才会显示首次使用页面，让用户选择一次资料位置。路径、刷新等低频操作统一收在"设置"中。

## 开发者运行

```powershell
npm.cmd install
npm.cmd start
```

应用读取知识库但不修改任何 `schema`、`raw`、`wiki`、`index` 或 `log`。用户选择和窗口设置
保存在应用自己的配置目录，不会写入知识库。

唯一的例外是**阅读想法记录**：在阅读器中选中文字或页尾感想框写的想法，会作为
`reading-note` 碎片写入 `brains/inbox-brain/raw/fragments/`——这是整个知识体系设计的
"零摩擦捕获入口"，想法随后由 LLM 定期处理、路由到各脑。代码层用路径白名单保证
只能写入收件箱碎片目录，其余一切仍然只读。

## 打包

生成可直接运行的 Windows 目录：

```powershell
npm.cmd run pack
```

生成 Windows 安装程序（不上传）：

```powershell
npm.cmd run dist
```

产物位于 `release/`。

## 发布新版本

1. 更新 `package.json` 的 `version`（自动更新只在版本号升高时触发）；
2. 提交并推送；
3. 打 tag（格式 `v1.1.0`）并推送：

```powershell
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions 会在 windows-latest 上构建安装程序并发布到 Releases（含 `latest.yml`，
electron-updater 依赖它检查更新）。

## 可选网页调试

桌面应用不依赖 HTTP 服务，但原来的网页调试入口仍然保留：

```powershell
npm.cmd run web
```

访问 `http://127.0.0.1:4173`。这只是开发兼容模式，不是日常启动方式。

## 目录

```text
├── config/brains.json       # 脑区注册表
├── src/desktop.mjs          # Electron 主进程
├── src/updater.mjs          # 自动更新（electron-updater 封装）
├── src/preload.cjs          # 安全 IPC 桥接
├── src/service.mjs          # 桌面数据服务
├── src/markdown.mjs         # Markdown 与 wikilink 渲染
├── src/wiki.mjs             # 索引、链接解析、审计、搜索、金句池
├── src/server.mjs           # 可选网页调试服务
├── public/                  # 桌面界面
└── tests/                   # 索引器、外部 Vault、渲染与更新测试
```
