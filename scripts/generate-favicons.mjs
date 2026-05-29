// Rasterize favicons + OG image from the Logomark design.
// Deps (not in package.json): npm install --no-save sharp to-ico
// Run from repo root: node scripts/generate-favicons.mjs
// Sources: src/components/brand/Logomark.jsx is the SVG truth.
// Brand: canvas #161814, paper #F5F1E8, accent #C6F24E.

import sharp from "sharp";
import toIco from "to-ico";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC = "public";

// Square icon: dark canvas + outlined "A" mark + lime green dot accent.
// Padded to 32-unit viewBox for a tighter favicon read at small sizes.
const iconSvg = ({ size = 256, bg = true } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  ${bg ? '<rect width="32" height="32" rx="6" fill="#161814"/>' : ""}
  <rect x="3" y="3" width="26" height="26" rx="6" fill="none" stroke="#F5F1E8" stroke-width="1.6"/>
  <path d="M10 22 L16 11 L22 22" fill="none" stroke="#F5F1E8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="25" cy="8" r="2.8" fill="#C6F24E"/>
</svg>
`.trim();

// Maskable (Android adaptive) variant: same mark with safe-zone padding.
const maskableSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" fill="#161814"/>
  <rect x="7" y="7" width="18" height="18" rx="4" fill="none" stroke="#F5F1E8" stroke-width="1.2"/>
  <path d="M11 21 L16 12 L21 21" fill="none" stroke="#F5F1E8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="23" cy="9" r="2" fill="#C6F24E"/>
</svg>
`.trim();

// 1200x630 social share card — dark bg, large mark, wordmark, tagline.
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#161814"/>
  <!-- subtle accent glow -->
  <circle cx="1050" cy="120" r="220" fill="#C6F24E" opacity="0.08"/>
  <circle cx="150" cy="540" r="260" fill="#C6F24E" opacity="0.04"/>
  <!-- mark, scaled -->
  <g transform="translate(96, 200)">
    <rect x="0" y="0" width="170" height="170" rx="32" fill="none" stroke="#F5F1E8" stroke-width="6"/>
    <path d="M40 140 L85 50 L130 140" fill="none" stroke="#F5F1E8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="148" cy="22" r="14" fill="#C6F24E"/>
  </g>
  <!-- wordmark -->
  <text x="310" y="320" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="500" fill="#F5F1E8">
    ADUAtlas<tspan fill="#C6F24E">.</tspan>
  </text>
  <!-- tagline -->
  <text x="96" y="470" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif" font-size="34" font-weight="400" fill="#A8A89A">
    Pre Construction Preparation for Homeowners
  </text>
  <text x="96" y="530" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif" font-size="28" font-weight="500" fill="#F5F1E8" opacity="0.85">
    Know what you can legally build before you call a builder.
  </text>
  <!-- url -->
  <text x="96" y="585" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif" font-size="22" font-weight="500" fill="#C6F24E">
    aduatlas.com
  </text>
</svg>
`.trim();

const pngFromSvg = (svgString, size) =>
  sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();

const writePng = async (filename, svg, size) => {
  const buf = await pngFromSvg(svg, size);
  await writeFile(path.join(PUBLIC, filename), buf);
  console.log(`✓ ${filename} (${size}×${size}, ${buf.length}B)`);
};

const main = async () => {
  // SVG favicon (best modern browser experience)
  await writeFile(path.join(PUBLIC, "icon.svg"), iconSvg({ size: 32 }));
  console.log("✓ icon.svg");

  // PNG sizes
  await writePng("favicon-16x16.png", iconSvg({ size: 16 }), 16);
  await writePng("favicon-32x32.png", iconSvg({ size: 32 }), 32);
  await writePng("apple-touch-icon.png", iconSvg({ size: 180 }), 180);
  await writePng("android-chrome-192x192.png", iconSvg({ size: 192 }), 192);
  await writePng("android-chrome-512x512.png", iconSvg({ size: 512 }), 512);
  await writePng("maskable-icon-512x512.png", maskableSvg(512), 512);

  // ICO: multi-resolution
  const ico16 = await pngFromSvg(iconSvg({ size: 16 }), 16);
  const ico32 = await pngFromSvg(iconSvg({ size: 32 }), 32);
  const ico48 = await pngFromSvg(iconSvg({ size: 48 }), 48);
  const ico = await toIco([ico16, ico32, ico48]);
  await writeFile(path.join(PUBLIC, "favicon.ico"), ico);
  console.log(`✓ favicon.ico (16/32/48, ${ico.length}B)`);

  // OG 1200×630
  const ogBuf = await sharp(Buffer.from(ogSvg)).png().toBuffer();
  await writeFile(path.join(PUBLIC, "og-image.png"), ogBuf);
  console.log(`✓ og-image.png (1200×630, ${ogBuf.length}B)`);
};

main().catch((e) => { console.error(e); process.exit(1); });
