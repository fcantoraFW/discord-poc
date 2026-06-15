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
  // #region agent log
  fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
    body: JSON.stringify({
      sessionId: "e57cf4",
      runId: "pre-fix",
      hypothesisId: "H5",
      location: "lib/discord/gateway-worker.ts:runDiscordGatewayWorker",
      message: "gateway webhook target",
      data: { webhookUrl, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
