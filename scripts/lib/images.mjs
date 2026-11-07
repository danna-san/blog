// 添付メディアのダウンロード・縮小・メタデータ除去・サイズ取得。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { stripJpegGps } from './exif.mjs';

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
const KIND_BY_EXT = { jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', mp4: 'video', mov: 'video', webm: 'video' };

let magickCmd;
function magick() {
  if (magickCmd !== undefined) return magickCmd;
  magickCmd = null;
  for (const cmd of ['magick', 'convert']) {
    try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); magickCmd = cmd; break; } catch { /* 次へ */ }
  }
  return magickCmd;
}

/** PNG / JPEG / GIF / WebP のピクセルサイズを読む */
export function imageSize(buf) {
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    let orientation = 1;
    while (off + 9 < buf.length && buf[off] === 0xff) {
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xe1 && buf.toString('latin1', off + 4, off + 10) === 'Exif\0\0') orientation = readOrientation(buf, off + 10) || 1;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const h = buf.readUInt16BE(off + 5);
        const w = buf.readUInt16BE(off + 7);
        return orientation >= 5 ? { width: h, height: w } : { width: w, height: h };
      }
      off += 2 + len;
    }
  }
  return null;
}

function readOrientation(buf, tiff) {
  try {
    const le = buf.toString('latin1', tiff, tiff + 2) === 'II';
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    const ifd = tiff + u32(tiff + 4);
    for (let i = 0, n = u16(ifd); i < n; i++) if (u16(ifd + 2 + i * 12) === 0x0112) return u16(ifd + 2 + i * 12 + 8);
  } catch { /* 壊れた Exif は無視 */ }
  return 0;
}

async function download(url, token) {
  const tryFetch = (auth) => fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'issue-diary-blog', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let res = await tryFetch(false);
  if ((res.status === 401 || res.status === 403 || res.status === 404) && token) res = await tryFetch(true);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { type, buffer: Buffer.from(await res.arrayBuffer()) };
}

/**
 * メディアを docs/assets/media/YYYY/MM/ に保存し、記事から参照する情報を返す。
 * 失敗した場合は元 URL をそのまま使う（記事の公開は止めない）。
 */
export async function saveMedia(media, { date, outDir, config, token, fixtureDir, log = console }) {
  const hash = createHash('sha1').update(media.url).digest('hex').slice(0, 10);
  const [y, m, d] = date.split('-');
  const relDir = `assets/media/${y}/${m}`;
  const absDir = join(outDir, relDir);
  // 既に保存済みなら再ダウンロードしない（再生成時の冪等性）
  for (const ext of Object.keys(KIND_BY_EXT)) {
    const p = join(absDir, `${d}-${hash}.${ext}`);
    if (existsSync(p)) return describe(p, `${relDir}/${d}-${hash}.${ext}`, ext, media);
  }
  try {
    let type, buffer;
    if (media.url.startsWith('fixture:')) {
      const file = join(fixtureDir, media.url.slice('fixture:'.length));
      buffer = readFileSync(file);
      type = { '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' }[extname(file)] || '';
    } else {
      ({ type, buffer } = await download(media.url, token));
    }
    const ext = EXT_BY_TYPE[type];
    if (!ext) { log.warn?.(`未対応の形式のため埋め込みません: ${media.url} (${type})`); return { type: 'link', src: media.url, alt: media.alt }; }
    if (KIND_BY_EXT[ext] === 'video' && buffer.length > config.images.maxVideoMB * 1024 * 1024) {
      log.warn?.(`動画が大きすぎるので元 URL を参照します: ${media.url}`);
      return { type: 'video', src: media.url, alt: media.alt };
    }
    mkdirSync(absDir, { recursive: true });
    const file = join(absDir, `${d}-${hash}.${ext}`);
    writeFileSync(file, buffer);
    if (KIND_BY_EXT[ext] === 'image') processImage(file, ext, config.images, log);
    return describe(file, `${relDir}/${d}-${hash}.${ext}`, ext, media);
  } catch (e) {
    log.warn?.(`メディアの保存に失敗したので元 URL を参照します: ${media.url} (${e.message})`);
    return { type: media.kind === 'video' ? 'video' : 'image', src: media.url, alt: media.alt };
  }
}

function processImage(file, ext, opts, log) {
  if (ext === 'gif') return; // アニメーションを壊さない
  const cmd = magick();
  if (cmd) {
    const tmp = `${file}.tmp.${ext}`;
    try {
      execFileSync(cmd, [file, '-auto-orient', '-resize', `${opts.maxWidth}x${opts.maxWidth}>`, '-strip', '-quality', String(opts.quality), tmp], { stdio: 'ignore' });
      renameSync(tmp, file);
      return;
    } catch (e) { log.warn?.(`ImageMagick での変換に失敗: ${e.message}`); }
  }
  if (ext === 'jpg') {
    const { buffer, stripped } = stripJpegGps(readFileSync(file));
    if (stripped) writeFileSync(file, buffer);
  }
}

function describe(absPath, src, ext, media) {
  const kind = KIND_BY_EXT[ext];
  const out = { type: kind, src, alt: media.alt || '' };
  if (kind === 'image') {
    const size = imageSize(readFileSync(absPath));
    if (size) Object.assign(out, size);
  }
  return out;
}

export function copyDir(src, dest) {
  if (!existsSync(src)) return;
  execFileSync('cp', ['-R', `${src}/.`, dest]);
}
