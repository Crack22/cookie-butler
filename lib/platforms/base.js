import { storage, createSuccessResponse, createErrorResponse, httpRequest } from '../utils/common.js';
import { qrToDataURL } from '../utils/qrcode-png.js';
// Cloudflare 版：Workers 没有 fs，配置直接静态 import 普通 JS 模块
// （config/platforms.js 由 config/platforms.json 生成，内容完全一致）。
import platformConfig from '../../config/platforms.js';

const config = platformConfig;

/**
 * 基础平台类 - 定义所有平台的通用接口和方法
 */
export class BasePlatform {
    constructor(name) {
        this.name = name;
        this.config = config.platforms[name];
        this.commonConfig = config.common;

        if (!this.config) {
            throw new Error(`未找到平台 ${name} 的配置`);
        }
    }

    /**
     * 生成二维码 - 抽象方法，子类必须实现
     * @returns {Promise<Object>} 包含二维码和sessionKey的响应对象
     */
    async generateQRCode() {
        throw new Error(`generateQRCode must be implemented by ${this.name} platform`);
    }

    /**
     * 检查扫码状态 - 抽象方法，子类必须实现
     * @param {string} sessionKey 会话密钥
     * @returns {Promise<Object>} 状态检查结果
     */
    async checkStatus(sessionKey) {
        throw new Error(`checkStatus must be implemented by ${this.name} platform`);
    }

    /**
     * 创建会话密钥 - 通用方法
     * @param {Object} data 要编码的数据
     * @param {number} ttl 过期时间（毫秒）
     * @returns {string} 编码后的会话密钥
     */
    createSessionKey(data, ttl = 300000) {
        return storage.encode({
            platform: this.name,
            ...data
        }, ttl);
    }

    /**
     * 解析会话密钥 - 通用方法
     * @param {string} sessionKey 会话密钥
     * @returns {Object|null} 解码后的数据，如果无效则返回null
     */
    parseSessionKey(sessionKey) {
        const sessionData = storage.decode(sessionKey);
        if (!sessionData || sessionData.platform !== this.name) {
            return null;
        }
        return sessionData;
    }

    /**
     * 获取配置的端点URL
     * @param {string} key 端点键名
     * @returns {string} 端点URL
     */
    getEndpoint(key) {
        const endpoint = this.config.endpoints?.[key];
        if (!endpoint) {
            throw new Error(`未找到平台 ${this.name} 的端点配置: ${key}`);
        }
        return endpoint;
    }

    /**
     * 获取用户代理字符串
     * @returns {string} User-Agent字符串
     */
    getUserAgent() {
        return this.config.userAgent || this.commonConfig.defaultUserAgent;
    }

    /**
     * 获取平台参数
     * @param {string} key 参数键名
     * @returns {any} 参数值
     */
    getParam(key) {
        return this.config.params?.[key];
    }

    /**
     * 获取平台头部信息
     * @param {string} key 头部键名
     * @returns {string} 头部值
     */
    getHeader(key) {
        return this.config.headers?.[key];
    }

    /**
     * 替换URL模板中的占位符
     * @param {string} template URL模板
     * @param {Object} variables 变量对象
     * @returns {string} 替换后的URL
     */
    replaceUrlTemplate(template, variables) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value);
        }
        return result;
    }

    /**
     * 生成二维码图片 - 通用方法
     * @param {string} content 二维码内容
     * @param {Object} options 二维码选项
     * @returns {Promise<string>} Base64格式的二维码图片
     */
    async generateQRCodeImage(content, options = {}) {
        const defaultOptions = this.commonConfig.qrcode;
        return qrToDataURL(content, { ...defaultOptions, ...options });
    }

    /**
     * 发送HTTP请求 - 通用方法，包含平台特定的错误处理
     * @param {Object} config 请求配置
     * @returns {Promise<Object>} 响应对象
     */
    async request(config) {
        try {
            // 使用配置的超时时间
            const requestConfig = {
                timeout: this.commonConfig.timeout,
                ...config
            };
            return await httpRequest(requestConfig);
        } catch (error) {
            console.error(`[${this.name}] HTTP请求失败:`, error.message);
            throw new Error(`${this.name}平台请求失败: ${error.message}`);
        }
    }

    /**
     * 创建成功响应 - 通用方法
     * @param {Object} data 响应数据
     * @param {string} message 响应消息
     * @returns {Object} 格式化的成功响应
     */
    createSuccessResponse(data, message = '') {
        return createSuccessResponse(data, message);
    }

    /**
     * 创建错误响应 - 通用方法
     * @param {string} message 错误消息
     * @param {Error} error 原始错误对象
     * @returns {Object} 格式化的错误响应
     */
    createErrorResponse(message, error = null) {
        const fullMessage = `${this.name}平台${message}`;
        return createErrorResponse(fullMessage, error);
    }
}
