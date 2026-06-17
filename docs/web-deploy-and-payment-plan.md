# 网站版免费部署与收费接入方案

## 当前网站版位置

网站版代码在：

```text
web/
```

本地运行：

```bash
cd web
npm install
npm run dev
```

本地访问：

```text
http://127.0.0.1:5173
```

生产构建：

```bash
npm run build
```

构建产物目录：

```text
web/dist
```

## 当前版本说明

当前 Web/H5 版保留了小程序的核心业务流程：

- 用户登录/注册
- 题库市场
- 加入我的题库
- 顺序练习
- 随机练习
- 专项练习
- 章节练习
- 模拟考试
- 错题
- 收藏
- 管理员题库管理
- 管理员题库导入入口
- 考试模板配置
- 用户答题统计
- 支付入口预留

当前数据保存在浏览器 `localStorage`，用于免费部署演示和业务流程验证。正式收费运营前，需要换成真实后端数据库。

## 免费部署方式一：Cloudflare Pages

优点：免费额度高、国内外访问相对稳定、可以后续接 Cloudflare Workers / D1。

步骤：

1. 注册 GitHub 账号。
2. 把整个项目上传到 GitHub 仓库。
3. 打开 Cloudflare Pages。
4. 选择 `Create a project`。
5. 连接 GitHub 仓库。
6. Framework preset 选择 `Vite`。
7. Root directory 填：

```text
web
```

8. Build command 填：

```bash
npm run build
```

9. Build output directory 填：

```text
dist
```

10. 点击部署。

部署完成后，会得到类似：

```text
https://xxx.pages.dev
```

学生可以直接打开这个网址使用。

## 免费部署方式二：Vercel

优点：操作简单，适合快速测试。

步骤：

1. 把项目上传到 GitHub。
2. 打开 Vercel。
3. Import GitHub Project。
4. Root Directory 选择：

```text
web
```

5. Build Command：

```bash
npm run build
```

6. Output Directory：

```text
dist
```

7. 点击 Deploy。

部署完成后，会得到类似：

```text
https://xxx.vercel.app
```

## 免费部署的限制

纯静态免费部署只能承载前端页面。下面这些正式运营能力需要后端：

- 多用户数据同步
- 管理员上传 Word 并解析
- 用户购买记录
- 会员有效期
- 题库权限
- 支付回调
- 订单防伪
- 账号密码安全保存

所以当前网站版适合先上线演示、测试流程、给客户试用。正式向学生收费前，需要接一个后端。

## 后续推荐后端

### 低成本方案：Supabase 免费版

适合：

- 用户登录
- 数据库
- 题库数据
- 订单数据
- 会员权限
- 管理后台

可以把 `web/src/store.js` 替换为 Supabase API。

### Cloudflare 方案

适合：

- Cloudflare Pages 部署前端
- Cloudflare Workers 做接口
- Cloudflare D1 做数据库

优点是前后端都在 Cloudflare 生态里，免费额度较高。

### 自有服务器方案

适合正式商业化：

- Node.js 后端
- MySQL / PostgreSQL
- Word 解析服务
- 支付回调服务
- 管理员后台 API

需要备案、服务器、安全配置，但长期最可控。

## 支付接口预留位置

当前前端支付入口在：

```text
web/src/main.jsx
Profile
```

当前数据层在：

```text
web/src/store.js
```

后续建议新增：

```text
web/src/lib/api.js
web/src/lib/payment.js
```

支付流程建议：

1. 用户点击购买题库或会员。
2. 前端请求后端创建订单。
3. 后端生成订单号。
4. 后端返回支付参数或收款码信息。
5. 用户支付。
6. 支付平台回调后端。
7. 后端确认订单已支付。
8. 后端给用户开通题库权限或会员。
9. 前端刷新权限。

## 如果先不用支付接口

可以先做激活码模式：

1. 管理员后台批量生成激活码。
2. 学生付款后获得激活码。
3. 学生在网站输入激活码。
4. 系统解锁题库或会员期限。

这个模式比直接接支付更快落地，也更适合早期验证定价。

## 正式收费前必须补齐

- 域名
- ICP 备案，如果服务器或域名解析到中国大陆服务
- 用户协议
- 隐私政策
- 退款规则
- 客服联系方式
- 订单系统
- 支付状态校验
- 后端数据库
- 管理员密码安全机制
- 数据备份

## 建议路线

第一步：先用 Cloudflare Pages 免费部署当前 Web 版。

第二步：找学生试用，验证界面和刷题流程。

第三步：确定收费方式：单题库、会员、激活码、机构批量账号。

第四步：接 Supabase 或 Cloudflare D1，把 localStorage 数据换成云端数据。

第五步：接支付或激活码系统。

第六步：再考虑小程序、H5、安卓 App 三端统一账号。
