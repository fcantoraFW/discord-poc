import type { Chat } from "chat";
import { getGuildLink, getProfileByDiscordUserId, UNAUTHORIZED_DISCORD_MESSAGE, UNLINKED_GUILD_MESSAGE } from "@/lib/chat/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, WellbeingPillar } from "@/lib/types/database";
import { WELLBEING_PILLARS } from "@/lib/wellbeing/template";
import {
  handleCommentSkip,
  handleCommentYes,
  handleConsentAccept,
  handleExtraRelationship,
  handleMoreEval,
  handlePersonRating,
  handlePillarRating,
  handleTextInput,
  startOrResumeSession,
} from "@/lib/wellbeing/flow";
import { isAwaitingText, type WellbeingStep } from "@/lib/wellbeing/fsm";
import {
  createSession,
  findInProgressSession,
  getActiveCampaign,
  getCampaignById,
  hasCampaignSubmission,
} from "@/lib/wellbeing/session-store";

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

async function resolveProfileContext(
  discordUserId: string,
  guildId: string | null,
): Promise<{ profile: Profile; organizationId: string } | { error: string }> {
  if (!guildId) {
    const admin = createAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("*")
      .eq("discord_user_id", discordUserId);

    if (!profiles?.length) return { error: REJECT_MESSAGE };
    if (profiles.length > 1) {
      return {
        error:
          "Tenés varias organizaciones. Usá /encuesta en el servidor de Discord de tu org.",
      };
    }
    const profile = profiles[0] as Profile;
    if (!profile.organization_id) return { error: REJECT_MESSAGE };
    return { profile, organizationId: profile.organization_id };
  }

  const link = await getGuildLink(guildId);
  if (!link) return { error: UNLINKED_GUILD_MESSAGE };

  const profile = await resolveOrgMember(discordUserId, link.organization_id);
  if (!profile) return { error: REJECT_MESSAGE };
  return { profile, organizationId: link.organization_id };
}

type SurveyThread = {
  id: string;
  subscribe: () => Promise<void>;
  post: (content: unknown) => Promise<unknown>;
};

async function beginSurvey(options: {
  thread: SurveyThread;
  profile: Profile;
  organizationId: string;
  source: "encuesta" | "campaign";
  campaignId?: string | null;
}) {
  const { thread, profile, organizationId, source, campaignId } = options;

  if (campaignId) {
    const already = await hasCampaignSubmission(profile.id, campaignId);
    if (already) {
      await thread.post("Ya completaste la encuesta de esta campaña. ¡Gracias!");
      return;
    }
  }

  const existing = await findInProgressSession(profile.id, thread.id);
  if (existing) {
    await thread.subscribe();
    await startOrResumeSession(thread, existing);
    return;
  }

  const session = await createSession({
    profileId: profile.id,
    organizationId,
    discordThreadKey: thread.id,
    source,
    campaignId: campaignId ?? null,
  });

  await thread.subscribe();
  await startOrResumeSession(thread, session);
}

function parsePillarRatingAction(actionId: string): { pillar: WellbeingPillar; rating: number } | null {
  for (const pillar of WELLBEING_PILLARS) {
    const prefix = `wellbeing:rate:${pillar}:`;
    if (actionId.startsWith(prefix)) {
      const rating = Number(actionId.slice(prefix.length));
      if (rating >= 1 && rating <= 5) return { pillar, rating };
    }
  }
  return null;
}

function parsePersonRatingAction(
  actionId: string,
): { relationship: "peer" | "leader"; rating: number } | null {
  for (const rel of ["peer", "leader"] as const) {
    const prefix = `wellbeing:person_rate:${rel}:`;
    if (actionId.startsWith(prefix)) {
      const rating = Number(actionId.slice(prefix.length));
      if (rating >= 1 && rating <= 5) return { relationship: rel, rating };
    }
  }
  return null;
}

