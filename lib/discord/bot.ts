import type { Chat } from "chat";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getGuildLink,
  getProfileByDiscordUserId,
  processChatMessage,
  UNAUTHORIZED_DISCORD_MESSAGE,
  UNLINKED_GUILD_MESSAGE,
} from "@/lib/chat/pipeline";
import {
  listOrgAssistants,
  resolveAssistantForDiscordThread,
  setThreadAssistant,
} from "@/lib/discord/thread-assistant";
import type { Profile } from "@/lib/types/database";

const REJECT_MESSAGE = UNAUTHORIZED_DISCORD_MESSAGE;

async function resolveOrgMember(
  discordUserId: string,
  organizationId: string,
): Promise<Profile | null> {
  let member = await getProfileByDiscordUserId(discordUserId, organizationId);
  if (member) return member;

  const admin = createAdminClient();
  const { data: superProfile } = await admin
    .from("profiles")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .eq("role", "superadmin")
    .maybeSingle();
  return (superProfile as Profile | null) ?? null;
}

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

  const assistants = await listOrgAssistants(profile.organization_id);
  if (!assistants.length) {
    return { error: "Tu organización no tiene asistentes configurados." };
  }

  return { profile, assistantId: assistants[0]!.id };
}

function registerHandlers(bot: Chat) {
  bot.onSlashCommand("/asistente", async (event) => {
    const guildId = (event.raw as { guild_id?: string })?.guild_id ?? null;
    if (!guildId) {
      await event.channel.post(
        "Usá /asistente en un servidor vinculado a tu organización.",
      );
      return;
    }

    const link = await getGuildLink(guildId);
    if (!link) {
      await event.channel.post(UNLINKED_GUILD_MESSAGE);
      return;
    }

    const profile = await resolveOrgMember(event.user.userId, link.organization_id);
    if (!profile) {
      await event.channel.post(REJECT_MESSAGE);
      return;
    }

    const assistantId = String(event.text ?? "").trim();
    if (!assistantId || assistantId === "__none__") {
      const names = (await listOrgAssistants(link.organization_id))
        .map((a) => a.name)
        .join(", ");
      await event.channel.post(
        names
          ? `Elegí un asistente con /asistente. Disponibles: ${names}`
          : "No hay asistentes en esta organización.",
      );
      return;
    }

    const assistants = await listOrgAssistants(link.organization_id);
    if (!assistants.some((a) => a.id === assistantId)) {
      await event.channel.post("Ese asistente no pertenece a esta organización.");
      return;
    }

    try {
      const { assistantName } = await setThreadAssistant({
        profileId: profile.id,
        discordThreadKey: event.channel.id,
        assistantId,
        source: "discord",
      });
      await event.channel.post(
        `Asistente activo en este hilo: **${assistantName}**. Nueva sesión con el agente.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      await event.channel.post(`⚠️ ${msg}`);
    }
  });

  async function handleInbound(
    thread: {
      subscribe: () => Promise<void>;
      post: (content: string) => Promise<unknown>;
      id: string;
    },
    message: { author: { userId: string }; text: string },
    guildId: string | null,
    trigger: "mention" | "dm",
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
      assistantId = await resolveAssistantForDiscordThread({
        profileId: profile.id,
        discordThreadKey: thread.id,
        guildDefaultAssistantId: dm.assistantId,
      });
    } else {
      const link = await getGuildLink(guildId);
      // #region agent log
      fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
        body: JSON.stringify({
          sessionId: "e57cf4",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "lib/discord/bot.ts:handleInbound",
          message: "guild context resolved",
          data: {
            trigger,
            guildId,
            discordUserId: message.author.userId,
            hasGuildLink: Boolean(link),
            orgId: link?.organization_id ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!link) {
        await thread.post(UNLINKED_GUILD_MESSAGE);
        return;
      }

      const member = await resolveOrgMember(message.author.userId, link.organization_id);
      // #region agent log
      fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
        body: JSON.stringify({
          sessionId: "e57cf4",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "lib/discord/bot.ts:handleInbound",
          message: "member lookup",
          data: {
            trigger,
            guildId,
            discordUserId: message.author.userId,
            memberFound: Boolean(member),
            memberRole: member?.role ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!member) {
        await thread.post(REJECT_MESSAGE);
        return;
      }
      profile = member;
      assistantId = await resolveAssistantForDiscordThread({
        profileId: profile.id,
        discordThreadKey: thread.id,
        guildDefaultAssistantId: link.default_assistant_id,
      });
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
      // #region agent log
      fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
        body: JSON.stringify({
          sessionId: "e57cf4",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "lib/discord/bot.ts:handleInbound",
          message: "processChatMessage ok",
          data: {
            trigger,
            textLen: result.assistantText.length,
            conversationId: result.conversationId,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      await thread.post(result.assistantText);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al procesar el mensaje.";
      // #region agent log
      fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
        body: JSON.stringify({
          sessionId: "e57cf4",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "lib/discord/bot.ts:handleInbound",
          message: "processChatMessage error",
          data: { trigger, error: msg },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      await thread.post(`⚠️ ${msg}`);
    }
  }

  bot.onNewMention(async (thread, message) => {
    const raw = message.raw as { guild_id?: string };
    // #region agent log
    fetch("http://127.0.0.1:7825/ingest/1ba82d13-52ea-424b-9589-47653a290749", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e57cf4" },
      body: JSON.stringify({
        sessionId: "e57cf4",
        runId: "post-fix",
        hypothesisId: "H2",
        location: "lib/discord/bot.ts:onNewMention",
        message: "mention handler fired",
        data: {
          threadId: thread.id,
          guildId: raw.guild_id ?? null,
          authorId: message.author.userId,
          textPreview: message.text.slice(0, 80),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      await handleInbound(thread, message, raw.guild_id ?? null, "mention");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      console.error("[discord-bot] onNewMention failed", { error: msg });
      await thread.post(`⚠️ ${msg}`);
    }
  });

  bot.onDirectMessage(async (thread, message) => {
    try {
      await handleInbound(thread, message, null, "dm");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      console.error("[discord-bot] onDirectMessage failed", { error: msg });
      await thread.post(`⚠️ ${msg}`);
    }
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
