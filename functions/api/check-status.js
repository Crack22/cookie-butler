import { platformFactory } from '../../lib/platforms/index.js';
import { createErrorResponse, getCorsHeaders } from '../../lib/utils/common.js';

// Cloudflare Pages Functions：POST /api/check-status
// 前端以 axios.post('/api/check-status', { platform, sessionKey }) 轮询，
// 返回体与原版一致：{ success, data: { status, cookie?, token? }, message, timestamp }
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
        const { platform, sessionKey } = await request.json();
        if (!platform) {
            return json(createErrorResponse('缺少platform参数'), 400, request, env);
        }
        const instance = platformFactory.create(platform);
        const result = await instance.checkStatus(sessionKey);
        return json(result, 200, request, env);
    } catch (error) {
        console.error('[Status API] 服务器错误:', error);
        return json(createErrorResponse('服务器内部错误: ' + error.message), 500, request, env);
    }
}

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, context.env) });
}

export async function onRequest(context) {
    return json(createErrorResponse('Method not allowed'), 405, context.request, context.env);
}
