"use server";

import { revalidatePath } from "next/cache";
import { canManageOrganization } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/profile";
import { campaignStartCard } from "@/lib/wellbeing/cards";
import { abandonInProgressSessionsForCampaigns } from "@/lib/wellbeing/session-store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WellbeingCampaignType } from "@/lib/types/database";

async function assertCanManageOrg(organizationId: string) {
  const profile = await requireProfile();
  if (!canManageOrganization(profile, organizationId)) {
    throw new Error("Forbidden");
  }
  return profile;
}

const CAMPAIGN_DEFAULT_NAMES: Record<WellbeingCampaignType, string> = {
  wellbeing: "Encuesta de bienestar",
  project_evaluation: "Evaluación de proyecto",
};

export async function launchWellbeingCampaign(
  organizationId: string,
  campaignType: WellbeingCampaignType = "wellbeing",
) {
  const adminProfile = await assertCanManageOrg(organizationId);
  const admin = createAdminClient();

  const { data: activeCampaigns } = await admin
    .from("wellbeing_campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (activeCampaigns?.length) {
    const ids = activeCampaigns.map((c) => c.id);
    await abandonInProgressSessionsForCampaigns(ids);
    await admin
      .from("wellbeing_campaigns")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .in("id", ids);
  }

  const now = new Date().toISOString();
  const { data: campaign, error: campaignError } = await admin
    .from("wellbeing_campaigns")
    .insert({
      organization_id: organizationId,
      name: CAMPAIGN_DEFAULT_NAMES[campaignType],
      campaign_type: campaignType,
      status: "active",
      started_by: adminProfile.id,
      started_at: now,
    })
    .select("*")
    .single();

  if (campaignError || !campaign) {
    throw new Error(campaignError?.message ?? "Failed to create campaign");
  }

  const { data: members } = await admin
    .from("profiles")
    .select("id, discord_user_id, email")
    .eq("organization_id", organizationId)
    .not("discord_user_id", "is", null);

  const { getChatBot } = await import("@/lib/discord/bot");
  const bot = await getChatBot();

  let sent = 0;
  let failed = 0;

  for (const member of members ?? []) {
    if (!member.discord_user_id) continue;
    try {
      const dmThread = await bot.openDM(member.discord_user_id);
      await dmThread.post(
        campaignStartCard(campaign.name, campaign.id, campaignType),
      );
      sent++;
    } catch (err) {
      console.error("[wellbeing-campaign] DM failed", {
        profileId: member.id,
        error: err instanceof Error ? err.message : err,
      });
      failed++;
    }
  }

  revalidatePath("/manage/wellbeing");
  return { campaignId: campaign.id, sent, failed, total: members?.length ?? 0 };
}

export async function closeActiveCampaign(organizationId: string) {
  await assertCanManageOrg(organizationId);
  const admin = createAdminClient();

  const { data: activeCampaigns } = await admin
    .from("wellbeing_campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const ids = (activeCampaigns ?? []).map((c) => c.id);
  if (ids.length) {
    await abandonInProgressSessionsForCampaigns(ids);
  }

  await admin
    .from("wellbeing_campaigns")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  revalidatePath("/manage/wellbeing");
}
