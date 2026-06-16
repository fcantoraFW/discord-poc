import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WellbeingCampaignType,
  WellbeingSession,
  WellbeingSessionState,
  WellbeingSubmissionSource,
} from "@/lib/types/database";
import type { WellbeingStep } from "@/lib/wellbeing/fsm";
import { emptySessionState } from "@/lib/wellbeing/fsm";

function parseSession(row: Record<string, unknown>): WellbeingSession {
  const rawState = row.state;
  const state =
    rawState && typeof rawState === "object" && !Array.isArray(rawState)
      ? (rawState as WellbeingSessionState)
      : emptySessionState();

  return {
    ...(row as WellbeingSession),
    state,
  };
}

export async function abandonInProgressSessionsForCampaigns(
  campaignIds: string[],
): Promise<number> {
  if (!campaignIds.length) return 0;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wellbeing_sessions")
    .update({ status: "abandoned", updated_at: now })
    .in("campaign_id", campaignIds)
    .eq("status", "in_progress")
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function abandonSession(sessionId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("wellbeing_sessions")
    .update({
      status: "abandoned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "in_progress");

  if (error) throw new Error(error.message);
}

export async function ensureActiveCampaignSession(
  session: WellbeingSession,
): Promise<WellbeingSession | null> {
  if (!session.campaign_id) {
    await abandonSession(session.id);
    return null;
  }

  const campaign = await getCampaignById(session.campaign_id);
  if (!campaign || campaign.status !== "active") {
    await abandonSession(session.id);
    return null;
  }

  return session;
}

export async function findInProgressSession(
  profileId: string,
  discordThreadKey: string,
): Promise<WellbeingSession | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellbeing_sessions")
    .select("*")
    .eq("profile_id", profileId)
    .eq("discord_thread_key", discordThreadKey)
    .eq("status", "in_progress")
    .maybeSingle();

  return data ? parseSession(data) : null;
}

export async function hasCampaignSubmission(
  profileId: string,
  campaignId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellbeing_submissions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return Boolean(data);
}

export async function getActiveCampaign(organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellbeing_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function createSession(options: {
  profileId: string;
  organizationId: string;
  discordThreadKey: string;
  source: WellbeingSubmissionSource;
  campaignId?: string | null;
  campaignType?: WellbeingCampaignType;
}): Promise<WellbeingSession> {
  const admin = createAdminClient();
  const campaignType = options.campaignType ?? "wellbeing";
  const initialState = emptySessionState(campaignType);
  const firstStep = campaignType === "project_evaluation" ? "project_name" : "workload";

  const { data, error } = await admin
    .from("wellbeing_sessions")
    .insert({
      profile_id: options.profileId,
      organization_id: options.organizationId,
      discord_thread_key: options.discordThreadKey,
      campaign_id: options.campaignId ?? null,
      source: options.source,
      current_step: firstStep,
      state: initialState,
      status: "in_progress",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await findInProgressSession(options.profileId, options.discordThreadKey);
      if (existing) return existing;
    }
    throw new Error(error.message ?? "Failed to create wellbeing session");
  }
  if (!data) throw new Error("Failed to create wellbeing session");
  return parseSession(data);
}

export async function updateSession(
  sessionId: string,
  patch: {
    current_step?: WellbeingStep | string;
    state?: WellbeingSessionState;
    status?: "in_progress" | "completed" | "abandoned";
    completed_at?: string | null;
  },
): Promise<WellbeingSession> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wellbeing_sessions")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update wellbeing session");
  return parseSession(data);
}

export async function getSessionById(sessionId: string): Promise<WellbeingSession | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellbeing_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  return data ? parseSession(data) : null;
}

export async function getCampaignById(campaignId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellbeing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  return data;
}
