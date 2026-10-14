// Bundle the Electron main/preload processes.
// electron-updater is CJS and its dep chain (fs-extra, graceful-fs) calls
// require("fs") — esbuild's ESM output has no `require`, which crashes at
// startup with "Dynamic require of 'fs' is not supported". The createRequire
// banner restores it.
import fs from "node:fs";
import { build } from "esbuild";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV || "production", process.cwd(), "");

const esmBanner = `
import { createRequire as __cr } from "node:module";
const require = __cr(import.meta.url);
`;

await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["electron"],
  banner: { js: esmBanner },
  define: {
    "process.env.VITE_CLOUD_API_BASE": JSON.stringify(env.VITE_CLOUD_API_BASE || ""),
  },
  outfile: "dist-electron/main.js",
});

await build({
  entryPoints: ["electron/preload.cts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: "dist-electron/preload.cjs",
});

// Copy tray and window icons into dist-electron/icons
const iconsDistDir = "dist-electron/icons";
fs.mkdirSync(iconsDistDir, { recursive: true });

const filesToCopy = [
  ["build/icon.ico", "dist-electron/icons/icon.ico"],
  ["build/icon.png", "dist-electron/icons/icon.png"],
  ["build/icons.iconset/icon_16x16.png", "dist-electron/icons/icon_16x16.png"],
  ["build/icons.iconset/icon_16x16@2x.png", "dist-electron/icons/icon_16x16@2x.png"],
  ["build/icons.iconset/icon_32x32.png", "dist-electron/icons/icon_32x32.png"],
];

for (const [src, dest] of filesToCopy) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

console.log("[electron] main + preload bundled and icons copied");
