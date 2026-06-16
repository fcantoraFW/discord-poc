import type { WellbeingPillar, WellbeingRelationship, WellbeingSessionState } from "@/lib/types/database";
import { WELLBEING_PILLARS } from "@/lib/wellbeing/template";

export type WellbeingStep =
  | "consent"
  | "pillar_rating"
  | "pillar_comment_prompt"
  | "pillar_comment_text"
  | "peer_name"
  | "peer_rating"
  | "peer_comment_prompt"
  | "peer_comment_text"
  | "leader_name"
  | "leader_rating"
  | "leader_comment_prompt"
  | "leader_comment_text"
  | "more_eval_prompt"
  | "extra_relationship"
  | "extra_name"
  | "extra_rating"
  | "extra_comment_prompt"
  | "extra_comment_text"
  | "complete";

export function emptySessionState(): WellbeingSessionState {
  return {
    pillarRatings: {},
    personEvaluations: [],
  };
}

export function nextPillar(state: WellbeingSessionState): WellbeingPillar | null {
  for (const pillar of WELLBEING_PILLARS) {
    if (!state.pillarRatings[pillar]?.rating) return pillar;
  }
  return null;
}

export function stepAfterConsent(): WellbeingStep {
  return "pillar_rating";
}

export function stepAfterPillarRating(pillar: WellbeingPillar): WellbeingStep {
  return "pillar_comment_prompt";
}

export function stepAfterPillarCommentPrompt(): WellbeingStep {
  return "pillar_comment_text";
}

export function stepAfterPillarCommentSkipped(state: WellbeingSessionState): WellbeingStep {
  const next = nextPillar(state);
  if (next) return "pillar_rating";
  return "peer_name";
}

export function stepAfterPeerName(): WellbeingStep {
  return "peer_rating";
}

export function stepAfterPeerRating(): WellbeingStep {
  return "peer_comment_prompt";
}

export function stepAfterPeerCommentSkipped(): WellbeingStep {
  return "leader_name";
}

export function stepAfterLeaderName(): WellbeingStep {
  return "leader_rating";
}

export function stepAfterLeaderRating(): WellbeingStep {
  return "leader_comment_prompt";
}

export function stepAfterLeaderCommentSkipped(): WellbeingStep {
  return "more_eval_prompt";
}

export function stepAfterMoreEval(yes: boolean): WellbeingStep {
  return yes ? "extra_relationship" : "complete";
}

export function stepAfterExtraRelationship(): WellbeingStep {
  return "extra_name";
}

export function stepAfterExtraName(): WellbeingStep {
  return "extra_rating";
}

export function stepAfterExtraRating(): WellbeingStep {
  return "extra_comment_prompt";
}

export function stepAfterExtraCommentSkipped(): WellbeingStep {
  return "more_eval_prompt";
}

export function isAwaitingText(step: WellbeingStep): boolean {
  return (
    step === "pillar_comment_text" ||
    step === "peer_name" ||
    step === "peer_comment_text" ||
    step === "leader_name" ||
    step === "leader_comment_text" ||
    step === "extra_name" ||
    step === "extra_comment_text"
  );
}

export function relationshipForStep(step: WellbeingStep): WellbeingRelationship | null {
  if (step.startsWith("peer")) return "peer";
  if (step.startsWith("leader")) return "leader";
  if (step.startsWith("extra") && step !== "extra_relationship") {
    return null;
  }
  return null;
}

export function currentPillarForStep(
  step: WellbeingStep,
  state: WellbeingSessionState,
): WellbeingPillar | null {
  if (step === "pillar_rating" || step === "pillar_comment_prompt" || step === "pillar_comment_text") {
    return state.pendingPillar ?? nextPillar(state);
  }
  return null;
}

export function validateRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
