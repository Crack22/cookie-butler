// 二维码 → PNG data URL（纯 JS，无第三方依赖）。
// 替代 npm 的 `qrcode` 包：Cloudflare Pages Functions 在无构建命令、无 npm install
// 的部署下无法解析 node_modules 里的 `qrcode`（打包报 Could not resolve "qrcode"）。
// 二维码矩阵由 vendored 的 qrcode-generator 1.4.4（MIT，见 qrcode-generator.js）生成，
// PNG 编码用未压缩的 stored DEFLATE 块 + CRC32/Adler-32，全部纯 JS，Workers 可用。
// 返回格式与原来一致：`data:image/png;base64,...`，前端直接赋给 <img src> 即可。

import qrcode from './qrcode-generator.js';

// 注意：qrcode-generator 默认的 stringToBytes 是 Latin-1 截断（charCode & 0xff），
// 非 ASCII 内容（如中文）会被编坏；必须显式切到它自带的 UTF-8 编码。
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
    return out;
}

// zlib 流：0x78 0x01 + 若干 stored DEFLATE 块（不压缩，Workers/Node 通用）+ Adler-32。
function zlibStore(raw) {
    const blocks = Math.max(1, Math.ceil(raw.length / 65535));
    const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
    let p = 0;
    out[p++] = 0x78; out[p++] = 0x01;
    let offset = 0;
    for (let b = 0; b < blocks; b++) {
        const len = Math.min(65535, raw.length - offset);
        const final = b === blocks - 1 ? 1 : 0;
        out[p++] = final;
        out[p++] = len & 0xff; out[p++] = (len >> 8) & 0xff;
        out[p++] = (~len) & 0xff; out[p++] = ((~len) >> 8) & 0xff;
        out.set(raw.subarray(offset, offset + len), p);
        p += len;
        offset += len;
    }
    const adler = adler32(raw);
    out[p++] = (adler >>> 24) & 0xff; out[p++] = (adler >>> 16) & 0xff;
    out[p++] = (adler >>> 8) & 0xff; out[p++] = adler & 0xff;
    return out.subarray(0, p);
}

function bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(s);
}

// ---------- 二维码渲染 ----------
// options 与原来 `qrcode` 包的调用保持兼容：{ width, margin, errorCorrectionLevel }。
// width 为目标像素宽（配置里是 200），margin 为边距的模块数。
export function qrToDataURL(content, options = {}) {
    const errorCorrectionLevel = options.errorCorrectionLevel || 'M';
    const margin = options.margin ?? 1;
    const targetWidth = options.width || 200;

    // typeNumber 0 = 自动选择最小版本；内容过长时抛错由调用方按原逻辑处理。
    const qr = qrcode(0, errorCorrectionLevel);
    qr.addData(content);
    qr.make();

    const modules = qr.getModuleCount();
    const cellSize = Math.max(1, Math.floor(targetWidth / (modules + margin * 2)));
    const size = (modules + margin * 2) * cellSize;

    // 灰度图（color type 0，bit depth 8）：每行 1 个 filter 字节 + size 个像素字节。
    const raw = new Uint8Array(size * (size + 1));
    for (let y = 0; y < size; y++) {
        const rowStart = y * (size + 1);
        raw[rowStart] = 0; // filter: None
        for (let x = 0; x < size; x++) {
            const moduleRow = Math.floor(y / cellSize) - margin;
            const moduleCol = Math.floor(x / cellSize) - margin;
            const dark = moduleRow >= 0 && moduleRow < modules &&
                moduleCol >= 0 && moduleCol < modules &&
                qr.isDark(moduleRow, moduleCol);
            raw[rowStart + 1 + x] = dark ? 0 : 255;
        }
    }

    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, size, false);
    ihdrView.setUint32(4, size, false);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 0; // color type: grayscale
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    const png = new Uint8Array(
        signature.length + (12 + ihdr.length) + (12 + zlibStore(raw).length) + 12
    );
    const idat = zlibStore(raw);
    let p = 0;
    png.set(signature, p); p += signature.length;
    png.set(pngChunk('IHDR', ihdr), p); p += 12 + ihdr.length;
    png.set(pngChunk('IDAT', idat), p); p += 12 + idat.length;
    png.set(pngChunk('IEND', new Uint8Array(0)), p);

    return 'data:image/png;base64,' + bytesToBase64(png);
}
