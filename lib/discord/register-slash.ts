import { getDiscordClientId } from "@/lib/discord/oauth";
import { listOrgAssistants } from "@/lib/discord/thread-assistant";

const DISCORD_API = "https://discord.com/api/v10";

function botAuthHeader(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  return `Bot ${token}`;
}

/** Register /asistente slash command for a guild with org assistant choices. */
export async function registerGuildSlashCommands(
  guildId: string,
  organizationId: string,
): Promise<void> {
  const applicationId = process.env.DISCORD_APPLICATION_ID ?? getDiscordClientId();
  const assistants = await listOrgAssistants(organizationId);

  const choices = assistants.slice(0, 25).map((a) => ({
    name: a.name.slice(0, 100),
    value: a.id,
  }));

  const body = [
    {
      name: "asistente",
      description: "Elegir asistente activo en este hilo",
      options: [
        {
          type: 3,
          name: "nombre",
          description: "Asistente de tu organización",
          required: true,
          choices: choices.length
            ? choices
            : [{ name: "(ninguno)", value: "__none__" }],
        },
      ],
    },
  ];

  const res = await fetch(
    `${DISCORD_API}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: botAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord slash register failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

/** Refresh slash commands for every guild linked to an organization. */
export async function refreshSlashCommandsForOrg(organizationId: string): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("discord_guild_links")
    .select("guild_id")
    .eq("organization_id", organizationId);

  for (const link of links ?? []) {
    await registerGuildSlashCommands(link.guild_id, organizationId);
  }
}
