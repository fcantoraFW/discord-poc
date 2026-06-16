import type { Profile, WellbeingCampaignType } from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";
import {
  getGuildLink,
  getProfileByDiscordUserId,
  UNAUTHORIZED_DISCORD_MESSAGE,
  UNLINKED_GUILD_MESSAGE,
} from "@/lib/chat/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WellbeingSession } from "@/lib/types/database";
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

export async function resolveProfileContextForInteraction(
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

export async function beginSurveyFromInteraction(options: {
  profile: Profile;
  organizationId: string;
  discordThreadKey: string;
  source: "encuesta" | "campaign";
  campaignId?: string | null;
  copy?: WellbeingCopyContext | null;
}): Promise<WellbeingSession | null> {
  const { profile, organizationId, discordThreadKey, source } = options;
  let campaignId = options.campaignId ?? null;

  if (source === "encuesta" && !campaignId) {
    const active = await getActiveCampaign(organizationId);
    campaignId = active?.id ?? null;
  }

  if (campaignId) {
    const campaign = await getCampaignById(campaignId);
    if (!campaign || campaign.organization_id !== organizationId) {
      throw new Error("Esta campaña ya no está disponible.");
    }
    if (campaign.status !== "active") {
      throw new Error("Esta campaña ya finalizó.");
    }
    const already = await hasCampaignSubmission(profile.id, campaignId);
    if (already) return null;

    return createSession({
      profileId: profile.id,
      organizationId,
      discordThreadKey,
      source,
      campaignId,
      campaignType: (campaign.campaign_type as WellbeingCampaignType) ?? "wellbeing",
    });
  }

  const existing = await findInProgressSession(profile.id, discordThreadKey);
  if (existing) return existing;

  let campaignType: WellbeingCampaignType = "wellbeing";
  if (source === "encuesta") {
    const active = await getActiveCampaign(organizationId);
    if (active?.campaign_type) {
      campaignType = active.campaign_type as WellbeingCampaignType;
    }
  }

  return createSession({
    profileId: profile.id,
    organizationId,
    discordThreadKey,
    source,
    campaignId,
    campaignType,
  });
}

export { resolveOrgMember };
