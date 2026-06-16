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
  ensureActiveCampaignSession,
  findInProgressSession,
  getCampaignById,
  hasCampaignSubmission,
} from "@/lib/wellbeing/session-store";

const REJECT_MESSAGE = UNAUTHORIZED_DISCORD_MESSAGE;

export const CAMPAIGN_ENDED_MESSAGE =
  "This campaign has ended. Wait for HR to launch a new one.";
export const NO_ACTIVE_SURVEY_MESSAGE =
  "No active survey. Use the **Start survey** button in your campaign DM.";
export const ALREADY_COMPLETED_MESSAGE =
  "You already completed the survey for this campaign. Thank you!";

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
          "Your Discord account is linked to multiple organizations. Open the campaign DM from the correct organization.",
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
  campaignId: string;
  copy?: WellbeingCopyContext | null;
}): Promise<WellbeingSession | null> {
  const { profile, organizationId, discordThreadKey, campaignId } = options;

  const campaign = await getCampaignById(campaignId);
  if (!campaign || campaign.organization_id !== organizationId) {
    return null;
  }
  if (campaign.status !== "active") {
    return null;
  }

  const already = await hasCampaignSubmission(profile.id, campaignId);
  if (already) return null;

  const existing = await findInProgressSession(profile.id, discordThreadKey);
  if (existing) {
    const active = await ensureActiveCampaignSession(existing);
    if (!active) return null;
    if (active.campaign_id !== campaignId) return active;
    return active;
  }

  return createSession({
    profileId: profile.id,
    organizationId,
    discordThreadKey,
    source: "campaign",
    campaignId,
    campaignType: (campaign.campaign_type as WellbeingCampaignType) ?? "wellbeing",
  });
}

export { resolveOrgMember };
