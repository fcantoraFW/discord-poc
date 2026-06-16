import { after } from "next/server";
import { getChatBot } from "@/lib/discord/bot";
import {
  handleForwardedGatewayInteraction,
  parseGatewayInteractionEvent,
} from "@/lib/discord/gateway-interaction";

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

const webhookOptions = {
  waitUntil: (task: Promise<unknown>) => {
    after(() => task);
  },
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const gatewayToken = request.headers.get("x-discord-gateway-token");

  if (gatewayToken) {
    const interaction = parseGatewayInteractionEvent(rawBody);
    if (interaction) {
      try {
        await handleForwardedGatewayInteraction(interaction, webhookOptions);
        return Response.json({ ok: true });
      } catch (err) {
        console.error("[discord-webhook] gateway interaction failed", {
          error: err instanceof Error ? err.message : String(err),
          interactionId: interaction.id,
          interactionType: interaction.type,
        });
        return Response.json({ error: "gateway interaction failed" }, { status: 500 });
      }
    }
  }

  const normalizedBody = normalizeGatewayWebhookBody(rawBody);

  const normalizedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: normalizedBody,
  });

  try {
    const bot = await getChatBot();
    return bot.webhooks.discord(normalizedRequest, webhookOptions);
  } catch (err) {
    console.error("[discord-webhook] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
