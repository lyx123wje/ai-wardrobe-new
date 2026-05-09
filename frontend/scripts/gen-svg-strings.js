const fs = require('fs');
const path = require('path');

const SVG_DIR = path.join(__dirname, '..', 'src', 'assets', 'svg');
const files = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));

for (const file of files) {
  const content = fs.readFileSync(path.join(SVG_DIR, file), 'utf-8');
  const varName = file.replace('.svg', '');
  const escaped = content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  const jsContent = `// Auto-generated from ${file} — do not edit manually
module.exports = \`${escaped}\`;
`;

  const outPath = path.join(SVG_DIR, file.replace('.svg', '.js'));
  fs.writeFileSync(outPath, jsContent, 'utf-8');
  console.log(`Generated: ${file} → ${path.basename(outPath)}`);
}

console.log('Done. All SVGs exported as JS string modules.');
