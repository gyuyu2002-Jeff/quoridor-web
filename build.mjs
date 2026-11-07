import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const html = read('src/index.html')
  .replace('/* APP_STYLES */', () => read('src/styles.css'))
  .replace('// APP_SCRIPT', () => ['src/game.js', 'src/ai.js', 'src/network.js', 'src/app.js']
    .map((file) => read(file).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n'));
mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), html);
mkdirSync(new URL('docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('docs/index.html', import.meta.url), html);
writeFileSync(new URL('docs/.nojekyll', import.meta.url), '');
mkdirSync(new URL('dist/server/', import.meta.url), { recursive: true });
const worker = `${read('src/game.js').replace(/^export /gm, '')}\n${read('worker/api.js').replace(/^import .*;\r?\n/gm, '')}\nconst PAGE_HTML = ${JSON.stringify(html)};\nexport default { fetch(request, env) { const url = new URL(request.url); if (url.pathname.startsWith('/api/')) return handleRoomApi(request, env); return new Response(PAGE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } }); } };\n`;
writeFileSync(new URL('dist/server/index.js', import.meta.url), worker);
mkdirSync(new URL('dist/.openai/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/.openai/hosting.json', import.meta.url), read('.openai/hosting.json'));
console.log('Built standalone HTML and room API Worker.');
