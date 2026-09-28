// Bundle the Electron main/preload processes.
// electron-updater is CJS and its dep chain (fs-extra, graceful-fs) calls
// require("fs") — esbuild's ESM output has no `require`, which crashes at
// startup with "Dynamic require of 'fs' is not supported". The createRequire
// banner restores it.
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

console.log("[electron] main + preload bundled");
