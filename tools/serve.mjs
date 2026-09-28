// ─────────────────────────────────────────────────────────────
//  依存ゼロの静的プレビューサーバ（site/index.html を配信）
//
//  なぜ vite dev ではなくこれを使うか:
//   ・このサンドボックスはターンごとに作り直され、node_modules / dist は
//     スナップショットに残らない。vite を起動するには毎回 npm install が要る。
//   ・ゲームはビルドすると 1枚の HTML に全部インライン化されるので、
//     ビルド済みファイルを素の node で配れば 0.2 秒で復帰できる。
//
//  実行: node tools/serve.mjs   (PORT 環境変数で変更可、既定 5173)
// ─────────────────────────────────────────────────────────────
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'site');
const INDEX = path.join(ROOT, 'index.html');

const PORT = Number(process.env.PORT ?? 5173);
const HOST = '0.0.0.0';

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
]);

let indexBuf = null;
let indexMtime = 0;

async function loadIndex() {
  const st = await stat(INDEX);
  if (!indexBuf || st.mtimeMs !== indexMtime) {
    indexBuf = await readFile(INDEX);
    indexMtime = st.mtimeMs;
    console.log(`[serve] loaded ${INDEX} (${(indexBuf.length / 1024).toFixed(0)} kB)`);
  }
  return indexBuf;
}

let reqCount = 0;
const server = createServer((req, res) => {
  const n = ++reqCount;
  const host = req.headers.host ?? '-';
  // 最初の 20 件と、その後は 100 件ごとに「誰が来たか」を残す
  // （プレビュー基盤の疎通確認が届いているかを後から確認するため）
  if (n <= 20 || n % 100 === 0) console.log(`[serve] #${n} ${req.method} host=${host} path=${req.url}`);
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let body = null;
      let type = 'text/html; charset=utf-8';

      if (url.pathname !== '/' && url.pathname !== '/index.html') {
        const target = path.join(ROOT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
        if (target.startsWith(ROOT)) {
          try {
            const st = await stat(target);
            if (st.isFile()) {
              body = await readFile(target);
              type = TYPES.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream';
            }
          } catch {
            /* 見つからなければ index を返す（SPA フォールバック） */
          }
        }
      }
      if (!body) body = await loadIndex();

      // 埋め込み（iframe プレビュー）を妨げるヘッダは一切付けない
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': body.length,
        'Cache-Control': 'no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    } catch (e) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`build not found: run "npm run site"\n${e instanceof Error ? e.message : String(e)}`);
    }
  })();
});

server.listen(PORT, HOST, async () => {
  try {
    await loadIndex();
  } catch {
    console.error('[serve] site/index.html が見つかりません。先に `npm run site` を実行してください');
  }
  console.log(`[serve] listening on http://${HOST}:${PORT} (host check なし: どのプレビューホストでも 200)`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[serve] ${sig} → 終了`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500);
  });
}
