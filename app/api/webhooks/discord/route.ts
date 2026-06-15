import { getChatBot } from "@/lib/discord/bot";

/** Cursor Cloud can take minutes; match /api/chat. */
export const maxDuration = 300;

function normalizeGatewayWebhookBody(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      type?: string;
      data?: Record<string, unknown>;
    };
    if (
      typeof parsed.type === "string" &&
      parsed.type.startsWith("GATEWAY_") &&
      parsed.data &&
      typeof parsed.data === "object"
    ) {
      parsed.data.attachments ??= [];
      parsed.data.mentions ??= [];
      parsed.data.mention_roles ??= [];
      return JSON.stringify(parsed);
    }
  } catch {
    /* keep original body */
  }
  return rawBody;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const normalizedBody = normalizeGatewayWebhookBody(rawBody);

  // #region agent log
  let eventType = "unknown";
  let mentionIds: string[] = [];
  let authorId = "";
  let guildId: string | null = null;
  try {
    const peek = JSON.parse(normalizedBody) as {
      type?: string;
      data?: {
        mentions?: Array<{ id?: string }>;
        author?: { id?: string };
        guild_id?: string;
      };
    };
    eventType = String(peek?.type ?? "no-type");
    const d = peek?.data;
    if (d && typeof d === "object") {
      mentionIds = Array.isArray(d.mentions)
        ? d.mentions.map((m) => String(m?.id ?? "")).filter(Boolean)
        : [];
      authorId = String(d.author?.id ?? "");
      guildId = d.guild_id != null ? String(d.guild_id) : null;
    }
  } catch {
    /* ignore parse errors */
  }
  fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
    body: JSON.stringify({
      sessionId: "e57cf4",
      runId: "post-fix",
      hypothesisId: "H1",
      location: "app/api/webhooks/discord/route.ts:POST",
      message: "webhook received",
      data: { eventType, mentionIds, authorId, guildId },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const normalizedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: normalizedBody,
  });

  try {
    const bot = await getChatBot();
    const response = await bot.webhooks.discord(normalizedRequest);

    // #region agent log
    fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
      body: JSON.stringify({
        sessionId: "e57cf4",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "app/api/webhooks/discord/route.ts:POST",
        message: "webhook handled",
        data: { eventType, status: response.status },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return response;
  } catch (err) {
    console.error("[discord-webhook] unhandled error", {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
