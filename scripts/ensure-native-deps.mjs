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

function hasSqliteBinding(sqliteDir) {
  const candidates = [
    join(sqliteDir, "build", "Release", "node_sqlite3.node"),
    join(sqliteDir, "lib", "binding", "node-v137-darwin-arm64", "node_sqlite3.node"),
  ];
  return candidates.some(existsSync);
}

function buildSqlite3() {
  const dir = findPnpmPackageDir("sqlite3");
  if (!dir) {
    console.warn("[ensure-native-deps] sqlite3 not found in node_modules/.pnpm — run pnpm install first");
    return false;
  }
  if (hasSqliteBinding(dir)) {
    console.log("[ensure-native-deps] sqlite3 binding already present");
    return true;
  }
  console.log("[ensure-native-deps] building sqlite3 at", dir);
  execSync("npm run install", { cwd: dir, stdio: "inherit" });
  return hasSqliteBinding(dir);
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

const sqliteOk = buildSqlite3();
const zlibOk = buildZlibSync();

if (!sqliteOk) {
  console.error("[ensure-native-deps] FAILED: sqlite3 is required for @cursor/sdk");
  process.exit(1);
}
if (!zlibOk) {
  console.warn("[ensure-native-deps] zlib-sync build failed — Discord may warn in dev");
}
console.log("[ensure-native-deps] done");
