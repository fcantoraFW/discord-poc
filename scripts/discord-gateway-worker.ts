import { runDiscordGatewayWorker } from "../lib/discord/gateway-worker";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function validateGatewayEnv(): void {
  requireEnv("NEXT_PUBLIC_APP_URL");
  requireEnv("DISCORD_BOT_TOKEN");
  requireEnv("DISCORD_PUBLIC_KEY");
  requireEnv("DISCORD_APPLICATION_ID");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be your Vercel URL in production (not localhost)",
    );
  }
}

const RESTART_MS = 5_000;

async function loop(): Promise<never> {
  validateGatewayEnv();
  console.log("[discord-gateway] worker started");

  while (true) {
    try {
      await runDiscordGatewayWorker();
      console.log(`[discord-gateway] session ended, restart in ${RESTART_MS / 1000}s`);
    } catch (err) {
      console.error("[discord-gateway] error:", err);
      console.log(`[discord-gateway] restart in ${RESTART_MS / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, RESTART_MS));
  }
}

loop().catch((err) => {
  console.error("[discord-gateway] fatal:", err);
  process.exit(1);
});
