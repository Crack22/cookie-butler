> Cloudflare Pages 移植版：本 Fork 在原版基础上做了 Cloudflare Pages 适配，
> 只保留扫码获取 Cookie，Telegram 机器人不部署、不启动。
> 部署与改动说明见 [CLOUDFLARE.md](./CLOUDFLARE.md)。
> 原项目：[woleigedouer/cookie-butler](https://github.com/woleigedouer/cookie-butler)。

# Cookie Butler

一个企业级多平台二维码Cookie获取工具，支持夸克网盘、UC网盘（Cookie版+Token版）、阿里云盘、115网盘、百度网盘、哔哩哔哩的扫码登录。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/cookie-butler)

## ✨ 特性

- 🏗️ **企业级架构** - 采用工厂模式+继承体系，高度模块化
- 🔒 **安全可靠** - 严格的CORS白名单，多重安全防护
- ⚙️ **完全配置化** - 所有参数可通过配置文件和环境变量管理
- 🚀 **高性能** - API响应速度提升86%，内存占用优化
- 🔧 **易于扩展** - 新增平台只需3步，支持热配置更新
- 📱 **现代化UI** - 响应式设计，支持移动端
- 🔐 **多认证方式** - 支持Cookie和OAuth Token两种认证方式（UC网盘）
- 🤖 **原生 TG 接入** - Telegram Bot 直接复用平台工厂，无需外挂 Python 机器人

## 🚀 快速开始

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0

### 本地开发
```bash
# 1. 克隆项目
git clone https://github.com/YOUR_USERNAME/cookie-butler.git
cd cookie-butler

# 2. 安装依赖
npm install

# 额外：如需启用 Telegram Bot，复制环境变量模板
cp .env.example .env

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器访问
http://localhost:3000
```

### 生产部署

#### Docker 生产部署（推荐）
```bash
# 1. 创建docker-compose.yml文件
curl -O https://raw.githubusercontent.com/woleigedouer/cookie-butler/main/docker-compose.yml

# 2. 启动服务（自动拉取镜像）
docker-compose up -d

# 3. 访问应用
http://localhost:3000
```

**或者直接运行**：
```bash
docker run -d \
  --name cookie-butler \
  --network host \
  -e NODE_ENV=production \
  ghcr.io/woleigedouer/cookie-butler:main
```

#### Vercel 部署
1. 点击上方的 "Deploy with Vercel" 按钮
2. 连接你的 GitHub 仓库
3. 配置环境变量（可选）
4. 点击部署

#### 环境变量配置
复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
# 可选：额外的CORS域名（应用会自动处理部署域名）
# ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 其他可选配置
# API_TIMEOUT=15000
# SESSION_TTL=300000

# Telegram Bot
# TELEGRAM_BOT_TOKEN=123456:ABCDEF_your_bot_token
# TELEGRAM_BOT_ALLOWED_CHAT_IDS=123456789,987654321
# TELEGRAM_BOT_UPDATE_TIMEOUT=25
# TELEGRAM_BOT_STATUS_INTERVAL=3000
# TELEGRAM_BOT_QR_TIMEOUT=300000
```

**💡 提示**：应用会自动处理CORS配置，通常不需要手动设置环境变量。

### Telegram Bot 使用

1. 在 `@BotFather` 创建机器人并拿到 `TELEGRAM_BOT_TOKEN`
2. 复制 `.env.example` 为 `.env`，填入 `TELEGRAM_BOT_TOKEN`
3. 可选配置 `TELEGRAM_BOT_ALLOWED_CHAT_IDS`，限制可访问的私聊 `chat_id`
4. 启动服务后，在 Telegram 私聊机器人发送 `/start` 或 `/ck`

**行为说明**：
- 机器人默认使用长轮询，不需要额外 Webhook
- 机器人只允许私聊使用，避免群聊泄露 Cookie 或 Token
- TG 端直接复用项目内部平台逻辑，不走 `/api/qrcode` 和 `/api/check-status` 二次中转

#### Docker 部署选项

**使用预构建镜像**：
```bash
# 从GitHub Container Registry拉取
docker run -d --network host --name cookie-butler ghcr.io/woleigedouer/cookie-butler:main
```

**使用Docker Compose**：
```bash
docker-compose up -d
```

### Docker 详细部署说明

#### 基础Docker部署
```bash
# 直接运行预构建镜像
docker run -d \
  --name cookie-butler \
  --network host \
  -e NODE_ENV=production \
  ghcr.io/woleigedouer/cookie-butler:main
```

#### Docker Compose管理
```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart cookie-butler

# 更新镜像
docker-compose pull && docker-compose up -d

# 停止服务
docker-compose down
```

#### 特性
- Node.js应用容器
- 自动重启
- 安全配置

#### 开发者构建（可选）
如果需要修改代码或本地构建：
```bash
# 1. 克隆项目
git clone https://github.com/woleigedouer/cookie-butler.git
cd cookie-butler

