# ds反带开发文档

> 项目：DeepSeekWeb2API Windows 客户端
>
> 作用：把 DeepSeek 网页能力封装为 OpenAI 兼容 API，并提供 Windows 桌面控制面板。

## 1. 项目简介

`ds反带` 基于 DeepSeek 网页端工作，不使用 DeepSeek 官方 API Key。程序通过 Playwright 启动受控的 Chrome/Edge 浏览器，复用用户登录态，访问 DeepSeek 网页并读取回答，再转换为 OpenAI 兼容格式。

项目包含两个层次：

1. **API 服务层**：Node.js 原生 HTTP 服务，默认监听 `3000` 端口。
2. **Windows 客户端层**：Electron 桌面控制面板，负责启动、停止、重启服务，管理登录流程和查看日志。

当前项目不是官方 DeepSeek API，也不是一个直接嵌入 DeepSeek 网页的聊天窗口。

## 2. 运行架构

```text
┌──────────────────────────┐
│ Electron Windows 客户端   │
│ electron/main.cjs        │
│ electron/renderer/*      │
└────────────┬─────────────┘
             │ IPC
             ▼
┌──────────────────────────┐
│ Node 子进程               │
│ node src/index.js        │
└────────────┬─────────────┘
             │ Playwright
             ▼
┌──────────────────────────┐
│ Chrome / Edge 浏览器      │
│ DeepSeek 网页登录态       │
└──────────────────────────┘
```

### 2.1 API 请求流程

```text
OpenAI 客户端
    │ POST /v1/chat/completions
    ▼
Node HTTP 服务
    │ 校验 API Key、解析文本/图片、串行排队
    ▼
DeepSeekClient
    │ Playwright 操作 DeepSeek 页面
    ▼
DeepSeek 网页
    │ 读取 chat/completion 响应
    ▼
OpenAI 兼容 JSON 或 SSE 流式响应
```

同一个浏览器页面会串行处理请求。`src/mutex.js` 用于避免多个请求同时操作同一个 DeepSeek 页面。

## 3. 目录结构

```text
DeepSeekWeb2API/
├─ electron/
│  ├─ main.cjs                 # Electron 主进程、子进程和 IPC
│  ├─ preload.cjs              # contextBridge 安全接口
│  └─ renderer/
│     ├─ index.html             # 客户端页面
│     ├─ main.js                # 页面交互和日志显示
│     └─ style.css              # 页面样式
├─ src/
│  ├─ index.js                 # HTTP 服务入口
│  ├─ config.js                # 配置加载和浏览器检测
│  ├─ deepseekClient.js        # Playwright 浏览器自动化
│  ├─ http.js                  # JSON、SSE 和错误响应
│  ├─ parser.js                # Chat 请求解析和图片处理
│  ├─ models.js                # 模型列表和模型别名
│  ├─ mutex.js                 # 请求串行队列
│  └─ logger.js                # JSON 日志
├─ scripts/
│  └─ fetch-node.mjs           # 下载随客户端打包的 Node.exe
├─ .github/workflows/
│  └─ build-windows.yml        # Windows 云端构建和 Release 发布
├─ config.json                 # 默认配置模板
├─ package.json                # npm、Electron、electron-builder 配置
├─ 00登录.bat                  # 原始命令行登录脚本
├─ 01启动.bat                  # 原始后台启动脚本
├─ 02停止.bat                  # 原始停止脚本
└─ ds反带.md                   # 本开发文档
```

## 4. 开发环境

要求：

- Windows 10/11
- Node.js 20 或更高版本
- npm
- Chrome 或 Microsoft Edge
- Git

安装依赖：

```bash
npm install
```

验证后端语法：

```bash
node --check src/index.js
node --check electron/main.cjs
node --check electron/preload.cjs
```

## 5. 本地运行

### 5.1 直接运行 API 服务

```bash
npm start
```

服务默认监听：

```text
http://127.0.0.1:3000
```

### 5.2 登录 DeepSeek

命令行方式：

```bash
npm run login
```

登录窗口打开后完成网页登录。登录态会保存在配置指定的 `userDataDir` 中。登录完成后关闭登录进程，再启动 API 服务。

