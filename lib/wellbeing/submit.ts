import { createAdminClient } from "@/lib/supabase/admin";
import type { WellbeingSession, WellbeingSessionState } from "@/lib/types/database";
import { WELLBEING_PILLARS } from "@/lib/wellbeing/template";
import { updateSession } from "@/lib/wellbeing/session-store";

export async function persistSubmission(session: WellbeingSession): Promise<string> {
  const admin = createAdminClient();
  const state = session.state;

  for (const pillar of WELLBEING_PILLARS) {
    const rating = state.pillarRatings[pillar]?.rating;
    if (!rating) {
      throw new Error(`Missing pillar rating: ${pillar}`);
    }
  }

  const { data: submission, error: submissionError } = await admin
    .from("wellbeing_submissions")
    .insert({
      session_id: session.id,
      profile_id: session.profile_id,
      organization_id: session.organization_id,
      campaign_id: session.campaign_id,
      source: session.source,
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Failed to save submission");
  }

  const pillarRows = WELLBEING_PILLARS.map((pillar) => ({
    submission_id: submission.id,
    pillar,
    rating: state.pillarRatings[pillar]!.rating,
    comment: state.pillarRatings[pillar]?.comment ?? null,
  }));

  const { error: pillarError } = await admin.from("wellbeing_pillar_ratings").insert(pillarRows);
  if (pillarError) throw new Error(pillarError.message);

  if (state.personEvaluations.length > 0) {
    const personRows = state.personEvaluations.map((ev) => ({
      submission_id: submission.id,
      evaluator_profile_id: session.profile_id,
      evaluatee_name: ev.evaluateeName,
      relationship: ev.relationship,
      rating: ev.rating,
      comment: ev.comment ?? null,
    }));

    const { error: personError } = await admin
      .from("wellbeing_person_evaluations")
      .insert(personRows);
    if (personError) throw new Error(personError.message);
  }

  await updateSession(session.id, {
    status: "completed",
    current_step: "complete",
    completed_at: new Date().toISOString(),
  });

  return submission.id;
}

export function applyPillarRating(
  state: WellbeingSessionState,
  pillar: (typeof WELLBEING_PILLARS)[number],
  rating: number,
): WellbeingSessionState {
  return {
    ...state,
    pillarRatings: {
      ...state.pillarRatings,
      [pillar]: { ...state.pillarRatings[pillar], rating },
    },
    pendingPillar: pillar,
  };
}

export function applyPillarComment(
  state: WellbeingSessionState,
  pillar: (typeof WELLBEING_PILLARS)[number],
  comment: string,
): WellbeingSessionState {
  const existing = state.pillarRatings[pillar] ?? { rating: 0 };
  return {
    ...state,
    pillarRatings: {
      ...state.pillarRatings,
      [pillar]: { ...existing, comment },
    },
    pendingPillar: undefined,
  };
}

export function applyPersonEvaluation(
  state: WellbeingSessionState,
  evaluation: WellbeingSessionState["personEvaluations"][number],
): WellbeingSessionState {
  return {
    ...state,
    personEvaluations: [...state.personEvaluations, evaluation],
    personDraft: undefined,
    pendingRelationship: undefined,
  };
}