export function registerWellbeingHandlers(bot: Chat) {
  bot.onSlashCommand("/encuesta", async (event) => {
    const guildId = (event.raw as { guild_id?: string })?.guild_id ?? null;
    const ctx = await resolveProfileContext(event.user.userId, guildId);
    if ("error" in ctx) {
      await event.channel.post(ctx.error);
      return;
    }

    const activeCampaign = await getActiveCampaign(ctx.organizationId);
    const thread = bot.thread(event.channel.id);
    await beginSurvey({
      thread,
      profile: ctx.profile,
      organizationId: ctx.organizationId,
      source: "encuesta",
      campaignId: activeCampaign?.id ?? null,
    });
  });

  bot.onAction(async (event) => {
    if (!event.actionId.startsWith("wellbeing:")) return;

    const actionId = event.actionId;
    const thread = event.thread ?? bot.thread(event.threadId);

    try {
      const guildId = (event.raw as { guild_id?: string })?.guild_id ?? null;
      const ctx = await resolveProfileContext(event.user.userId, guildId);
      if ("error" in ctx) {
        await thread.post(ctx.error);
        return;
      }

      const campaignMatch = actionId.match(/^wellbeing:campaign:start:(.+)$/);
      if (campaignMatch) {
        const campaignId = campaignMatch[1]!;
        const campaign = await getCampaignById(campaignId);
        if (!campaign || campaign.organization_id !== ctx.organizationId) {
          await thread.post("Esta campaña ya no está disponible.");
          return;
        }
        if (campaign.status !== "active") {
          await thread.post("Esta campaña ya finalizó.");
          return;
        }

        await beginSurvey({
          thread,
          profile: ctx.profile,
          organizationId: ctx.organizationId,
          source: "campaign",
          campaignId,
        });
        return;
      }

      const session = await findInProgressSession(ctx.profile.id, thread.id);
      if (!session) {
        await thread.post(
          "No hay una encuesta activa. Abrí la encuesta desde el botón del mensaje de campaña o usá `/encuesta`.",
        );
        return;
      }

      if (actionId === "wellbeing:consent:accept") {
        await handleConsentAccept(session, thread);
        return;
      }

      if (actionId === "wellbeing:comment:yes") {
        await handleCommentYes(session, thread);
        return;
      }

      if (actionId === "wellbeing:comment:skip") {
        await handleCommentSkip(session, thread);
        return;
      }

      if (actionId === "wellbeing:more_eval:yes") {
        await handleMoreEval(session, thread, true);
        return;
      }

      if (actionId === "wellbeing:more_eval:no") {
        await handleMoreEval(session, thread, false);
        return;
      }

      if (actionId === "wellbeing:relationship:peer") {
        await handleExtraRelationship(session, thread, "peer");
        return;
      }

      if (actionId === "wellbeing:relationship:leader") {
        await handleExtraRelationship(session, thread, "leader");
        return;
      }

      const pillarRating = parsePillarRatingAction(actionId);
      if (pillarRating) {
        await handlePillarRating(session, thread, pillarRating.pillar, pillarRating.rating);
        return;
      }

      const personRating = parsePersonRatingAction(actionId);
      if (personRating) {
        await handlePersonRating(
          session,
          thread,
          personRating.relationship,
          personRating.rating,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al procesar la encuesta";
      console.error("[wellbeing] onAction failed", { actionId, error: msg });
      await thread.post(`⚠️ ${msg}`);
    }
  });

  bot.onSubscribedMessage(async (thread, message) => {
    const guildId = (message.raw as { guild_id?: string })?.guild_id ?? null;
    const ctx = await resolveProfileContext(message.author.userId, guildId);
    if ("error" in ctx) return;

    const session = await findInProgressSession(ctx.profile.id, thread.id);
    if (!session) return;

    const step = session.current_step as WellbeingStep;
    if (!isAwaitingText(step)) {
      await thread.post("Usá los botones del mensaje anterior para continuar la encuesta.");
      return;
    }

    await handleTextInput(session, thread, message.text);
  });
}

export { beginSurvey, resolveProfileContext };
