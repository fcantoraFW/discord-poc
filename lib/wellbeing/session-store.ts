import { createAdminClient } from "@/lib/supabase/admin";
import type {
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
      : { pillarRatings: {}, personEvaluations: [] };

  return {
    ...(row as WellbeingSession),
    state,
  };
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
}): Promise<WellbeingSession> {
  const admin = createAdminClient();
  const initialState = emptySessionState();

  const { data, error } = await admin
    .from("wellbeing_sessions")
    .insert({
      profile_id: options.profileId,
      organization_id: options.organizationId,
      discord_thread_key: options.discordThreadKey,
      campaign_id: options.campaignId ?? null,
      source: options.source,
      current_step: "consent",
      state: initialState,
      status: "in_progress",
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create wellbeing session");
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
