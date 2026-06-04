/**
 * Quick sanity check before deploy. Usage:
 *   node scripts/check-production-env.mjs
 *   node scripts/check-production-env.mjs --target=gateway
 *   node scripts/check-production-env.mjs --target=vercel
 */

const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "all";

const vercel = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CURSOR_API_KEY",
  "CURSOR_CLOUD_REPO",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "DISCORD_PUBLIC_KEY",
  "REDIS_URL",
];

const gateway = [
  "NEXT_PUBLIC_APP_URL",
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_APPLICATION_ID",
];

const keys =
  target === "gateway" ? gateway : target === "vercel" ? vercel : [...new Set([...vercel, ...gateway])];

let ok = true;
for (const key of keys) {
  const val = process.env[key]?.trim();
  if (!val) {
    console.error(`✗ missing ${key}`);
    ok = false;
    continue;
  }
  if (key === "NEXT_PUBLIC_APP_URL" && /localhost|127\.0\.0\.1/.test(val)) {
    console.warn(`⚠ ${key} is localhost — use production URL on deploy`);
  }
  if (key === "NEXT_PUBLIC_SUPABASE_URL" && !val.startsWith("https://")) {
    console.error(`✗ ${key} must start with https://`);
    ok = false;
    continue;
  }
  console.log(`✓ ${key}`);
}

if (process.env.CURSOR_CLOUD_REF_MODE === "sha") {
  console.error("✗ remove CURSOR_CLOUD_REF_MODE=sha (use branch name main only)");
  ok = false;
}

process.exit(ok ? 0 : 1);
