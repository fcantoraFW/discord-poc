import { createClient } from "@/lib/supabase/server";
import type { WellbeingCampaignType, WellbeingPillar } from "@/lib/types/database";
import { listOrgAssistantsForWellbeing } from "@/lib/wellbeing/assistant-config";
import { PILLAR_LABELS, WELLBEING_PILLARS } from "@/lib/wellbeing/template";

export type PillarAverage = {
  pillar: WellbeingPillar;
  label: string;
  average: number | null;
  count: number;
};

export type WellbeingSubmissionRow = {
  id: string;
  completed_at: string;
  source: string;
  profile_email: string;
  pillar_averages: Record<WellbeingPillar, number | null>;
  person_eval_count: number;
  pillar_details: Array<{
    pillar: WellbeingPillar;
    rating: number;
    comment: string | null;
  }>;
  person_details: Array<{
    evaluatee_name: string;
    relationship: string;
    rating: number;
    comment: string | null;
  }>;
};

export type WellbeingDashboardData = {
  activeCampaign: {
    id: string;
    name: string;
    campaign_type: WellbeingCampaignType;
    started_at: string | null;
    status: string;
  } | null;
  totalSubmissions: number;
  campaignSubmissions: number;
  orgMemberCount: number;
  pillarAverages: PillarAverage[];
  recentSubmissions: WellbeingSubmissionRow[];
  wellbeingAssistantId: string | null;
  assistants: Array<{ id: string; name: string }>;
};

export async function loadWellbeingDashboard(organizationId: string): Promise<WellbeingDashboardData> {
  const supabase = await createClient();

  const { data: activeCampaign } = await supabase
    .from("wellbeing_campaigns")
    .select("id, name, campaign_type, started_at, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: memberCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const { data: submissions } = await supabase
    .from("wellbeing_submissions")
    .select("id, completed_at, source, profile_id, campaign_id")
    .eq("organization_id", organizationId)
    .order("completed_at", { ascending: false })
    .limit(50);

  const submissionIds = (submissions ?? []).map((s) => s.id);
  const profileIds = [...new Set((submissions ?? []).map((s) => s.profile_id))];

  const [{ data: profiles }, { data: pillarRatings }, { data: personEvals }] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, email").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    submissionIds.length
      ? supabase
          .from("wellbeing_pillar_ratings")
          .select("submission_id, pillar, rating, comment")
          .in("submission_id", submissionIds)
      : Promise.resolve({
          data: [] as {
            submission_id: string;
            pillar: WellbeingPillar;
            rating: number;
            comment: string | null;
          }[],
        }),
    submissionIds.length
      ? supabase
          .from("wellbeing_person_evaluations")
          .select("submission_id, evaluatee_name, relationship, rating, comment")
          .in("submission_id", submissionIds)
      : Promise.resolve({
          data: [] as {
            submission_id: string;
            evaluatee_name: string;
            relationship: string;
            rating: number;
            comment: string | null;
          }[],
        }),
  ]);

  const emailByProfile = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  const pillarAverages: PillarAverage[] = WELLBEING_PILLARS.map((pillar) => {
    const ratings = (pillarRatings ?? [])
      .filter((r) => r.pillar === pillar)
      .map((r) => r.rating);
    const average =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;
    return {
      pillar,
      label: PILLAR_LABELS[pillar],
      average,
      count: ratings.length,
    };
  });

  const personDetailsBySubmission = new Map<
    string,
    WellbeingSubmissionRow["person_details"]
  >();
  for (const ev of personEvals ?? []) {
    const list = personDetailsBySubmission.get(ev.submission_id) ?? [];
    list.push({
      evaluatee_name: ev.evaluatee_name,
      relationship: ev.relationship,
      rating: ev.rating,
      comment: ev.comment,
    });
    personDetailsBySubmission.set(ev.submission_id, list);
  }

  const pillarDetailsBySubmission = new Map<
    string,
    WellbeingSubmissionRow["pillar_details"]
  >();
  for (const r of pillarRatings ?? []) {
    const list = pillarDetailsBySubmission.get(r.submission_id) ?? [];
    list.push({
      pillar: r.pillar as WellbeingPillar,
      rating: r.rating,
      comment: r.comment,
    });
    pillarDetailsBySubmission.set(r.submission_id, list);
  }

  const ratingsBySubmission = new Map<string, Partial<Record<WellbeingPillar, number[]>>>();
  for (const r of pillarRatings ?? []) {
    const bucket = ratingsBySubmission.get(r.submission_id) ?? {};
    const list = bucket[r.pillar as WellbeingPillar] ?? [];
    list.push(r.rating);
    bucket[r.pillar as WellbeingPillar] = list;
    ratingsBySubmission.set(r.submission_id, bucket);
  }

  const recentSubmissions: WellbeingSubmissionRow[] = (submissions ?? []).slice(0, 20).map((s) => {
    const bucket = ratingsBySubmission.get(s.id) ?? {};
    const pillar_averages = {} as Record<WellbeingPillar, number | null>;
    for (const pillar of WELLBEING_PILLARS) {
      const list = bucket[pillar];
      pillar_averages[pillar] = list?.length
        ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
        : null;
    }
    return {
      id: s.id,
      completed_at: s.completed_at,
      source: s.source,
      profile_email: emailByProfile.get(s.profile_id) ?? s.profile_id,
      pillar_averages,
      person_eval_count: personDetailsBySubmission.get(s.id)?.length ?? 0,
      pillar_details: pillarDetailsBySubmission.get(s.id) ?? [],
      person_details: personDetailsBySubmission.get(s.id) ?? [],
    };
  });

  const campaignSubmissions = activeCampaign
    ? (submissions ?? []).filter((s) => s.campaign_id === activeCampaign.id).length
    : 0;

  const [{ data: org }, assistants] = await Promise.all([
    supabase
      .from("organizations")
      .select("wellbeing_assistant_id")
      .eq("id", organizationId)
      .single(),
    listOrgAssistantsForWellbeing(organizationId),
  ]);

  return {
    activeCampaign: activeCampaign
      ? {
          ...activeCampaign,
          campaign_type: (activeCampaign.campaign_type as WellbeingCampaignType) ?? "wellbeing",
        }
      : null,
    totalSubmissions: submissions?.length ?? 0,
    campaignSubmissions,
    orgMemberCount: memberCount ?? 0,
    pillarAverages,
    recentSubmissions,
    wellbeingAssistantId: (org?.wellbeing_assistant_id as string | null) ?? null,
    assistants,
  };
}
