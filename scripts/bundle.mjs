/**
 * index.html + src/*를 단일 HTML 한 장으로 합친다.
 * 아티팩트로 배포하거나 파일 하나만 전달할 때 쓴다.
 *   node scripts/bundle.mjs   →   dist/canvas-notes.html
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(resolve(root, p), 'utf8');

const [html, css, store, main] = await Promise.all(
  ['index.html', 'src/style.css', 'src/store.js', 'src/main.js'].map(read),
);

// store.js를 main.js 앞에 이어 붙인다(모듈 하나로 합쳐지므로 export/import는 제거).
const script = [
  store.replace(/^export /gm, ''),
  main.replace(/^import .*?;\n/s, ''),
].join('\n');

const body = html
  .replace(/<link rel="stylesheet" href="src\/style\.css">/, `<style>\n${css}</style>`)
  .replace(
    /<script type="module" src="src\/main\.js"><\/script>/,
    `<script type="module">\n${script}</script>`,
  )
  // 아티팩트 호스트가 문서 껍데기를 직접 씌우므로 여기서는 본문만 남긴다.
  .replace(/^[\s\S]*?<link rel="stylesheet" href="https/m, '<link rel="stylesheet" href="https')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '');

const title = '<title>무한 캔버스 노트</title>\n';

await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/canvas-notes.html'), title + body.trimStart() + '\n');
console.log('dist/canvas-notes.html');
