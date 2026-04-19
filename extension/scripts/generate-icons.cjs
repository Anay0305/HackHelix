// Generate placeholder icons for the Chrome extension
// Run: node scripts/generate-icons.cjs

const fs = require("fs");
const path = require("path");

// Simple SVG hand-sign icon
function generateSVG(size) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <g transform="translate(${size * 0.5}, ${size * 0.5})">
    <!-- Palm -->
    <rect x="${-size * 0.15}" y="${-size * 0.1}" width="${size * 0.3}" height="${size * 0.35}" rx="${size * 0.05}" fill="white" opacity="0.95"/>
    <!-- Fingers -->
    <rect x="${-size * 0.12}" y="${-size * 0.35}" width="${size * 0.06}" height="${size * 0.25}" rx="${size * 0.03}" fill="white" opacity="0.95"/>
    <rect x="${-size * 0.03}" y="${-size * 0.38}" width="${size * 0.06}" height="${size * 0.28}" rx="${size * 0.03}" fill="white" opacity="0.95"/>
    <rect x="${size * 0.06}" y="${-size * 0.35}" width="${size * 0.06}" height="${size * 0.25}" rx="${size * 0.03}" fill="white" opacity="0.95"/>
    <!-- Thumb -->
    <rect x="${-size * 0.2}" y="${-size * 0.05}" width="${size * 0.05}" height="${size * 0.18}" rx="${size * 0.025}" fill="white" opacity="0.95" transform="rotate(-30 ${-size * 0.175} ${size * 0.04})"/>
  </g>
</svg>`;
}

// Convert SVG to PNG using a simple Canvas-based approach
// For Node.js, we'll just save the SVG and let the user convert manually,
// or use a library like sharp/canvas. For simplicity, saving SVG as PNG placeholder.

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, "..", "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach((size) => {
  const svg = generateSVG(size);
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Generated ${svgPath}`);
});

console.log("\nSVG icons generated. To convert to PNG:");
console.log("1. Install sharp: npm install --save-dev sharp");
console.log("2. Or use an online converter like cloudconvert.com");
console.log("3. Or open each SVG in a browser and screenshot at the correct size");
console.log("\nFor now, Chrome will accept SVG files if you rename them to .png");
console.log("or update manifest.json to reference .svg files.");

// Quick hack: copy SVG to PNG extension (Chrome accepts SVG as PNG in dev mode)
sizes.forEach((size) => {
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  const pngPath = path.join(iconsDir, `icon${size}.png`);
  fs.copyFileSync(svgPath, pngPath);
  console.log(`Copied to ${pngPath} (SVG with .png extension)`);
});
