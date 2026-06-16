import { createAdminClient } from "@/lib/supabase/admin";
import type { WellbeingSession, WellbeingSessionState } from "@/lib/types/database";
import { WELLBEING_PILLARS } from "@/lib/wellbeing/template";
import { updateSession } from "@/lib/wellbeing/session-store";

function isProjectEvalSession(session: WellbeingSession): boolean {
  return session.state.campaignType === "project_evaluation";
}

function validateProjectSelfEval(session: WellbeingSession): void {
  const self = session.state.projectSelfEval ?? {};
  if (!self.projectName?.trim()) throw new Error("Project name is required.");
  if (!self.overallSatisfaction) throw new Error("Overall satisfaction rating is required.");
  if (!self.keyContributions?.trim()) throw new Error("Key contributions are required.");
  if (!self.didWell?.trim()) throw new Error("What you did well is required.");
  if (!self.challenges?.trim()) throw new Error("Challenges are required.");
  if (!self.couldDoBetter?.trim()) throw new Error("What you could do better is required.");
  if (!self.learned?.trim()) throw new Error("What you learned is required.");
}

async function persistWellbeingSubmission(session: WellbeingSession): Promise<string> {
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

async function persistProjectEvalSubmission(session: WellbeingSession): Promise<string> {
  const admin = createAdminClient();
  const state = session.state;
  validateProjectSelfEval(session);

  const teamEvaluations = state.teamEvaluations ?? [];
  if (teamEvaluations.length < 1) {
    throw new Error("At least one team member evaluation is required.");
  }

  const self = state.projectSelfEval!;

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

  const { error: selfError } = await admin.from("wellbeing_project_self_evaluations").insert({
    submission_id: submission.id,
    project_name: self.projectName!.trim(),
    overall_satisfaction: self.overallSatisfaction!,
    key_contributions: self.keyContributions!.trim(),
    did_well: self.didWell!.trim(),
    challenges: self.challenges!.trim(),
    could_do_better: self.couldDoBetter!.trim(),
    learned: self.learned!.trim(),
    additional_comments: self.additionalComments?.trim() ?? null,
  });
  if (selfError) throw new Error(selfError.message);

  const teamRows = teamEvaluations.map((ev) => ({
    submission_id: submission.id,
    evaluator_profile_id: session.profile_id,
    evaluatee_name: ev.evaluateeName,
    role: ev.role,
    did_well: ev.didWell,
    could_do_better: ev.couldDoBetter,
    communication_rating: ev.communicationRating,
    collaboration_rating: ev.collaborationRating,
    problem_solving_rating: ev.problemSolvingRating,
    overall_rating: ev.overallRating,
    additional_comments: ev.additionalComments ?? null,
  }));

  const { error: teamError } = await admin
    .from("wellbeing_team_member_evaluations")
    .insert(teamRows);
  if (teamError) throw new Error(teamError.message);

  await updateSession(session.id, {
    status: "completed",
    current_step: "complete",
    completed_at: new Date().toISOString(),
  });

  return submission.id;
}

export async function persistSubmission(session: WellbeingSession): Promise<string> {
  if (isProjectEvalSession(session)) {
    return persistProjectEvalSubmission(session);
  }
  return persistWellbeingSubmission(session);
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
