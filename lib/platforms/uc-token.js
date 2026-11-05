import { BasePlatform } from './base.js';
import { STATUS, generateDeviceID, generateReqId, generateXPanToken, httpRequest } from '../utils/common.js';

/**
 * UC网盘TV版平台实现（Token认证方式）
 * 使用OAuth流程获取access_token，适用于TV端开放平台API
 */
export class UCTokenPlatform extends BasePlatform {
    constructor() {
        super('uc_token');
    }

    /**
     * 生成UC网盘TV版二维码
     * 使用OAuth authorize接口，返回base64编码的二维码图片
     */
    async generateQRCode() {
        try {
            // 时间戳格式：Math.floor(Date.now() / 1000).toString()+'000'
            const timestamp = Math.floor(Date.now() / 1000).toString() + '000';
            const deviceID = this.config.deviceId || generateDeviceID(timestamp);
            const reqId = generateReqId(deviceID, timestamp);

            // 构建请求路径和签名
            const pathname = '/oauth/authorize';
            const xPanToken = generateXPanToken('GET', pathname, timestamp, this.config.signKey);

            // 构建请求参数
            const params = {
                req_id: reqId,
                access_token: '', // 空字符串，首次获取时没有token
                app_ver: this.config.appVer,
                device_id: deviceID,
                device_brand: this.config.deviceInfo.device_brand,
                platform: this.config.deviceInfo.platform,
                device_name: this.config.deviceInfo.device_name,
                device_model: this.config.deviceInfo.device_model,
                build_device: this.config.deviceInfo.build_device,
                build_product: this.config.deviceInfo.build_product,
                device_gpu: this.config.deviceInfo.device_gpu,
                activity_rect: this.config.deviceInfo.activity_rect,
                channel: this.config.channel,
                auth_type: 'code',
                client_id: this.config.clientId,
                scope: 'netdisk',
                qrcode: '1',
                qr_width: '460',
                qr_height: '460'
            };

            // 发起请求
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('authorize'),
                params: params,
                headers: {
                    'User-Agent': this.getUserAgent(),
                    'x-pan-tm': timestamp.toString(),
                    'x-pan-token': xPanToken,
                    'x-pan-client-id': this.config.clientId
                }
            });

            // 检查响应
            if (response.data.status !== 0) {
                throw new Error(`获取二维码失败: ${response.data.message || '未知错误'}`);
            }

            const { query_token, qr_data } = response.data;

            // 创建会话数据
            const sessionKey = this.createSessionKey({
                query_token: query_token,
                device_id: deviceID,
                timestamp: timestamp
            });

