import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** pnpm nests optional deps under .pnpm/<name>@<ver>/node_modules/<name> */
function findPnpmPackageDir(packageName) {
  const pnpmDir = join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;

  const entry = readdirSync(pnpmDir).find((dir) => dir.startsWith(`${packageName}@`));
  if (!entry) return null;

  const dir = join(pnpmDir, entry, "node_modules", packageName);
  return existsSync(join(dir, "package.json")) ? dir : null;
}

function buildZlibSync() {
  const dir = findPnpmPackageDir("zlib-sync");
  if (!dir) {
    console.log("[ensure-native-deps] zlib-sync not installed (optional for Discord)");
    return true;
  }
  const binding = join(dir, "build", "Release", "zlib_sync.node");
  if (existsSync(binding)) {
    console.log("[ensure-native-deps] zlib-sync binding already present");
    return true;
  }
  if (!existsSync(join(dir, "binding.gyp"))) {
    console.log("[ensure-native-deps] zlib-sync has no binding.gyp — skipping");
    return true;
  }
  console.log("[ensure-native-deps] building zlib-sync at", dir);
  execSync("npx node-gyp rebuild", { cwd: dir, stdio: "inherit" });
  return existsSync(binding);
}

const zlibOk = buildZlibSync();

if (!zlibOk) {
  console.warn("[ensure-native-deps] zlib-sync build failed — Discord may warn in dev");
}
console.log("[ensure-native-deps] done");