### 5.3 运行 Electron 客户端

开发模式：

```bash
npm run app:dev
```

客户端提供：

- 启动服务
- 停止服务
- 重启服务
- 打开 DeepSeek 登录
- 完成登录
- 打开 API 地址
- 打开登录页
- 打开配置目录
- 编辑 `config.json`
- 查看实时日志

## 6. 配置说明

默认配置文件位于仓库根目录 `config.json`。Electron 打包后不会直接修改安装目录中的配置，而是首次运行时复制到当前用户目录。

典型路径：

```text
%APPDATA%\DeepSeekWeb2API\config.json
```

### 6.1 服务配置

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "apiKey": "sk-local",
    "publicBaseUrl": "http://127.0.0.1:3000"
  }
}
```

- `host`：服务监听地址。`0.0.0.0` 表示监听所有网卡。
- `port`：HTTP 服务端口。
- `apiKey`：本地 API 访问密码，不是 DeepSeek 官方 Key。
- `publicBaseUrl`：展示和打开用的地址，建议使用 `127.0.0.1`，不要写 `0.0.0.0`。

`0.0.0.0` 只能作为监听地址，不能在浏览器中访问。客户端代码会自动把它转换成 `127.0.0.1`，但配置模板也应保持正确。

### 6.2 浏览器配置

```json
{
  "browser": {
    "headless": false,
    "channel": "auto",
    "prefer": "default",
    "executablePath": ""
  }
}
```

- `headless: false`：登录和排查问题时建议关闭无头模式。
- `channel: auto`：由程序使用检测到的浏览器路径。
- `prefer: default`：优先使用 Windows 默认 Chromium 浏览器。
- `prefer: edge`：优先 Edge。
- `prefer: chrome`：优先 Chrome。
- `executablePath`：手动指定浏览器 exe 路径。

### 6.3 路径配置

```json
{
  "paths": {
    "userDataDir": "data/user-data",
    "tempDir": "tmp"
  }
}
```

Electron 客户端启动子进程时会通过环境变量覆盖这两个路径，将其放到用户可写目录：

- `USER_DATA_DIR`：浏览器持久化登录态。
- `TEMP_DIR`：图片上传等临时文件。
- `CONFIG_PATH`：客户端实际使用的配置文件。

### 6.4 模型配置

模型定义位于 `models` 数组：

```json
{
  "id": "deepseek",
  "aliases": ["deepseek-chat"],
  "owned_by": "deepseek-web",
  "image_policy": "optional",
  "capabilities": {
    "thinking": false,
    "search": false,
    "expert": false,
    "vision": false
  }
}
```

能力开关：

- `thinking`：深度思考
- `search`：联网搜索
- `expert`：专家模式
- `vision`：图像理解

## 7. API 接口

### 7.1 健康检查

```http
GET http://127.0.0.1:3000/health
```

返回：

```json
{
  "ok": true,
  "queue": 0
}
```

### 7.2 模型列表

```http
GET http://127.0.0.1:3000/v1/models
Authorization: Bearer sk-local
```

### 7.3 普通对话

```http
POST http://127.0.0.1:3000/v1/chat/completions
Authorization: Bearer sk-local
Content-Type: application/json
```

请求：

```json
{
  "model": "deepseek",
  "messages": [
    {
      "role": "user",
      "content": "你好，请回复 OK"
    }
  ]
}
```

### 7.4 流式对话

```json
{
  "model": "deepseek",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "介绍一下 HTTP streaming"
    }
  ]
}
```

服务会返回 `text/event-stream`，并转换成 OpenAI 风格的 `chat.completion.chunk`。

### 7.5 图片输入

图片支持：

- `data:image/...;base64,...`
- 公网 `http(s)` 图片 URL

示例：

```json
{
  "model": "deepseek-vision",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "这张图里有什么？" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        }
      ]
    }
  ]
}
```

## 8. 客户端 IPC 设计

`electron/preload.cjs` 使用 `contextBridge` 向渲染进程暴露 `window.desktop`，渲染进程不直接访问 Node API。

当前接口：

```text
start()             启动服务
stop()              停止服务
restart()           重启服务
login()             启动登录进程
loginDone()         结束登录进程
getState()          获取服务状态
openApi()           打开 API 地址
openLoginPage()     打开 DeepSeek 登录页
openConfigDir()     打开配置目录
openConfigFile()    编辑 config.json
onLog(callback)     监听日志
onState(callback)   监听状态变化
```

### 8.1 子进程模型

服务进程：

```text
node src/index.js
```

登录进程：

```text
node src/index.js --login
```

Electron 会把子进程的 stdout/stderr 转发到渲染进程。后端日志由 `src/logger.js` 输出为 JSON 行，客户端会把日志转换成易读格式。

## 9. Windows 打包

### 9.1 准备随包 Node.exe

```bash
npm run app:fetch-node
```

Node.exe 会下载到：

```text
build/node/node.exe
```

### 9.2 构建安装版和便携版

```bash
npm run app:pack
```

或者只执行 electron-builder：

```bash
npm run app:build
```

产物位于 `dist/`：

```text
DeepSeekWeb2API-版本-win-x64.exe
DeepSeekWeb2API-版本-win-x64-portable.exe
```

- 普通 `.exe`：NSIS 安装版。
- `-portable.exe`：免安装版。

安装包默认使用 `build/icon.png` 作为应用图标。当前应用未配置代码签名证书，Windows SmartScreen 可能提示未知发布者。

## 10. GitHub Actions 云端构建

工作流文件：

```text
.github/workflows/build-windows.yml
```

触发方式：

1. GitHub Actions 页面手动点击 `Run workflow`。
2. 推送 `v*` tag，例如：

```bash
git tag v0.1.3
git push origin v0.1.3
```

Windows runner 执行：

```text
npm ci
npm run app:fetch-node
electron-builder --win nsis portable --publish never
```

tag 构建会：

1. 生成 NSIS 安装版。
2. 生成 portable 便携版。
3. 上传 `windows-client` Actions Artifact。
4. 自动创建 GitHub Release 并附加 exe、blockmap 和 latest.yml。

工作流需要：

```yaml
permissions:
  contents: write
