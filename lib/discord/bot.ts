import type { Chat } from "chat";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getGuildLink,
  getProfileByDiscordUserId,
  processChatMessage,
  UNAUTHORIZED_DISCORD_MESSAGE,
  UNLINKED_GUILD_MESSAGE,
} from "@/lib/chat/pipeline";
import type { Profile } from "@/lib/types/database";

const REJECT_MESSAGE = UNAUTHORIZED_DISCORD_MESSAGE;

async function resolveDmContext(discordUserId: string): Promise<{
  profile: Profile;
  assistantId: string;
} | { error: string }> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("*")
    .eq("discord_user_id", discordUserId);

  if (!profiles?.length) {
    return { error: REJECT_MESSAGE };
  }
  if (profiles.length > 1) {
    return {
      error:
        "Tenés varias organizaciones. Usá @mention en el servidor de Discord de tu org.",
    };
  }

  const profile = profiles[0] as Profile;
  if (!profile.organization_id) {
    return { error: REJECT_MESSAGE };
  }

  const { data: assistant } = await admin
    .from("assistants")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!assistant) {
    return { error: "Tu organización no tiene asistentes configurados." };
  }

  return { profile, assistantId: assistant.id };
}

function registerHandlers(bot: Chat) {
  async function handleInbound(
    thread: {
      subscribe: () => Promise<void>;
      post: (content: string) => Promise<unknown>;
      id: string;
    },
    message: { author: { userId: string }; text: string },
    guildId: string | null,
  ) {
    let profile: Profile;
    let assistantId: string;

    if (!guildId) {
      const dm = await resolveDmContext(message.author.userId);
      if ("error" in dm) {
        await thread.post(dm.error);
        return;
      }
      profile = dm.profile;
      assistantId = dm.assistantId;
    } else {
      const link = await getGuildLink(guildId);
      if (!link) {
        await thread.post(UNLINKED_GUILD_MESSAGE);
        return;
      }

      const member = await getProfileByDiscordUserId(
        message.author.userId,
        link.organization_id,
      );
      if (!member) {
        await thread.post(REJECT_MESSAGE);
        return;
      }
      profile = member;
      assistantId = link.default_assistant_id;
    }

    await thread.subscribe();

    try {
      const result = await processChatMessage({
        profile,
        assistantId,
        userMessage: message.text,
        source: "discord",
        discordThreadKey: thread.id,
      });
      await thread.post(result.assistantText);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al procesar el mensaje.";
      await thread.post(`⚠️ ${msg}`);
    }
  }

  bot.onNewMention(async (thread, message) => {
    const raw = message.raw as { guild_id?: string };
    await handleInbound(thread, message, raw.guild_id ?? null);
  });

  bot.onDirectMessage(async (thread, message) => {
    await handleInbound(thread, message, null);
  });
}

declare global {
  var __flywheelChatBot: Chat | undefined;
}

export async function getChatBot(): Promise<Chat> {
  if (!globalThis.__flywheelChatBot) {
    const { Chat } = await import("chat");
    const { createDiscordAdapter } = await import("@chat-adapter/discord");
    const { createMemoryState } = await import("@chat-adapter/state-memory");
    const { createRedisState } = await import("@chat-adapter/state-redis");

    const redisUrl = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
    const state = redisUrl
      ? createRedisState({ url: redisUrl })
      : createMemoryState();

    const bot = new Chat({
      userName: process.env.DISCORD_BOT_USERNAME ?? "flywheel",
      adapters: {
        discord: createDiscordAdapter(),
      },
      state,
      dedupeTtlMs: 600_000,
    });
    registerHandlers(bot);
    globalThis.__flywheelChatBot = bot;
  }
  return globalThis.__flywheelChatBot;
}