            // 返回base64编码的二维码图片
            return this.createSuccessResponse({
                qrcode: `data:image/png;base64,${qr_data}`,
                sessionKey: sessionKey
            });

        } catch (error) {
            return this.createErrorResponse('生成二维码失败: ' + error.message);
        }
    }

    /**
     * 检查UC网盘TV版扫码状态
     * 轮询检查扫码状态，成功后获取code并换取access_token
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { query_token, device_id } = sessionData;

            // 第一步：检查扫码状态
            const codeStatus = await this.checkCodeStatus(query_token, device_id);

            if (codeStatus.status === STATUS.EXPIRED) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            if (codeStatus.status === STATUS.NEW) {
                return this.createSuccessResponse({ status: STATUS.NEW });
            }

            // 第二步：扫码成功，获取access_token
            if (codeStatus.status === STATUS.CONFIRMED && codeStatus.code) {
                const tokenResult = await this.getAccessToken(codeStatus.code, device_id);
                
                if (tokenResult.success) {
                    return this.createSuccessResponse({
                        status: STATUS.CONFIRMED,
                        token: tokenResult.access_token,
                        refresh_token: tokenResult.refresh_token,
                        expires_in: tokenResult.expires_in
                    });
                } else {
                    return this.createErrorResponse('获取access_token失败: ' + tokenResult.message);
                }
            }

            return this.createSuccessResponse({ status: STATUS.NEW });

        } catch (error) {
            return this.createErrorResponse('检查状态失败: ' + error.message);
        }
    }

    /**
     * 检查扫码状态（内部方法）
     * @param {string} queryToken 查询token
     * @param {string} deviceId 设备ID
     * @returns {Promise<Object>} 状态结果
     */
    async checkCodeStatus(queryToken, deviceId) {
        try {
            // 时间戳格式：Math.floor(Date.now() / 1000).toString()+'000'
            const timestamp = Math.floor(Date.now() / 1000).toString() + '000';
            const reqId = generateReqId(deviceId, timestamp);
            const pathname = '/oauth/code';
            const xPanToken = generateXPanToken('GET', pathname, timestamp, this.config.signKey);

            // 原来直接用 axios.get，因为 UC API 在等待扫码时返回 400；
            // Cloudflare 版改用 httpRequest，validateStatus: () => true 保持接受所有状态码
            const response = await httpRequest({
                method: 'GET',
                url: this.getEndpoint('getCode'),
                params: {
                    req_id: reqId,
                    access_token: '', // 空字符串，首次获取时没有token
                    app_ver: this.config.appVer,
                    device_id: deviceId,
                    device_brand: this.config.deviceInfo.device_brand,
                    platform: this.config.deviceInfo.platform,
                    device_name: this.config.deviceInfo.device_name,
                    device_model: this.config.deviceInfo.device_model,
                    build_device: this.config.deviceInfo.build_device,
                    build_product: this.config.deviceInfo.build_product,
                    device_gpu: this.config.deviceInfo.device_gpu,
                    activity_rect: this.config.deviceInfo.activity_rect,
                    channel: this.config.channel,
                    client_id: this.config.clientId,
                    scope: 'netdisk',
                    query_token: queryToken
                },
                headers: {
                    'User-Agent': this.getUserAgent(),
                    'x-pan-tm': timestamp.toString(),
                    'x-pan-token': xPanToken,
                    'x-pan-client-id': this.config.clientId
                },
                validateStatus: () => true // 接受所有状态码
            });

            // 检查响应状态
            if (response.status === 200 && response.data.status === 0 && response.data.code) {
                // 扫码成功，获取到code
                return {
                    status: STATUS.CONFIRMED,
                    code: response.data.code
                };
            } else if (response.status === 400) {
                // 400状态码，检查具体错误
                const errorData = response.data;

                if (errorData.errno === 11002) {
                    // 授权码Code二维码过期
                    return { status: STATUS.EXPIRED };
                } else if (errorData.errno === 11003) {
                    // 用户未确认授权（等待扫码）
                    return { status: STATUS.NEW };
                }
            }

            // 其他情况，默认返回NEW状态
            return { status: STATUS.NEW };

        } catch (error) {
            console.error('检查扫码状态失败:', error.message);
            return { status: STATUS.NEW };
        }
    }

    /**
     * 使用code换取access_token（内部方法）
     * @param {string} code 授权码
     * @param {string} deviceId 设备ID
     * @returns {Promise<Object>} token结果
     */
    async getAccessToken(code, deviceId) {
        try {
            // 时间戳格式：Math.floor(Date.now() / 1000).toString()+'000'
            const timestamp = Math.floor(Date.now() / 1000).toString() + '000';
            const reqId = generateReqId(deviceId, timestamp);

            // 注意：这个接口使用的是第三方代理API
            const response = await this.request({
                method: 'POST',
                url: this.getEndpoint('getToken'),
                data: {
                    req_id: reqId,
                    app_ver: this.config.appVer,
                    device_id: deviceId,
                    device_brand: this.config.deviceInfo.device_brand,
                    platform: this.config.deviceInfo.platform,
                    device_name: this.config.deviceInfo.device_name,
                    device_model: this.config.deviceInfo.device_model,
                    build_device: this.config.deviceInfo.build_device,
                    build_product: this.config.deviceInfo.build_product,
                    device_gpu: this.config.deviceInfo.device_gpu,
                    activity_rect: this.config.deviceInfo.activity_rect,
                    channel: this.config.channel,
                    code: code
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.code === 200 && response.data.data?.access_token) {
                return {
                    success: true,
                    access_token: response.data.data.access_token,
                    refresh_token: response.data.data.refresh_token,
                    expires_in: response.data.data.expires_in
                };
            } else {
                return {
                    success: false,
                    message: response.data.message || '未知错误'
                };
            }

        } catch (error) {
            console.error('获取access_token失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

