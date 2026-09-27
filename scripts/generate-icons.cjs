const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

/**
 * Packs multiple PNG image buffers into a valid Windows ICO format.
 * Supported by Windows Vista, 7, 8, 10, 11 with full 32-bit RGBA transparency.
 */
function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved, must be 0
  header.writeUInt16LE(1, 2); // 1 = ICO type
  header.writeUInt16LE(images.length, 4); // Number of images

  let offset = 6 + images.length * 16;
  const dirEntries = [];
  const buffers = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    // Width and height: 0 means 256 in ICO spec
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // Palette color count
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset of image data
    dirEntries.push(entry);
    buffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...buffers]);
}

app.whenReady().then(async () => {
  const rootDir = path.resolve(__dirname, '..');
  const svgPath = path.join(rootDir, 'public', 'logo-app.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const buildDir = path.join(rootDir, 'build');
  const iconsetDir = path.join(buildDir, 'icons.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          svg {
            width: 100%;
            height: 100%;
            display: block;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;

  const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
    },
  });

  await win.loadURL(dataUri);
  await new Promise((r) => setTimeout(r, 600));

  console.log('Capturing 1024x1024 master image from SVG...');
  const masterImage = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  win.destroy();

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const rendered = {};
  for (const size of sizes) {
    if (size === 1024) {
      rendered[size] = masterImage.toPNG();
    } else {
      const resized = masterImage.resize({ width: size, height: size, quality: 'best' });
      rendered[size] = resized.toPNG();
    }
    console.log(`  Size ${size}x${size}: ready (${rendered[size].length} bytes)`);
  }

  // 2. Generate build/icon.png (1024x1024 RGBA with transparent rounded corners)
  const iconPngPath = path.join(buildDir, 'icon.png');
  fs.writeFileSync(iconPngPath, rendered[1024]);
  console.log(`Saved 1024x1024 rounded PNG to: ${iconPngPath}`);

  // 3. Generate build/icon.ico for Windows (multi-resolution 256 down to 16)
  const icoSizes = [256, 128, 64, 48, 32, 24, 16];
  const icoImages = icoSizes.map((s) => ({ width: s, height: s, buffer: rendered[s] }));
  const icoBuffer = createIco(icoImages);
  const iconIcoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(iconIcoPath, icoBuffer);
  console.log(`Saved Windows ICO (with ${icoSizes.length} sizes) to: ${iconIcoPath}`);

  // 4. Update macOS icons.iconset
  const iconsetMapping = [
    { file: 'icon_16x16.png', size: 16 },
    { file: 'icon_16x16@2x.png', size: 32 },
    { file: 'icon_32x32.png', size: 32 },
    { file: 'icon_32x32@2x.png', size: 64 },
    { file: 'icon_64x64.png', size: 64 },
    { file: 'icon_128x128.png', size: 128 },
    { file: 'icon_128x128@2x.png', size: 256 },
    { file: 'icon_256x256.png', size: 256 },
    { file: 'icon_256x256@2x.png', size: 512 },
    { file: 'icon_512x512.png', size: 512 },
    { file: 'icon_512x512@2x.png', size: 1024 },
    { file: 'icon_1024x1024.png', size: 1024 },
  ];

  for (const { file, size } of iconsetMapping) {
    fs.writeFileSync(path.join(iconsetDir, file), rendered[size]);
  }
  console.log(`Updated all ${iconsetMapping.length} iconset images in: ${iconsetDir}`);

  // 5. Generate macOS build/icon.icns if iconutil is available
  try {
    const icnsPath = path.join(buildDir, 'icon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
    console.log(`Generated macOS icon.icns at: ${icnsPath}`);
  } catch (err) {
    console.warn('Warning: iconutil failed or not available:', err.message);
  }

  console.log('All icons successfully updated with rounded corners!');
  app.exit(0);
});
