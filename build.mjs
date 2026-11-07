import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const html = read('src/index.html')
  .replace('/* APP_STYLES */', () => read('src/styles.css'))
  .replace('// APP_SCRIPT', () => `${read('src/game.js').replace(/^export /gm, '')}\n${read('src/app.js').replace(/^import .*;\r?\n/m, '')}`);
mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), html);
console.log('Built dist/index.html — self-contained, no external dependencies.');
