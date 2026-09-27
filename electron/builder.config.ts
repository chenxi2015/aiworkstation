import type { Configuration } from "electron-builder";

// Prune better-sqlite3 prebuilds for non-target platforms inside extraResources.
// (.output is copied verbatim, so electron-builder's per-arch handling never sees it.)
const PREBUILD_VARIANTS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "linuxmusl-arm64",
  "linuxmusl-x64",
  "win32-arm64",
  "win32-x64",
];

// The config file is loaded once, before target resolution, so the target
// platform/arch is derived from electron-builder's CLI flags instead
// (defaults to the build machine's platform when no flag is given).
function resolveTarget(): { platform: string; arch?: string } {
  const argv = process.argv.slice(2);
  let platform: string | undefined;
  if (argv.includes("--win") || argv.includes("-w")) platform = "win32";
  else if (argv.includes("--mac") || argv.includes("-m") || argv.includes("-o")) platform = "darwin";
  else if (argv.includes("--linux") || argv.includes("-l")) platform = "linux";
  let arch: string | undefined;
  if (argv.includes("--arm64")) arch = "arm64";
  else if (argv.includes("--x64")) arch = "x64";
  else if (argv.includes("--ia32")) arch = "ia32";
  // no arch flag (or --universal): keep every arch of the target platform
  return { platform: platform ?? process.platform, arch };
}

function prebuildExcludes(): string[] {
  const { platform, arch } = resolveTarget();
  return PREBUILD_VARIANTS.filter((variant) => {
    if (!variant.startsWith(platform)) return true;
    // linux has both glibc and musl variants with no way to distinguish here — keep both
    if (platform === "linux") return false;
    return arch !== undefined && !variant.endsWith(arch);
  }).map((v) => `!**/prebuilds/${v}.node`);
}

const config: Configuration = {
  appId: "com.aiworkstation.app",
  productName: "AI Workstation",
  copyright: "Copyright © 2024",
  compression: "maximum",
  // better-sqlite3 ships N-API prebuilds (v12+), so no per-arch native rebuild is
  // needed — this also unblocks cross-building Windows packages on macOS, where
  // node-gyp cannot compile from source.
  npmRebuild: false,

  // ── Source ─────────────────────────────────────────────────────────────────
  // Only compiled Electron main/preload belongs in "files" (= app/)
  // The Nitro server bundle goes into extraResources (= Resources/.output/)
  // so electron-builder never scans it as a pnpm workspace package,
  // which was the root cause of the ENOENT: nitro.json not found error.
  // "!**/node_modules/**" stops electron-builder from auto-collecting the whole
  // pnpm dependency tree into app.asar — the main/preload code only uses the
  // `electron` builtin, all runtime deps live inside the Nitro bundle (.output).
  files: [
    "dist-electron/**/*",
    "package.json",
    "!**/node_modules/**",
  ],
  extraResources: [
    {
      from: ".output",
      to: ".output",
      filter: [
        "**/*",
        ...prebuildExcludes(),
        // sharp is only used by @turbodocx/html-to-docx to rasterize SVG images
        // during docx export, and it degrades gracefully (native SVG embed +
        // console warning) when absent — drop it to save ~17 MB.
        "!**/node_modules/sharp/**",
        "!**/node_modules/@img/**",
      ],
    },
  ],

  // ── macOS ─────────────────────────────────────────────────────────────────
  mac: {
    target: [
      // arm64 only on Apple Silicon; add x64 via CI for universal builds
      { target: "dmg", arch: ["arm64"] },
    ],
    icon: "build/icon.icns",
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // Sign with your Apple Developer ID when distributing publicly:
    // identity: "Developer ID Application: Your Name (XXXXXXXXXX)",
  },
  dmg: {
    title: "AI Workstation",
    // Space-free artifact names: electron-updater resolves downloads via the
    // names recorded in latest.yml — any uploader-side renaming (e.g. spaces
    // turned into dots by action-gh-release) would break auto-update with 404s.
    artifactName: "AI-Workstation-${version}-${arch}.${ext}",
    contents: [
      { x: 410, y: 150, type: "link", path: "/Applications" },
      { x: 130, y: 150, type: "file" },
    ],
  },

  // ── Windows ───────────────────────────────────────────────────────────────
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
    ],
    icon: "build/icon.png",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    artifactName: "AI-Workstation-Setup-${version}.${ext}",
  },

  // ── Linux ─────────────────────────────────────────────────────────────────
  linux: {
    target: ["AppImage", "deb"],
    category: "Utility",
  },

  // ── Auto Update ───────────────────────────────────────────────────────────
  // electron-updater reads the generated app-update.yml and checks GitHub Releases.
  // Publishing requires a GH_TOKEN env var with repo access.
  publish: {
    provider: "github",
    owner: "chenxi2015",
    repo: "aiworkstation",
    releaseType: "release",
  },
};

export default config;
