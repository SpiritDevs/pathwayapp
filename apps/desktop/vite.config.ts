import { defineConfig } from "vite-plus";

import { loadRepoEnv } from "../../scripts/lib/public-config.ts";

const repoEnv = loadRepoEnv();
const shouldLaunchElectronAfterPack = process.env.PATHWAYOS_DESKTOP_DEV === "1";
const publicConfigDefine = {
  __PATHWAYOS_BUILD_CLERK_PUBLISHABLE_KEY__: JSON.stringify(
    repoEnv.PATHWAYOS_CLERK_PUBLISHABLE_KEY?.trim() ?? "",
  ),
};

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "bun scripts/build-preview-annotation-css.mjs && vp pack",
        dependsOn: ["pathwayos#build"],
        cache: false,
      },
      dev: {
        command:
          "bun scripts/build-preview-annotation-css.mjs && cross-env PATHWAYOS_DESKTOP_DEV=1 vp pack --watch",
        dependsOn: ["pathwayos#build"],
        cache: false,
      },
      "dev:bundle": {
        command: "bun scripts/build-preview-annotation-css.mjs && vp pack --watch",
        cache: false,
      },
      "dev:electron": {
        command: "bun scripts/dev-electron.mjs",
        dependsOn: ["pathwayos#build"],
        cache: false,
      },
    },
  },
  pack: [
    {
      format: "cjs",
      outDir: "dist-electron",
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      define: publicConfigDefine,
      entry: ["src/main.ts"],
      clean: true,
      deps: {
        alwaysBundle: (id) => id.startsWith("@pathwayos/"),
      },
      ...(shouldLaunchElectronAfterPack ? { onSuccess: "bun scripts/dev-electron.mjs" } : {}),
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      define: publicConfigDefine,
      entry: ["src/preload.ts"],
      deps: {
        // Sandboxed Electron preloads cannot reliably resolve package imports
        // from inside the packaged ASAR. Bundle Clerk's preload bridge into the
        // preload artifact instead of leaving a runtime require() behind.
        alwaysBundle: (id) => id === "@clerk/electron" || id.startsWith("@clerk/electron/"),
      },
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      entry: ["src/preview-pick-preload.ts"],
      deps: {
        alwaysBundle: (id) => id === "react-grab" || id.startsWith("react-grab/"),
      },
    },
  ],
});
