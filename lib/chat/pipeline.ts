import { collectAgentResponse } from "@/lib/cursor/agent";
import { buildPromptPrefix, type AssistantPromptContext } from "@/lib/cursor/prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationSource, Profile } from "@/lib/types/database";

export const UNAUTHORIZED_DISCORD_MESSAGE =
  "No estás registrado en esta organización. Conectá tu cuenta de Discord en la app web.";
export const UNLINKED_GUILD_MESSAGE =
  "Este servidor de Discord no está vinculado a ninguna organización.";

export type AssistantBundle = {
  assistantId: string;
  assistantName: string;
  instructions: string;
  context: string;
  orgId: string;
  orgName: string;
};

export async function loadAssistantBundle(
  assistantId: string,
): Promise<AssistantBundle | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("assistants")
    .select("id, name, instructions, context, organization_id")
    .eq("id", assistantId)
    .single();

  if (!data) return null;

  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", data.organization_id)
    .single();

  if (!org) return null;

  return {
    assistantId: data.id,
    assistantName: data.name,
    instructions: data.instructions,
    context: data.context,
    orgId: org.id,
    orgName: org.name,
  };
}

export async function getProfileByDiscordUserId(
  discordUserId: string,
  organizationId: string,
): Promise<Profile | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function getGuildLink(guildId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("discord_guild_links")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();
  return data;
}

export async function getOrCreateConversation(options: {
  profileId: string;
  assistantId: string;
  source: ConversationSource;
  discordThreadKey?: string | null;
  conversationId?: string;
}) {
  const admin = createAdminClient();

  if (options.conversationId) {
    const { data } = await admin
      .from("conversations")
      .select("*")
      .eq("id", options.conversationId)
      .eq("profile_id", options.profileId)
      .single();
    if (data) return data;
  }

  if (options.discordThreadKey) {
    const { data: existing } = await admin
      .from("conversations")
      .select("*")
      .eq("profile_id", options.profileId)
      .eq("discord_thread_key", options.discordThreadKey)
      .maybeSingle();
    if (existing) {
      if (existing.assistant_id !== options.assistantId) {
        const { data: updated, error: updateError } = await admin
          .from("conversations")
          .update({
            assistant_id: options.assistantId,
            cursor_agent_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (updateError || !updated) {
          throw new Error(updateError?.message ?? "Failed to update conversation");
        }
        return updated;
      }
      return existing;
    }
  }

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      profile_id: options.profileId,
      assistant_id: options.assistantId,
      source: options.source,
      discord_thread_key: options.discordThreadKey ?? null,
    })
    .select("*")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Failed to create conversation");
  return created;
}

export async function processChatMessage(options: {
  profile: Profile;
  assistantId: string;
  userMessage: string;
  source: ConversationSource;
  conversationId?: string;
  discordThreadKey?: string | null;
}): Promise<{
  conversationId: string;
  assistantText: string;
  cursorAgentId: string;
}> {
  const bundle = await loadAssistantBundle(options.assistantId);
  if (!bundle) throw new Error("Assistant not found");

  if (
    options.profile.role !== "superadmin" &&
    options.profile.organization_id !== bundle.orgId
  ) {
    throw new Error("Forbidden");
  }

  const conversation = await getOrCreateConversation({
    profileId: options.profile.id,
    assistantId: options.assistantId,
    source: options.source,
    conversationId: options.conversationId,
    discordThreadKey: options.discordThreadKey,
  });

  const admin = createAdminClient();
  await admin.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: options.userMessage,
  });

  const promptContext: AssistantPromptContext = {
    orgName: bundle.orgName,
    assistantName: bundle.assistantName,
    instructions: bundle.instructions,
    context: bundle.context,
  };

  const { agentId, text } = await collectAgentResponse({
    cursorAgentId: conversation.cursor_agent_id,
    promptContext,
    userMessage: options.userMessage,
  });

  await admin.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: text,
  });

  await admin
    .from("conversations")
    .update({
      cursor_agent_id: agentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  return {
    conversationId: conversation.id,
    assistantText: text,
    cursorAgentId: agentId,
  };
}

export { buildPromptPrefix };
