import type { DiscordAdapter } from "@chat-adapter/discord";
import type { WebhookOptions } from "chat";

const DISCORD_API = "https://discord.com/api/v10";

/** discord-api-types InteractionType */
const MESSAGE_COMPONENT = 3;
const APPLICATION_COMMAND = 2;

/** discord-api-types InteractionResponseType */
const DEFERRED_UPDATE_MESSAGE = 6;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;

type GatewayInteraction = {
  id: string;
  token: string;
  type: number;
  [key: string]: unknown;
};

type DiscordAdapterWithHandlers = DiscordAdapter & {
  handleComponentInteraction: (
    interaction: GatewayInteraction,
    options?: WebhookOptions,
  ) => void;
  handleApplicationCommandInteraction: (
    interaction: GatewayInteraction,
    options?: WebhookOptions,
  ) => void;
};

/** Acknowledge a gateway-forwarded interaction before Discord's 3s timeout. */
export async function deferGatewayInteraction(interaction: GatewayInteraction): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  const deferType =
    interaction.type === MESSAGE_COMPONENT
      ? DEFERRED_UPDATE_MESSAGE
      : DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE;

  const res = await fetch(
    `${DISCORD_API}/interactions/${interaction.id}/${interaction.token}/callback`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: deferType }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord defer failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

/**
 * Gateway worker forwards INTERACTION_CREATE as GATEWAY_INTERACTION_CREATE, but the
 * Chat SDK adapter only handles messages/reactions in that path — not button/slash
 * interactions. Defer via REST, then run the adapter handlers.
 */
export async function handleForwardedGatewayInteraction(
  interaction: GatewayInteraction,
  options?: WebhookOptions,
): Promise<void> {
  await deferGatewayInteraction(interaction);

  const { getChatBot } = await import("@/lib/discord/bot");
  const bot = await getChatBot();
  await bot.initialize();
  const discord = bot.getAdapter("discord") as DiscordAdapterWithHandlers | undefined;
  if (!discord) {
    throw new Error("Discord adapter not configured");
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    discord.handleComponentInteraction(interaction, options);
    return;
  }

  if (interaction.type === APPLICATION_COMMAND) {
    discord.handleApplicationCommandInteraction(interaction, options);
    return;
  }

  console.warn("[discord-gateway-interaction] unsupported interaction type", {
    type: interaction.type,
  });
}

export function parseGatewayInteractionEvent(rawBody: string): GatewayInteraction | null {
  try {
    const parsed = JSON.parse(rawBody) as {
      type?: string;
      data?: GatewayInteraction;
    };
    if (parsed.type === "GATEWAY_INTERACTION_CREATE" && parsed.data?.id && parsed.data?.token) {
      return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return null;
}
