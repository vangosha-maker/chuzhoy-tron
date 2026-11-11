// Собирает один самостоятельный файл docs/index.html (его же отдаёт GitHub Pages).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`src/${name}`, import.meta.url), 'utf8');
const parts = {
  '/* STYLES */': 'style.css',
  '/* ENGINE */': 'engine.js',
  '/* SOLVER */': 'solver.js',
  '/* BOT */': 'bot.js',
  '/* APP */': 'app.js',
};
let html = read('template.html');
for (const [marker, file] of Object.entries(parts)) html = html.replace(marker, () => read(file));

mkdirSync(new URL('docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('docs/index.html', import.meta.url), html);
console.log(`docs/index.html: ${Buffer.byteLength(html)} байт`);
