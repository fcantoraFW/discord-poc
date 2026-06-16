import type { WellbeingPillar, WellbeingRelationship, WellbeingSession } from "@/lib/types/database";
import {
  commentPromptCard,
  consentCard,
  extraNamePrompt,
  extraRelationshipCard,
  leaderNamePrompt,
  moreEvalPromptCard,
  peerNamePrompt,
  personRatingCard,
  pillarRatingCard,
  textInputPrompt,
} from "@/lib/wellbeing/cards";
import {
  currentPillarForStep,
  nextPillar,
  stepAfterConsent,
  stepAfterExtraCommentSkipped,
  stepAfterExtraName,
  stepAfterExtraRating,
  stepAfterExtraRelationship,
  stepAfterLeaderCommentSkipped,
  stepAfterLeaderName,
  stepAfterLeaderRating,
  stepAfterMoreEval,
  stepAfterPeerCommentSkipped,
  stepAfterPeerName,
  stepAfterPeerRating,
  stepAfterPillarCommentPrompt,
  stepAfterPillarCommentSkipped,
  stepAfterPillarRating,
  type WellbeingStep,
} from "@/lib/wellbeing/fsm";
import { PILLAR_LABELS, RELATIONSHIP_LABELS, getClosingMessage } from "@/lib/wellbeing/template";
import {
  applyPersonEvaluation,
  applyPillarComment,
  applyPillarRating,
  persistSubmission,
} from "@/lib/wellbeing/submit";
import { updateSession } from "@/lib/wellbeing/session-store";

type ThreadLike = {
  post: (content: unknown) => Promise<unknown>;
};

export async function renderStep(thread: ThreadLike, session: WellbeingSession): Promise<void> {
  const step = session.current_step as WellbeingStep;
  const state = session.state;

  switch (step) {
    case "consent":
      await thread.post(consentCard());
      break;
    case "pillar_rating": {
      const pillar = currentPillarForStep(step, state) ?? nextPillar(state);
      if (!pillar) {
        await advanceSession(session, "peer_name");
        return renderStep(thread, { ...session, current_step: "peer_name" });
      }
      await updateSession(session.id, {
        state: { ...state, pendingPillar: pillar },
        current_step: step,
      });
      await thread.post(pillarRatingCard(pillar));
      break;
    }
    case "pillar_comment_prompt": {
      const pillar = state.pendingPillar;
      if (!pillar) break;
      await thread.post(commentPromptCard(PILLAR_LABELS[pillar]));
      break;
    }
    case "pillar_comment_text": {
      const pillar = state.pendingPillar;
      if (!pillar) break;
      await thread.post(
        textInputPrompt(`Escribí tu comentario sobre **${PILLAR_LABELS[pillar]}** (opcional).`),
      );
      break;
    }
    case "peer_name":
      await thread.post(peerNamePrompt());
      break;
    case "peer_rating": {
      const name = state.personDraft?.evaluateeName ?? "tu compañero/a";
      await thread.post(personRatingCard("peer", name));
      break;
    }
    case "peer_comment_prompt":
      await thread.post(commentPromptCard(`tu evaluación de ${state.personDraft?.evaluateeName ?? "compañero/a"}`));
      break;
    case "peer_comment_text":
      await thread.post(textInputPrompt("Escribí tu comentario (opcional)."));
      break;
    case "leader_name":
      await thread.post(leaderNamePrompt());
      break;
    case "leader_rating": {
      const name = state.personDraft?.evaluateeName ?? "tu líder";
      await thread.post(personRatingCard("leader", name));
      break;
    }
    case "leader_comment_prompt":
      await thread.post(commentPromptCard(`tu evaluación de ${state.personDraft?.evaluateeName ?? "líder"}`));
      break;
    case "leader_comment_text":
      await thread.post(textInputPrompt("Escribí tu comentario (opcional)."));
      break;
    case "more_eval_prompt":
      await thread.post(moreEvalPromptCard());
      break;
    case "extra_relationship":
      await thread.post(extraRelationshipCard());
      break;
    case "extra_name": {
      const rel = state.pendingRelationship ?? "peer";
      await thread.post(extraNamePrompt(rel));
      break;
    }
    case "extra_rating": {
      const rel = state.pendingRelationship ?? "peer";
      const name = state.personDraft?.evaluateeName ?? "esta persona";
      await thread.post(personRatingCard(rel, name));
      break;
    }
    case "extra_comment_prompt":
      await thread.post(commentPromptCard(`tu evaluación de ${state.personDraft?.evaluateeName ?? "esta persona"}`));
      break;
    case "extra_comment_text":
      await thread.post(textInputPrompt("Escribí tu comentario (opcional)."));
      break;
    case "complete":
      await thread.post(getClosingMessage());
      break;
  }
}

async function advanceSession(
  session: WellbeingSession,
  nextStep: WellbeingStep,
  state = session.state,
): Promise<WellbeingSession> {
  return updateSession(session.id, {
    current_step: nextStep,
    state,
  });
}

export async function handleConsentAccept(session: WellbeingSession, thread: ThreadLike) {
  const nextStep = stepAfterConsent();
  const updated = await advanceSession(session, nextStep);
  await renderStep(thread, updated);
}

export async function handlePillarRating(
  session: WellbeingSession,
  thread: ThreadLike,
  pillar: WellbeingPillar,
  rating: number,
) {
  let state = applyPillarRating(session.state, pillar, rating);
  const nextStep = stepAfterPillarRating(pillar);
  const updated = await advanceSession(session, nextStep, state);
  await renderStep(thread, updated);
}

