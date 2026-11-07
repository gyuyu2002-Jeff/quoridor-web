import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const html = read('src/index.html')
  .replace('/* APP_STYLES */', () => read('src/styles.css'))
  .replace('// APP_SCRIPT', () => ['src/game.js', 'src/ai.js', 'src/app.js']
    .map((file) => read(file).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n'));
mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), html);
console.log('Built dist/index.html — self-contained, no external dependencies.');
