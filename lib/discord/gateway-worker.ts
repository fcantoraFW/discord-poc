import type { DiscordAdapter } from "@chat-adapter/discord";
import { getChatBot } from "./bot";
import { getAppUrl } from "./oauth";

/**
 * Long-lived Gateway process (run outside Vercel Hobby).
 * Forwards Discord events to the app webhook on Vercel.
 */
export async function runDiscordGatewayWorker(): Promise<void> {
  const webhookUrl = `${getAppUrl()}/api/webhooks/discord`;
  const durationMs = Number(process.env.GATEWAY_LISTENER_MS ?? 86_400_000);

  const bot = await getChatBot();
  await bot.initialize();
  const discord = bot.getAdapter("discord") as DiscordAdapter;

  console.log(`[discord-gateway] listening ${durationMs / 1000}s → ${webhookUrl}`);

  let listenerDone!: Promise<void>;
  await discord.startGatewayListener(
    { waitUntil: (task) => {
      listenerDone = task as Promise<void>;
    } },
    durationMs,
    undefined,
    webhookUrl,
  );

  await listenerDone;
}
