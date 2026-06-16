const DISCORD_API = "https://discord.com/api/v10";

export const INTERACTION_MESSAGE_COMPONENT = 3;
export const INTERACTION_MODAL_SUBMIT = 5;
export const INTERACTION_APPLICATION_COMMAND = 2;

export const RESPONSE_MODAL = 9;
export const RESPONSE_DEFERRED_CHANNEL_MESSAGE = 5;
export const RESPONSE_DEFERRED_UPDATE_MESSAGE = 6;

export type DiscordInteractionPayload = {
  id: string;
  token: string;
  type: number;
  data?: {
    custom_id?: string;
    components?: Array<{
      type: number;
      components?: Array<{ type: number; custom_id: string; value?: string }>;
    }>;
    name?: string;
  };
  channel_id?: string;
  guild_id?: string;
  member?: { user?: { id: string; username: string; global_name?: string } };
  user?: { id: string; username: string; global_name?: string };
  message?: { id: string };
};

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return token;
}

function applicationId(): string {
  const id = process.env.DISCORD_APPLICATION_ID;
  if (!id) throw new Error("DISCORD_APPLICATION_ID is not set");
  return id;
}

export function getInteractionUserId(interaction: DiscordInteractionPayload): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null;
}

export async function respondToInteractionCallback(
  interaction: Pick<DiscordInteractionPayload, "id" | "token">,
  body: unknown,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API}/interactions/${interaction.id}/${interaction.token}/callback`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Interaction callback failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function deferInteraction(
  interaction: Pick<DiscordInteractionPayload, "id" | "token">,
  ephemeral = false,
): Promise<void> {
  await respondToInteractionCallback(interaction, {
    type: RESPONSE_DEFERRED_CHANNEL_MESSAGE,
    data: ephemeral ? { flags: 64 } : undefined,
  });
}

export async function sendInteractionFollowup(
  interactionToken: string,
  payload: {
    content?: string;
    components?: unknown[];
    embeds?: unknown[];
  },
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId()}/${interactionToken}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Interaction followup failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

export function parseModalFieldValues(
  interaction: DiscordInteractionPayload,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components ?? []) {
      if (field.custom_id && field.value != null) {
        out[field.custom_id] = field.value;
      }
    }
  }
  return out;
}

export function parseDirectDiscordInteraction(rawBody: string): DiscordInteractionPayload | null {
  try {
    const parsed = JSON.parse(rawBody) as DiscordInteractionPayload;
    if (parsed.id && parsed.token && typeof parsed.type === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isWellbeingInteraction(interaction: DiscordInteractionPayload): boolean {
  if (interaction.type === INTERACTION_MODAL_SUBMIT) {
    return interaction.data?.custom_id?.startsWith("wellbeing:modal:") ?? false;
  }
  if (interaction.type === INTERACTION_MESSAGE_COMPONENT) {
    const id = interaction.data?.custom_id ?? "";
    return id.startsWith("wellbeing:");
  }
  if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
    return interaction.data?.name === "encuesta";
  }
  return false;
}
