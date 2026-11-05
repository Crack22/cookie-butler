import { platformFactory } from '../../lib/platforms/index.js';
import { createErrorResponse, getCorsHeaders } from '../../lib/utils/common.js';

// Cloudflare Pages Functions：POST /api/qrcode
// 前端 public/script.js 以 axios.post('/api/qrcode', { platform }) 调用，
// 返回体与原 Vercel 版保持一致：{ success, data: { qrcode, sessionKey }, message, timestamp }
function corsHeaders(request, env) {
    const origin = request.headers.get('origin') || '';
    const selfOrigin = new URL(request.url).origin;
    return getCorsHeaders(origin, { allowedOrigins: env?.ALLOWED_ORIGINS || '', selfOrigin });
}

function json(body, status, request, env) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const { platform } = await request.json();
        if (!platform) {
            return json(createErrorResponse('缺少platform参数'), 400, request, env);
        }
        const instance = platformFactory.create(platform);
        const result = await instance.generateQRCode();
        return json(result, 200, request, env);
    } catch (error) {
        console.error('[QRCode API] 服务器错误:', error);
        return json(createErrorResponse('服务器内部错误: ' + error.message), 500, request, env);
    }
}

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, context.env) });
}

export async function onRequest(context) {
    return json(createErrorResponse('Method not allowed'), 405, context.request, context.env);
}
