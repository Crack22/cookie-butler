import CryptoJS from 'crypto-js';

// Cloudflare Pages Functions / Workers 环境：没有 Node 的 axios、os、fs、Buffer，
// 统一用 Web 标准 fetch、atob/btoa、TextEncoder/TextDecoder。

// 通用请求头
export const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// 状态常量
export const STATUS = {
    NEW: 'NEW',
    SCANNED: 'SCANNED', 
    CONFIRMED: 'CONFIRMED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED'
};



// 按照CatPawOpen的getCookieArray实现
export const getCookieArray = (cookies) => {
    if (!cookies) return [];
    return cookies.map(cookie => cookie.split(";")[0] + ";");
}

// 格式化Cookie - 基于getCookieArray实现
export function formatCookies(cookies) {
    if (!cookies) return '';

    if (typeof cookies === 'string') {
        return cookies;
    }

    if (Array.isArray(cookies)) {
        return getCookieArray(cookies).join('');
    }

    return '';
}





// HTTP请求封装（Web fetch 版，替代 axios）
// 返回对象兼容原 axios 调用方：{ data, headers, status }
//  - data：JSON 解析结果；responseType 为 arraybuffer 时为 ArrayBuffer；
//    否则为文本（调用方按原逻辑处理）
//  - headers：小写键名的普通对象；set-cookie 尽量用 getSetCookie() 拆成数组，
//    否则退化为单个字符串（formatCookies 对数组和字符串都兼容）
//  - validateStatus：与 axios 语义一致，返回 false 时抛出带 response 的错误
export async function httpRequest(config) {
    const {
        method = 'GET',
        url,
        params,
        data,
        headers: configHeaders = {},
        timeout = 15000,
        responseType,
        validateStatus,
        ..._rest
    } = config || {};
    if (!url) throw new Error('httpRequest 缺少 url');

    let finalUrl = url;
    if (params && typeof params === 'object') {
        const u = new URL(finalUrl);
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            u.searchParams.append(k, String(v));
        }
        finalUrl = u.toString();
    }

    const headers = { ...COMMON_HEADERS, ...configHeaders };
    let body;
    if (data !== undefined && data !== null && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        if (typeof data === 'string') {
            body = data;
        } else if ((headers['Content-Type'] || headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
            // 与 axios 行为一致：对象体 + form 头时发 URLSearchParams，而不是 JSON
            body = new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])).toString();
        } else {
            body = JSON.stringify(data);
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/json';
            }
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
        response = await fetch(finalUrl, { method, headers, body, signal: controller.signal, redirect: 'follow' });
    } catch (error) {
        console.error('HTTP请求失败:', error.message);
        throw error;
    } finally {
        clearTimeout(timer);
    }

    const ok = typeof validateStatus === 'function' ? validateStatus(response.status) : (response.status >= 200 && response.status < 300);
    let parsed;
    if (responseType === 'arraybuffer') {
        parsed = await response.arrayBuffer();
    } else {
        const text = await response.text();
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        } else {
            // 部分平台接口返回 JSON 但不带 JSON content-type；能解析就解析
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
    }

    const plainHeaders = {};
    response.headers.forEach((value, key) => { plainHeaders[key.toLowerCase()] = value; });
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) plainHeaders['set-cookie'] = cookies;
    }

    const result = { data: parsed, headers: plainHeaders, status: response.status };
    if (!ok) {
        const err = new Error(`HTTP请求失败: ${response.status}`);
        err.response = result;
        err.status = response.status;
        throw err;
    }
    return result;
}

// 响应封装
export function createResponse(success, data = null, message = '') {
    return {
        success,
        data,
        message,
        timestamp: Date.now()
    };
}

// 错误响应
export function createErrorResponse(message, error = null) {
    console.error('API错误:', message, error);
    return createResponse(false, null, message);
}

// 成功响应
export function createSuccessResponse(data, message = '') {
    return createResponse(true, data, message);
}

/**
 * Cloudflare 版 CORS：不依赖 os.networkInterfaces() 和 process.env。
 * 允许的来源 = 同源（请求 URL 自身的 origin，即 Pages 域名本身）
 *   + localhost/127.0.0.1（本地开发）
 *   + ALLOWED_ORIGINS 环境变量里列出的域名（Pages 项目里设置，逗号分隔）
 * 调用方（Pages Functions）把 request.url 的 origin 和 context.env 传进来，
 * 因此不需要把未来 pages.dev 域名硬编码进代码。
 */
