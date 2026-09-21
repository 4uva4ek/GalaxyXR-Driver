// Convert the XLIFF catalogs (src/locale/messages.*.xlf) into the per-locale
// JSON maps consumed by src-lit/locale/i18n.ts at build time.
// The XLIFF files remain the source of truth for translations; this script
// only reprojects them, so no translation content is lost or hand-edited.
//
// Usage: node scripts/xlf-to-locale.mjs <srcDir> <outDir>
//   srcDir  directory containing messages.xlf / messages.zh-Hant.xlf / messages.ja.xlf
//   outDir  directory receiving en-US.json / zh-Hant.json / ja.json
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: node scripts/xlf-to-locale.mjs <srcDir> <outDir>');
  process.exit(1);
}

function decodeEntities(s) {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

// NOTE: datatype="html" catalog units keep their inline tags (<b> etc.) so
// banner text stays bold. Callers render those with Lit unsafeHTML; the
// catalog is project-owned content, not user input.

function readCatalog(file, identity) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = {};
  const unitRe = /<trans-unit\b[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = unitRe.exec(xml)) !== null) {
    const body = m[1];
    const source = body.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const target = body.match(/<target[^>]*>([\s\S]*?)<\/target>/);
    if (!source) continue;
    const key = decodeEntities(source[1].trim()).replace(/\s+/g, ' ');
    // The base (en-US) catalog has no <target> elements: the source string
    // is the English value, so the identity map keeps every unit.
    const value = target
      ? decodeEntities(target[1].trim()).replace(/\s+/g, ' ')
      : (identity ? key : '');
    if (key && value) out[key] = value;
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
const locales = [
  { code: 'en-US', file: path.join(srcDir, 'messages.xlf') },
  { code: 'zh-Hant', file: path.join(srcDir, 'messages.zh-Hant.xlf') },
  { code: 'ja', file: path.join(srcDir, 'messages.ja.xlf') },
];
for (const { code, file } of locales) {
  if (!fs.existsSync(file)) {
    console.error(`missing catalog: ${file}`);
    process.exit(1);
  }
  const catalog = readCatalog(file, code === 'en-US');
  const outFile = path.join(outDir, `${code}.json`);
  fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`wrote ${outFile} (${Object.keys(catalog).length} units)`);
}
