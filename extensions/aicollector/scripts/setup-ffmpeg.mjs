/**
 * Copies @ffmpeg/core runtime files into public/ffmpeg so the built
 * extension bundles them (WXT copies public/* to the output root).
 * Run automatically via postinstall, or manually: node scripts/setup-ffmpeg.mjs
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist');
const destDir = join(root, 'public', 'ffmpeg');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'];

if (!existsSync(srcDir)) {
  console.error('[setup-ffmpeg] @ffmpeg/core not found in node_modules, run pnpm install first');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}

console.log(`[setup-ffmpeg] copied ${files.length} files to public/ffmpeg/`);