```

否则 Release 步骤会因没有仓库内容写权限而失败。

## 11. 开发注意事项

### 11.1 不要把 DeepSeek 官方 Key 写进仓库

`server.apiKey` 只是本地访问密码，可以提交默认模板，但不要提交真实账号密码、Cookie 或浏览器用户目录。

以下目录不应提交：

```text
node_modules/
node/
data/
tmp/
logs/
dist/
build/node/
```

### 11.2 网页 DOM 变化

项目依赖 DeepSeek 网页 DOM 和网络响应格式。网页改版后可能出现：

- 找不到输入框
- 找不到发送按钮
- 深度思考/联网搜索按钮失效
- 图片上传失败
- 无法读取 `chat/completion` 响应

主要排查文件：

```text
src/deepseekClient.js
```

重点选择器包括：

- `INPUT_SELECTOR`
- `SEND_BUTTON_NAMES`
- `THINK_BUTTON_NAMES`
- `SEARCH_BUTTON_NAMES`
- `VISION_BUTTON_NAMES`
- `submit()` 中的发送按钮选择器

### 11.3 浏览器登录态冲突

登录进程和 API 服务不能同时使用同一个浏览器用户目录。客户端会要求先停止服务，再打开登录流程。

### 11.4 服务地址

监听地址和访问地址要区分：

```text
监听：0.0.0.0:3000
访问：http://127.0.0.1:3000
```

不要在浏览器中打开：

```text
http://0.0.0.0:3000
```

## 12. 常见问题

### Q1：登录成功后没有聊天窗口

这是正常的。当前 Windows 客户端是 API 服务控制面板，不是内置聊天 UI。登录完成后，需要用 OpenAI 兼容客户端调用：

```text
Base URL: http://127.0.0.1:3000/v1
API Key: sk-local
Model: deepseek
```

### Q2：打开 API 地址提示 ERR_ADDRESS_INVALID

检查 `publicBaseUrl` 是否写成了 `0.0.0.0`。应改为：

```text
http://127.0.0.1:3000
```

新版客户端会自动修正这个地址。

### Q3：返回 deepseek_not_logged_in

重新点击客户端里的“打开 DeepSeek 登录”，确认浏览器登录的是正确账号，然后点击“完成登录”，最后重启服务。

### Q4：返回 401 Invalid API key

确认请求头与 `config.json` 中的 `server.apiKey` 完全一致：

```http
Authorization: Bearer sk-local
```

修改配置后需要重启服务。

### Q5：返回 DeepSeek composer was not found

可能原因：

- 登录态过期
- DeepSeek 页面加载失败
- 网页 DOM 已变化
- 当前账号没有访问对应功能

先用浏览器手动访问 DeepSeek，确认页面正常，再查看客户端日志。

### Q6：打包后浏览器无法启动

优先检查：

1. Windows 是否安装 Chrome 或 Edge。
2. `browser.prefer` 是否正确。
3. `browser.executablePath` 是否需要手动填写。
4. Windows 用户是否有权限访问浏览器用户目录。

## 13. 后续开发方向

建议的后续功能：

1. 在 Electron 客户端中增加内置聊天窗口。
2. 增加模型下拉选择、系统提示词和流式输出显示。
3. 增加 API Key 编辑界面，减少手动打开配置文件的需要。
4. 增加端口占用检测和服务健康状态轮询。
5. 增加应用自动更新。
6. 为 Windows 安装包配置代码签名。
7. 增加单元测试和 API 集成测试。
8. 为 DeepSeek DOM 选择器增加版本化和诊断页面。

## 14. V2 双入口与内置聊天

V2 在保留 V1 API 服务的基础上增加了 Electron 内置聊天入口。内置聊天通过 IPC 调用本地 API 服务，不需要用户手动填写 API Key；外部工具仍使用 OpenAI 兼容接口和本地 `sk-` Key。

内置聊天使用方式：

1. 完成 DeepSeek 网页登录。
2. 点击“启动服务”。
3. 在“内置聊天”区域输入消息并发送。
4. 内置聊天与外部 API 共用本地服务、浏览器登录态和串行队列。

V2 新增模块：

- `src/sessionStore.js`：按 API Key 哈希保存 JSON 会话。
- `src/promptBuilder.js`：保留 system、assistant tool_calls 和 tool 结果轨迹。
- `src/toolBridge.js`：将网页文本翻译为标准 OpenAI `tool_calls`，不执行本地工具。
- `src/service.js`：统一 HTTP 和 Electron 请求使用的服务层。
- `src/browser.js`：可选 stealth 浏览器启动封装。
- `src/selectors.json`：自适应选择器候选配置。

### V2 API Key

V2 支持多个本地 API Key。每个 Key 可以独立启用、禁用、重新生成和删除。兼容 V1 的 `server.apiKey` 配置，首次读取时会迁移成 `server.apiKeys[0]`。

接受以下请求头：

```http
Authorization: Bearer sk-xxx
api-key: sk-xxx
x-api-key: sk-xxx
```

这些 Key 是本地服务访问密码，不是 DeepSeek 官方 API Key。

### V2 工具调用

外部客户端可以发送 OpenAI `tools` 和 `tool_choice`。服务会把工具定义加入给 DeepSeek 网页的提示词，并尝试从网页回答中解析工具调用，返回标准 `tool_calls` 和 `finish_reason: "tool_calls"`。

服务只负责返回 `tool_calls`，不会读取文件、执行命令或控制本地电脑。后续动作由 Cursor、Cline 等外部工具负责。

### V2 验证命令

```bash
npm test
node test/smoke-v2.mjs
```

冒烟测试只验证 `/health` 和 `/v1/models`，不会访问 DeepSeek 或消耗登录态。

## 15. 版本发布流程

```bash
# 1. 修改代码并本地验证
npm install
npm run app:pack

# 2. 提交代码
git add -A
git commit -m "feat: ..."
git push origin main

# 3. 发布 Windows 客户端
git tag v0.1.3
git push origin v0.1.3
```

推送 tag 后，GitHub Actions 会自动开始 Windows 构建。构建成功后，从 GitHub Releases 下载安装版或便携版。
