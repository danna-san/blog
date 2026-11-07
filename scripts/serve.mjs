#!/usr/bin/env node
// 確認用の小さな静的サーバー（外部ライブラリなし）。
//   node scripts/serve.mjs [dir] [--port 8080]
// 既定はリポジトリ直下を配信するので、/templates/layout.html でテンプレートも確認できる。
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, extname, sep } from 'node:path';
import { ROOT } from './lib/config.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.ico': 'image/x-icon',
};

export function serve(dir, port = 8080) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; } // ディレクトリ外は返さない
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      const nf = join(root, '404.html');
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      if (existsSync(nf)) createReadStream(nf).pipe(res); else res.end('404');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  server.listen(port, () => console.log(`http://localhost:${port}/ で ${root} を配信中（Ctrl+C で終了）`));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--port');
  const port = pi >= 0 ? Number(args[pi + 1]) : 8080;
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') || ROOT;
  serve(dir, port);
}
