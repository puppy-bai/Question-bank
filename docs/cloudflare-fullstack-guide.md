# Cloudflare 前后端完整部署新手教程

这份文档是给当前题库网站使用的。目标是把项目从“本地演示版”升级成“线上可用的前端 + 后端 + 数据库”。

## 1. 最终架构

```text
用户浏览器
  -> Cloudflare Pages 前端网站
  -> Cloudflare Workers 后端接口
  -> Cloudflare D1 数据库
```

以后如果 Word 文件很大，可以再加：

```text
Cloudflare R2 文件存储
```

## 2. 你需要准备什么

1. Cloudflare 账号。
2. GitHub 仓库：当前仓库已经有。
3. 本机 Node.js：当前项目已经可以运行 npm。
4. Wrangler：Cloudflare 官方命令行工具，会通过 `npm install` 安装到 `worker/`。

## 3. 项目目录说明

```text
web/                  前端 React 网站
worker/               Cloudflare Workers 后端
worker/src/index.js   后端 API 入口
worker/migrations/    D1 数据库表结构
docs/                 部署说明文档
```

## 4. 第一次安装后端依赖

在项目根目录打开终端：

```bash
cd worker
npm install
```

检查 Wrangler：

```bash
npx wrangler --version
```

登录 Cloudflare：

```bash
npx wrangler login
```

它会打开浏览器，让你授权。

## 5. 创建 D1 数据库

在 `worker/` 目录执行：

```bash
npx wrangler d1 create question-bank-db
```

成功后，终端会输出类似：

```json
{
  "database_name": "question-bank-db",
  "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

把 `database_id` 复制下来。

打开：

```text
worker/wrangler.jsonc
```

把这一行：

```text
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

替换成你刚刚复制的真实 `database_id`。

## 6. 创建数据库表

在 `worker/` 目录执行：

```bash
npx wrangler d1 migrations apply question-bank-db --remote
```

它会把 `worker/migrations/` 里的 SQL 执行到 Cloudflare D1。

如果它问你是否确认，输入：

```text
y
```

## 7. 本地测试后端

在 `worker/` 目录执行：

```bash
npx wrangler dev
```

打开：

```text
http://127.0.0.1:8787/api/health
```

如果看到：

```json
{"ok":true}
```

说明后端跑起来了。

## 8. 部署后端 Worker

在 `worker/` 目录执行：

```bash
npx wrangler deploy
```

部署成功后，你会得到一个后端地址，类似：

```text
https://question-bank-api.xxx.workers.dev
```

这个地址就是前端以后要连接的 API 地址。

## 9. 部署前端 Pages

推荐用 Cloudflare Pages 连接 GitHub 仓库。

创建 Pages 项目时填写：

```text
Framework preset: Vite
Root directory: web
Build command: npm run build
Build output directory: dist
```

部署完成后，你会得到前端地址，类似：

```text
https://question-bank.pages.dev
```

## 10. 前端连接后端

下一步要做的是在 `web/` 里新增：

```text
web/src/lib/apiClient.js
web/src/store-cloudflare.js
```

然后把现在的 `localStorage` 数据层逐步替换成 Worker API。

第一阶段先接这些接口：

```text
POST /api/auth/login
GET  /api/banks
GET  /api/questions?bankId=xxx
POST /api/user-banks/join
POST /api/answers
POST /api/favorites/toggle
```

第二阶段接管理员接口：

```text
POST /api/admin/login
POST /api/admin/import-bank
POST /api/admin/activation-codes
```

## 11. 当前后端接口清单

```text
GET  /api/health
POST /api/auth/login
POST /api/admin/login
GET  /api/banks
GET  /api/questions?bankId=xxx
POST /api/user-banks/join
POST /api/answers
POST /api/favorites/toggle
POST /api/admin/import-bank
POST /api/admin/activation-codes
```

## 12. 重要提醒

当前 Worker 还是第一版后端骨架：

- 管理员密码默认是 `admin123`。
- 用户登录还是姓名 + 手机号。
- 还没有接真实短信验证码。
- 还没有接真实支付。
- 还没有把前端完全切到云端 API。

这很正常。我们要一步一步来：

1. 先让 D1 数据库和 Worker 跑起来。
2. 再让前端读取云端题库。
3. 再让管理员导入题库写入云端。
4. 再做激活码和授权。
5. 最后再接收款码或支付接口。

## 13. 你下一步要做什么

先完成这三步：

```bash
cd worker
npm install
npx wrangler login
```

然后创建数据库：

```bash
npx wrangler d1 create question-bank-db
```

把输出的 `database_id` 发给我，或者你自己填进 `worker/wrangler.jsonc` 后告诉我“填好了”。我再带你执行迁移、部署后端、连接前端。