export function getCorsHeaders(origin, { allowedOrigins = '', selfOrigin = '' } = {}) {
    const list = [];
    if (selfOrigin) list.push(selfOrigin);
    list.push('http://localhost:3000', 'http://127.0.0.1:3000');
    if (allowedOrigins) {
        for (const item of String(allowedOrigins).split(',')) {
            const t = item.trim();
            if (t) list.push(t);
        }
    }
    const isLocal = origin && /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(origin);
    const allowed = origin && (isLocal || list.includes(origin));
    return {
        'Access-Control-Allow-Origin': allowed ? origin : (selfOrigin || 'http://localhost:3000'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'false',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
}

// 兼容旧的函数名：Pages Functions 里不再直接用它，保留一个返回头对象的版本，
// 避免其它引用点在移植期报错（不操作 Node 的 res 对象）。
export function setSafeCorsHeaders(_req, _res) {
    return getCorsHeaders(_req?.headers?.origin || _req?.headers?.get?.('origin') || '');
}

// ==================== 加密工具函数 ====================

/**
 * 生成MD5哈希
 * @param {string} text 要哈希的文本
 * @returns {string} MD5哈希值
 */
export function generateMD5(text) {
    return CryptoJS.MD5(text).toString();
}

/**
 * 生成SHA256哈希
 * @param {string} text 要哈希的文本
 * @returns {string} SHA256哈希值
 */
export function generateSHA256(text) {
    return CryptoJS.SHA256(text).toString();
}

/**
 * 生成设备ID（UC Token版专用）
 * @param {number} timestamp 时间戳
 * @returns {string} 16位设备ID
 */
export function generateDeviceID(timestamp) {
    return generateMD5(timestamp.toString()).slice(0, 16);
}

/**
 * 生成请求ID（UC Token版专用）
 * @param {string} deviceID 设备ID
 * @param {number} timestamp 时间戳
 * @returns {string} 16位请求ID
 */
export function generateReqId(deviceID, timestamp) {
    return generateMD5(deviceID + timestamp).slice(0, 16);
}

/**
 * 生成x-pan-token签名（UC Token版专用）
 * @param {string} method HTTP方法（GET/POST）
 * @param {string} pathname URL路径
 * @param {number} timestamp 时间戳
 * @param {string} signKey 签名密钥
 * @returns {string} SHA256签名
 */
export function generateXPanToken(method, pathname, timestamp, signKey) {
    const data = `${method}&${pathname}&${timestamp}&${signKey}`;
    return generateSHA256(data);
}

// ==================== 存储方案 ====================

// 客户端存储方案 - 将数据编码到sessionKey中
// 这样可以避免serverless环境下的内存存储问题
export const storage = {
    // 编码数据到sessionKey
    encode(data, ttl = 300000) {
        const payload = {
            data: data,
            expireTime: Date.now() + ttl,
            timestamp: Date.now()
        };
        // 使用Base64编码，添加简单的混淆（Web 标准：先 UTF-8 编码再 btoa）
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        const encoded = btoa(binary);
        return encoded.replace(/[+/=]/g, (match) => {
            switch (match) {
                case '+': return '-';
                case '/': return '_';
                case '=': return '';
                default: return match;
            }
        });
    },

    // 从sessionKey解码数据
    decode(sessionKey) {
        try {
            if (!sessionKey) return null;

            // 还原Base64字符
            let base64 = sessionKey.replace(/[-_]/g, (match) => {
                return match === '-' ? '+' : '/';
            });

            // 补充padding
            while (base64.length % 4) {
                base64 += '=';
            }

            const binary = atob(base64);
            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            const payload = JSON.parse(new TextDecoder().decode(bytes));

            // 检查是否过期
            if (Date.now() > payload.expireTime) {
                return null;
            }

            return payload.data;
        } catch (error) {
            console.error('解码sessionKey失败:', error);
            return null;
        }
    },

    // 兼容性方法
    set(_key, value, ttl = 300000) {
        // 在客户端存储方案中，这个方法返回编码后的key
        return this.encode(value, ttl);
    },

    get(sessionKey) {
        return this.decode(sessionKey);
    },

    delete(_key) {
        // 客户端存储方案中，删除操作由客户端处理
        return true;
    },

    clear() {
        // 客户端存储方案中，清除操作由客户端处理
        return true;
    }
};
