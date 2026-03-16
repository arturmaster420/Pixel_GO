// Fix executable permissions for esbuild binaries after ZIP extraction on *nix.
// Safe no-op on Windows.

import fs from "fs";

const candidates = [
  "node_modules/@esbuild/linux-x64/bin/esbuild",
  "node_modules/@esbuild/linux-arm64/bin/esbuild",
  "node_modules/@esbuild/darwin-x64/bin/esbuild",
  "node_modules/@esbuild/darwin-arm64/bin/esbuild",
  "node_modules/@esbuild/win32-x64/esbuild.exe",
  "node_modules/esbuild/bin/esbuild",
];

for (const p of candidates) {
  try {
    if (!fs.existsSync(p)) continue;
    // On Windows chmod has no effect; this won't throw in most cases.
    fs.chmodSync(p, 0o755);
  } catch {
    // ignore
  }
}
