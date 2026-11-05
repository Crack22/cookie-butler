# Cookie Butler · Cloudflare Pages 版

> 本仓库是 [woleigedouer/cookie-butler](https://github.com/woleigedouer/cookie-butler)
> 的 Fork 移植版，原作者与源码归属见原仓库与 package.json（MIT，作者栏原文为
> "Your Name"）。本移植不声称 許諾 为原作者，只说明这份 Cloudflare 适配改动
> 是在这个 Fork 里做的。

## 与原版的不同

- **只保留「扫码获取 Cookie」**：前端（`public/`）+ 两个后端接口
  `POST /api/qrcode`、`POST /api/check-status`，支持夸克、UC（Cookie 版 /
  Token 版）、阿里云盘、115、百度网盘、哔哩哔哩、光鸭。
- **Telegram 机器人已排除在部署之外**：`telegram/` 文件夹仍留在仓库里，
  但 Pages Functions（`functions/`）不 import 它，部署时也不会启动任何
  Bot；不需要 `TELEGRAM_BOT_TOKEN` 等变量。
- **后端改成 Cloudflare Pages Functions**（见 `functions/api/`），不再用
  Vercel 风格的 `req/res` 处理器，也不用 `dev-server.js`（Express）。

## 移植改动（最小化，只动 Node 专属部分，平台逻辑未重写）

| 文件 | 改动 |
|---|---|
| `functions/api/qrcode.js`（新增） | Pages Functions 风格：`onRequestPost(context)` 返回 `Response`，处理 `OPTIONS`；响应体与前端期望一致 |
| `functions/api/check-status.js`（新增） | 同上，对应 `/api/check-status` |
| `lib/utils/common.js` | `axios` → Web `fetch`（返回 `{ data, headers, status }`，兼容原调用方，包括 `validateStatus`、`responseType: 'arraybuffer'`、`set-cookie`）；删除 `os.networkInterfaces()`；CORS 改为同源 + localhost + `ALLOWED_ORIGINS` 环境变量，不再硬编码部署域名；`Buffer` Base64 → `TextEncoder/TextDecoder` + `atob/btoa`（UTF-8 正确） |
| `lib/platforms/base.js` | `fs.readFileSync` 读 `config/platforms.json` → 静态 JSON import（`with { type: 'json' }`） |
| `lib/platforms/uc-token.js` | 直接用的 `axios.get` → `httpRequest`，`validateStatus: () => true` 保持不变 |
| `lib/platforms/baidu.js` | `Buffer.from(...).toString('base64')` → 分块 `btoa` |
| `lib/platforms/guangyapan.js` | Node `crypto.randomBytes` → Web Crypto `crypto.getRandomValues` |
| `package.json` | 删除不再使用的 `axios` 依赖；其余（作者、MIT 声明）原样保留 |
| `lib/utils/common.js`（补充） | 对象体 + `application/x-www-form-urlencoded` 头时发 `URLSearchParams`，与 axios 行为一致（阿里状态检查靠这个，否则接口不认 JSON 体） |

原版 `api/`（Vercel 路由）和 `dev-server.js`（Express）仍留在仓库中作参考，
Cloudflare 部署不使用它们。

## Cloudflare Pages 项目设置

在 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，
选本仓库后按以下设置：

- **项目名（建议）**：`cookie-butler`（最终域名形如
  `cookie-butler-<随机>.pages.dev`，可在 Pages 设置里再改自定义域名）
- **生产分支**：`main`
- **框架预设**：None（不要选 Next.js / Vercel 相关预设）
- **构建命令**：留空（不需要构建；前端是 `public/` 下的静态文件，
  Functions 由 Cloudflare 直接打包）
- **构建输出目录**：`public`
- **Functions 目录**：默认 `functions`（仓库根目录下的 `functions/`，
  不要改成 `public/functions`）
- **环境变量**：全部可选，不填也能跑
  - `ALLOWED_ORIGINS`：如需允许其它域名跨域调用接口，逗号分隔，
    例如 `https://example.com`；留空时只允许同源（Pages 域名本身）
    和 localhost 调用
  - 不需要 `TELEGRAM_BOT_TOKEN`、`PORT`、`VERCEL_URL`

部署完成后打开 Pages 域名，点一个平台按钮扫码即可；二维码由平台官方
接口实时生成，**不要扫描别人的二维码，也不要把扫码后得到的 Cookie
发给任何人**——Cookie 等同于账号登录凭证。

## 本地验证（已做，见提交说明）

```bash
npm install
npx wrangler pages dev public --compatibility-date=2025-01-01
# 然后 POST http://localhost:8788/api/qrcode  { "platform": "bilibili" }
# 再 POST http://localhost:8788/api/check-status { "platform": "bilibili", "sessionKey": "<上一步返回的>" }
```

注意：本地/线上都只验证到「二维码生成成功、状态轮询返回结构正常」，
不做真实扫码登录，不使用任何真实账号。

## 本地验证结果（2026-11-05，沙箱内，见提交前实测）

- `wrangler pages dev` 能成功编译并跑起静态页 + Functions（`public/` + `functions/`）。
- 用同一份 Functions 处理器在 Node 里实测（沙箱的 workerd 会被本地出口代理
  的 TLS 拦截挡住，属沙箱环境问题，线上 Cloudflare 边缘没有这层代理）：
  夸克、UC、阿里、哔哩哔哩、UC Token、光鸭、百度：二维码生成成功且状态
  轮询返回 NEW；115：二维码生成成功，状态检查在沙箱里多次 15 秒超时
  （同主机的 token 接口在沙箱里也时好时坏，原版 axios 代码在沙箱里
  同样卡在百度/115，属网络波动而非移植崩溃；前端每 30 秒轮询一次，
  单次失败会被下一次轮询覆盖，上线后需在真实 pages.dev 上复测一次）。
- 阿里状态检查曾因 form 体被发成 JSON 而返回 EXPIRED，已按上表修复并
  复测为 NEW。
