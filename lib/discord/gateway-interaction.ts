import type { WebhookOptions } from "chat";
import {
  applyWellbeingRouteResult,
  routeWellbeingInteraction,
} from "@/lib/wellbeing/interactions";
import {
  parseDirectDiscordInteraction,
  type DiscordInteractionPayload,
} from "@/lib/wellbeing/discord-api";

type GatewayInteraction = DiscordInteractionPayload & {
  [key: string]: unknown;
};

/**
 * Gateway worker forwards INTERACTION_CREATE as GATEWAY_INTERACTION_CREATE.
 * Wellbeing modal flows must respond before defer; other interactions defer first.
 */
export async function handleForwardedGatewayInteraction(
  interaction: GatewayInteraction,
  options?: WebhookOptions,
): Promise<void> {
  const wellbeingResult = await routeWellbeingInteraction(interaction, options);
  if (wellbeingResult.kind !== "none") {
    await applyWellbeingRouteResult(interaction, wellbeingResult, options);
    return;
  }

  const { deferGatewayInteraction } = await import("@/lib/discord/gateway-interaction-defer");
  await deferGatewayInteraction(interaction);

  const { getChatBot } = await import("@/lib/discord/bot");
  const bot = await getChatBot();
  await bot.initialize();
  const discord = bot.getAdapter("discord") as unknown as {
    handleComponentInteraction: (i: GatewayInteraction, o?: WebhookOptions) => void;
    handleApplicationCommandInteraction: (i: GatewayInteraction, o?: WebhookOptions) => void;
  } | undefined;
  if (!discord) {
    throw new Error("Discord adapter not configured");
  }

  if (interaction.type === 3) {
    discord.handleComponentInteraction(interaction, options);
    return;
  }

  if (interaction.type === 2) {
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

export { parseDirectDiscordInteraction };