export async function handleCommentYes(session: WellbeingSession, thread: ThreadLike) {
  const step = session.current_step as WellbeingStep;
  let nextStep: WellbeingStep;
  if (step === "pillar_comment_prompt") nextStep = stepAfterPillarCommentPrompt();
  else if (step === "peer_comment_prompt") nextStep = "peer_comment_text";
  else if (step === "leader_comment_prompt") nextStep = "leader_comment_text";
  else nextStep = "extra_comment_text";

  const updated = await advanceSession(session, nextStep);
  await renderStep(thread, updated);
}

export async function handleCommentSkip(session: WellbeingSession, thread: ThreadLike) {
  const step = session.current_step as WellbeingStep;
  let nextStep: WellbeingStep;
  let state = session.state;

  if (step === "pillar_comment_prompt") {
    state = { ...state, pendingPillar: undefined };
    nextStep = stepAfterPillarCommentSkipped(state);
  } else if (step === "peer_comment_prompt") {
    const draft = state.personDraft;
    if (draft?.evaluateeName && draft.rating) {
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: "peer",
        rating: draft.rating,
      });
    }
    nextStep = stepAfterPeerCommentSkipped();
  } else if (step === "leader_comment_prompt") {
    const draft = state.personDraft;
    if (draft?.evaluateeName && draft.rating) {
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: "leader",
        rating: draft.rating,
      });
    }
    nextStep = stepAfterLeaderCommentSkipped();
  } else {
    const rel = state.pendingRelationship ?? "peer";
    const draft = state.personDraft;
    if (draft?.evaluateeName && draft.rating) {
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: rel,
        rating: draft.rating,
      });
    }
    nextStep = stepAfterExtraCommentSkipped();
  }

  const updated = await advanceSession(session, nextStep, state);
  await renderStep(thread, updated);
}

export async function handlePersonRating(
  session: WellbeingSession,
  thread: ThreadLike,
  relationship: WellbeingRelationship,
  rating: number,
) {
  const step = session.current_step as WellbeingStep;
  const state = {
    ...session.state,
    personDraft: {
      ...session.state.personDraft,
      relationship,
      rating,
    },
  };

  let nextStep: WellbeingStep;
  if (step === "peer_rating") nextStep = stepAfterPeerRating();
  else if (step === "leader_rating") nextStep = stepAfterLeaderRating();
  else nextStep = stepAfterExtraRating();

  const updated = await advanceSession(session, nextStep, state);
  await renderStep(thread, updated);
}

export async function handleMoreEval(
  session: WellbeingSession,
  thread: ThreadLike,
  yes: boolean,
) {
  if (!yes) {
    await completeSession(session, thread);
    return;
  }
  const nextStep = stepAfterMoreEval(true);
  const updated = await advanceSession(session, nextStep);
  await renderStep(thread, updated);
}

export async function handleExtraRelationship(
  session: WellbeingSession,
  thread: ThreadLike,
  relationship: WellbeingRelationship,
) {
  const state = {
    ...session.state,
    pendingRelationship: relationship,
    personDraft: { relationship },
  };
  const nextStep = stepAfterExtraRelationship();
  const updated = await advanceSession(session, nextStep, state);
  await renderStep(thread, updated);
}

export async function handleTextInput(
  session: WellbeingSession,
  thread: ThreadLike,
  text: string,
) {
  const step = session.current_step as WellbeingStep;
  const trimmed = text.trim();
  if (!trimmed) {
    await thread.post("Por favor escribí una respuesta o usá los botones para continuar.");
    return;
  }

  let state = session.state;
  let nextStep: WellbeingStep;

  switch (step) {
    case "pillar_comment_text": {
      const pillar = state.pendingPillar;
      if (!pillar) return;
      state = applyPillarComment(state, pillar, trimmed);
      nextStep = stepAfterPillarCommentSkipped(state);
      break;
    }
    case "peer_name":
      state = {
        ...state,
        personDraft: { evaluateeName: trimmed, relationship: "peer" },
      };
      nextStep = stepAfterPeerName();
      break;
    case "peer_comment_text": {
      const draft = state.personDraft;
      if (!draft?.evaluateeName || !draft.rating) return;
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: "peer",
        rating: draft.rating,
        comment: trimmed,
      });
      nextStep = stepAfterPeerCommentSkipped();
      break;
    }
    case "leader_name":
      state = {
        ...state,
        personDraft: { evaluateeName: trimmed, relationship: "leader" },
      };
      nextStep = stepAfterLeaderName();
      break;
    case "leader_comment_text": {
      const draft = state.personDraft;
      if (!draft?.evaluateeName || !draft.rating) return;
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: "leader",
        rating: draft.rating,
        comment: trimmed,
      });
      nextStep = stepAfterLeaderCommentSkipped();
      break;
    }
    case "extra_name":
      state = {
        ...state,
        personDraft: {
          ...state.personDraft,
          evaluateeName: trimmed,
          relationship: state.pendingRelationship,
        },
      };
      nextStep = stepAfterExtraName();
      break;
    case "extra_comment_text": {
      const rel = state.pendingRelationship ?? "peer";
      const draft = state.personDraft;
      if (!draft?.evaluateeName || !draft.rating) return;
      state = applyPersonEvaluation(state, {
        evaluateeName: draft.evaluateeName,
        relationship: rel,
        rating: draft.rating,
        comment: trimmed,
      });
      nextStep = stepAfterExtraCommentSkipped();
      break;
    }
    default:
      return;
  }

  const updated = await advanceSession(session, nextStep, state);
  await renderStep(thread, updated);
}

async function completeSession(session: WellbeingSession, thread: ThreadLike) {
  try {
    await persistSubmission(session);
    await thread.post(getClosingMessage());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al guardar la encuesta";
    await thread.post(`⚠️ ${msg}`);
  }
}

export async function startOrResumeSession(
  thread: ThreadLike,
  session: WellbeingSession,
): Promise<void> {
  await renderStep(thread, session);
}
