import type { Configuration } from "electron-builder";

const config: Configuration = {
  appId: "com.aiworkstation.app",
  productName: "AI Workstation",
  copyright: "Copyright © 2024",

  // ── Source ─────────────────────────────────────────────────────────────────
  // Only compiled Electron main/preload belongs in "files" (= app/)
  // The Nitro server bundle goes into extraResources (= Resources/.output/)
  // so electron-builder never scans it as a pnpm workspace package,
  // which was the root cause of the ENOENT: nitro.json not found error.
  files: [
    "dist-electron/**/*",
    "package.json",
  ],
  extraResources: [
    { from: ".output", to: ".output" },
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
  },

  // ── Linux ─────────────────────────────────────────────────────────────────
  linux: {
    target: ["AppImage", "deb"],
    category: "Utility",
  },

  // ── Auto Update ───────────────────────────────────────────────────────────
  // Uncomment and configure when publishing to GitHub Releases:
  // publish: {
  //   provider: "github",
  //   owner: "your-org",
  //   repo: "aiworkstation",
  // },
};

export default config;
