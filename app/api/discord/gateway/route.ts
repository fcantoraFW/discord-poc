import type { DiscordAdapter } from "@chat-adapter/discord";
import { after } from "next/server";
import { getChatBot } from "@/lib/discord/bot";
import { getAppUrl } from "@/lib/discord/oauth";

/** Hobby Vercel ≈ 10s. On Pro, change to 800 and GATEWAY_LISTENER_MS=600000. */
export const maxDuration = 10;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bot = await getChatBot();
  await bot.initialize();

  const discord = bot.getAdapter("discord") as DiscordAdapter;
  const webhookUrl = `${getAppUrl(request)}/api/webhooks/discord`;
  const durationMs = Number(process.env.GATEWAY_LISTENER_MS ?? 9_000);

  return discord.startGatewayListener(
    { waitUntil: (task) => after(() => task) },
    durationMs,
    undefined,
    webhookUrl,
  );
}
