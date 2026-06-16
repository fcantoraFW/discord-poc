const DISCORD_API = "https://discord.com/api/v10";

/** discord-api-types InteractionType */
const MESSAGE_COMPONENT = 3;

/** discord-api-types InteractionResponseType */
const DEFERRED_UPDATE_MESSAGE = 6;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;

type GatewayInteraction = {
  id: string;
  token: string;
  type: number;
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