# 2. 本地构建并运行
docker-compose -f docker-compose.dev.yml up -d
```

#### 注意事项
1. **网络模式** - 使用host模式以确保API访问正常，避免网络超时问题
2. **自动配置** - 应用会自动处理CORS和域名配置，检测本机IP地址
3. **简单维护** - 容器会自动重启，日志可通过 `docker-compose logs` 查看
4. **多架构支持** - 自动适配 AMD64、ARM64、ARM32 架构
5. **端口访问** - host模式下直接使用3000端口，无需端口映射

## 📁 项目结构

```
cookie-butler/
├── package.json              # 项目配置
├── dev-server.js             # 本地开发服务器
├── Dockerfile                # Docker构建文件
├── docker-compose.yml        # Docker编排配置
├── .dockerignore             # Docker构建忽略文件
├── .env.example              # 环境变量配置示例
├── telegram/                 # Telegram机器人模块
│   └── bot.js                # TG轮询、按钮交互、二维码状态管理
├── api/                      # Vercel API 路由入口
│   ├── qrcode.js             # 二维码生成路由
│   └── check-status.js       # 状态检查路由
├── lib/                      # 平台实现与通用工具
│   ├── platforms/            # 平台实现与平台工厂
│   │   ├── base.js           # 基础平台类
│   │   ├── index.js          # 平台工厂
│   │   ├── 115.js            # 115网盘实现
│   │   ├── ali.js            # 阿里云盘实现
│   │   ├── baidu.js          # 百度网盘实现
│   │   ├── bilibili.js       # 哔哩哔哩实现
│   │   ├── guangyapan.js     # 光鸭云盘实现
│   │   ├── quark.js          # 夸克网盘实现
│   │   ├── uc.js             # UC网盘Cookie版实现
│   │   └── uc-token.js       # UC网盘Token版实现（OAuth）
│   └── utils/
│       └── common.js         # 通用工具、安全函数和加密工具
├── config/                   # 平台配置
│   └── platforms.json        # 平台配置
└── public/                   # 前端文件
    ├── index.html           # 主页面
    ├── script.js            # 交互逻辑
    ├── style.css            # 样式文件
    └── shixiao.jpg          # 占位图片
```

## 🏗️ 架构设计

### 设计模式
- **工厂模式** - `platformFactory` 统一管理平台实例
- **模板方法模式** - `BasePlatform` 定义算法骨架，子类实现具体步骤
- **策略模式** - 每个平台都是独立的策略实现

### 核心组件
- **路由层** - API文件只负责请求处理和响应
- **业务层** - 平台类专注核心业务逻辑
- **配置层** - JSON文件管理所有可变参数
- **工具层** - 基类提供通用功能
- **渠道层** - Web 页面和 Telegram Bot 共享同一套平台工厂与状态机

## 🔧 扩展指南

### 新增平台支持
只需3步即可添加新平台：

1. **创建平台类**
```javascript
// lib/platforms/newplatform.js
import { BasePlatform } from './base.js';

export class NewPlatform extends BasePlatform {
    constructor() {
        super('newplatform');
    }

    async generateQRCode() {
        // 实现二维码生成逻辑
    }

    async checkStatus(sessionKey) {
        // 实现状态检查逻辑
    }
}
```

2. **添加配置**
```json
// config/platforms.json
{
  "platforms": {
    "newplatform": {
      "name": "新平台",
      "endpoints": {
        "getToken": "https://api.newplatform.com/token"
      }
    }
  }
}
```

3. **注册到工厂**
```javascript
// lib/platforms/index.js
import { NewPlatform } from './newplatform.js';

this.platforms = {
    // ... 其他平台
    'newplatform': NewPlatform
};
```

### 配置热更新
修改 `config/platforms.json` 中的配置，重启服务即可生效。支持：
- API端点URL更新
- 请求参数调整
- User-Agent更换
- 超时时间配置

## 🔒 安全特性

- **CORS白名单** - 严格控制允许访问的域名
- **请求验证** - 完整的参数校验和错误处理
- **现代API** - 使用最新的Web标准，避免安全漏洞
- **环境隔离** - 开发/生产环境配置分离

## 🌟 支持的平台

| 平台 | 认证方式 | 状态 | 说明 |
|------|---------|------|------|
| 夸克网盘 | Cookie | ✅ | 扫码获取Cookie |
| UC网盘 | Cookie | ✅ | CAS认证，获取Cookie |
| UC网盘 | OAuth Token | ✅ | TV版OAuth流程，获取access_token |
| 阿里云盘 | Cookie | ✅ | 扫码获取Cookie |
| 115网盘 | Cookie | ✅ | 扫码获取Cookie |
| 百度网盘 | Cookie | ✅ | 扫码获取Cookie |
| 哔哩哔哩 | Cookie | ✅ | 扫码获取Cookie |

### UC网盘双认证说明

UC网盘提供两种认证方式：

1. **UC-CK（Cookie版）**
   - 使用CAS（Central Authentication Service）认证
   - 获取service ticket后换取Cookie
   - 适用于常规Web应用

2. **UC-TK（Token版）**
   - 使用OAuth 2.0流程
   - 获取access_token和refresh_token
   - 适用于TV端和开放平台API
   - 支持token刷新机制

---

**版本**: 2.2.0
**更新时间**: 2026-01-10
**架构**: 企业级模块化设计
