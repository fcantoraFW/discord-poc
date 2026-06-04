import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveAssistantForDiscordThread(options: {
  profileId: string;
  discordThreadKey: string;
  guildDefaultAssistantId: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("conversations")
    .select("assistant_id")
    .eq("profile_id", options.profileId)
    .eq("discord_thread_key", options.discordThreadKey)
    .maybeSingle();

  if (conversation?.assistant_id) {
    return conversation.assistant_id;
  }
  return options.guildDefaultAssistantId;
}

export async function setThreadAssistant(options: {
  profileId: string;
  discordThreadKey: string;
  assistantId: string;
  source: "discord";
}): Promise<{ assistantName: string }> {
  const admin = createAdminClient();

  const { data: assistant } = await admin
    .from("assistants")
    .select("id, name, organization_id")
    .eq("id", options.assistantId)
    .single();

  if (!assistant) throw new Error("Asistente no encontrado");

  const { data: existing } = await admin
    .from("conversations")
    .select("id, assistant_id")
    .eq("profile_id", options.profileId)
    .eq("discord_thread_key", options.discordThreadKey)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("conversations")
      .update({
        assistant_id: options.assistantId,
        cursor_agent_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("conversations").insert({
      profile_id: options.profileId,
      assistant_id: options.assistantId,
      source: options.source,
      discord_thread_key: options.discordThreadKey,
      cursor_agent_id: null,
    });
    if (error) throw new Error(error.message);
  }

  return { assistantName: assistant.name };
}

export async function listOrgAssistants(organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("assistants")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
}
