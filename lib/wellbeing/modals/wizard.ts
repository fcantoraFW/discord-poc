import type { WellbeingSession, WellbeingSessionState } from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";
import {
  parseModalFieldValues,
  respondToInteractionCallback,
  sendInteractionFollowup,
  type DiscordInteractionPayload,
} from "@/lib/wellbeing/discord-api";
import {
  buildWizardModal,
  continueButtonRow,
  editActionId,
  modalCustomId,
  nextWizardStep,
  openActionId,
  parseRating,
  PILLAR_MODAL_STEPS,
  relationshipForPersonStep,
  type ModalWizardStep,
  yesNoRow,
} from "@/lib/wellbeing/modals/build";
import { handleProjectEvalDiscordInteraction } from "@/lib/wellbeing/modals/project-wizard";
import {
  applyPersonEvaluation,
  applyPillarComment,
  applyPillarRating,
  persistSubmission,
} from "@/lib/wellbeing/submit";
import { updateSession } from "@/lib/wellbeing/session-store";
import { PILLAR_LABELS, getClosingMessage } from "@/lib/wellbeing/template";

function parseOpenStep(actionId: string): ModalWizardStep | null {
  const open = actionId.match(/^wellbeing:open:(\w+)$/);
  if (open) return open[1] as ModalWizardStep;
  const edit = actionId.match(/^wellbeing:edit:(\w+)$/);
  if (edit) return edit[1] as ModalWizardStep;
  const extra = actionId.match(/^wellbeing:open:extra:(peer|leader)$/);
  if (extra) return "extra";
  return null;
}

function parseModalStep(customId: string | undefined): ModalWizardStep | null {
  const m = customId?.match(/^wellbeing:modal:(\w+)$/);
  if (!m) return null;
  const step = m[1];
  const wellbeingSteps: ModalWizardStep[] = [
    ...PILLAR_MODAL_STEPS,
    "peer",
    "leader",
    "extra",
  ];
  return wellbeingSteps.includes(step as ModalWizardStep) ? (step as ModalWizardStep) : null;
}

function parseExtraRelationship(actionId: string): "peer" | "leader" | null {
  const m = actionId.match(/^wellbeing:open:extra:(peer|leader)$/);
  return m ? (m[1] as "peer" | "leader") : null;
}

function formatReviewSummary(session: WellbeingSession): string {
  const lines: string[] = ["**Survey summary**", ""];
  for (const pillar of PILLAR_MODAL_STEPS) {
    const r = session.state.pillarRatings[pillar];
    lines.push(
      `• ${PILLAR_LABELS[pillar]}: ${r?.rating ?? "—"}/5${r?.comment ? ` — _${r.comment}_` : ""}`,
    );
  }
  if (session.state.personEvaluations.length) {
    lines.push("", "**People evaluated:**");
    for (const p of session.state.personEvaluations) {
      lines.push(
        `• ${p.evaluateeName} (${p.relationship}): ${p.rating}/5${p.comment ? ` — _${p.comment}_` : ""}`,
      );
    }
  }
  lines.push("", "You can edit a section or submit the survey.");
  return lines.join("\n");
}

function reviewEditButtons() {
  const rows = PILLAR_MODAL_STEPS.map((pillar) => ({
    type: 2,
    style: 2,
    label: `Edit ${PILLAR_LABELS[pillar].slice(0, 20)}`,
    custom_id: editActionId(pillar),
  }));
  const chunks: unknown[] = [];
  for (let i = 0; i < rows.length; i += 5) {
    chunks.push({ type: 1, components: rows.slice(i, i + 5) });
  }
  chunks.push({
    type: 1,
    components: [
      { type: 2, style: 2, label: "Edit teammate", custom_id: editActionId("peer") },
      { type: 2, style: 2, label: "Edit manager", custom_id: editActionId("leader") },
    ],
  });
  chunks.push({
    type: 1,
    components: [
      { type: 2, style: 3, label: "Submit survey", custom_id: "wellbeing:finalize" },
    ],
  });
  return chunks;
}

async function openModalForStep(
  interaction: DiscordInteractionPayload,
  step: ModalWizardStep,
): Promise<void> {
  await respondToInteractionCallback(interaction, buildWizardModal(step));
}

async function promptNext(
  interaction: DiscordInteractionPayload,
  session: WellbeingSession,
  copy: WellbeingCopyContext | null,
  next: ModalWizardStep | "more_eval" | "review" | "done",
  editing = false,
): Promise<void> {
  if (next === "more_eval") {
    await sendInteractionFollowup(interaction.token, {
      content: "Would you like to evaluate another person?",
      components: yesNoRow("wellbeing:more:yes", "wellbeing:more:no"),
    });
    await updateSession(session.id, { current_step: "more_eval" });
    return;
  }

  if (next === "review") {
    await sendInteractionFollowup(interaction.token, {
      content: formatReviewSummary(session),
      components: reviewEditButtons(),
    });
    await updateSession(session.id, { current_step: "review" });
    return;
  }

  if (next === "done") {
    await persistSubmission(session);
    const closing = getClosingMessage(copy ?? undefined);
    await sendInteractionFollowup(interaction.token, { content: closing });
    return;
  }

  const label = editing
    ? `Edit: ${PILLAR_LABELS[next as keyof typeof PILLAR_LABELS] ?? next}`
    : `Continue: ${PILLAR_LABELS[next as keyof typeof PILLAR_LABELS] ?? next}`;
  await sendInteractionFollowup(interaction.token, {
    content: editing ? "Open the form to edit this section." : "Step saved. Continue with the next one.",
    components: continueButtonRow(openActionId(next), label.slice(0, 80)),
  });
  await updateSession(session.id, { current_step: next });
}

async function applyModalSubmit(
  session: WellbeingSession,
  step: ModalWizardStep,
  fields: Record<string, string>,
  extraRelationship?: "peer" | "leader" | null,
): Promise<{ session: WellbeingSession; editing: boolean }> {
  const editing = session.current_step === "review";
  let state: WellbeingSessionState = session.state;

  if (PILLAR_MODAL_STEPS.includes(step as (typeof PILLAR_MODAL_STEPS)[number])) {
    const pillar = step as (typeof PILLAR_MODAL_STEPS)[number];
    const rating = parseRating(fields.rating);
    if (rating == null) throw new Error("Rating must be a number from 1 to 5.");
    state = applyPillarRating(state, pillar, rating);
    const comment = fields.comment?.trim();
    if (comment) state = applyPillarComment(state, pillar, comment);
    const updated = await updateSession(session.id, { state, current_step: editing ? "review" : step });
    return { session: updated, editing };
  }

  const name = fields.name?.trim();
  if (!name) throw new Error("Name is required.");
  const rating = parseRating(fields.rating);
  if (rating == null) throw new Error("Rating must be from 1 to 5.");

  const rel =
    step === "extra"
      ? (extraRelationship ?? state.pendingRelationship ?? "peer")
      : relationshipForPersonStep(step);
  if (!rel) throw new Error("Invalid evaluation type.");

  if (step === "peer" || step === "leader") {
    const idx = state.personEvaluations.findIndex((e) => e.relationship === rel);
    const evaluation = {
      evaluateeName: name,
      relationship: rel,
      rating,
      comment: fields.comment?.trim() || undefined,
    };
    if (idx >= 0) {
      const evals = [...state.personEvaluations];
      evals[idx] = evaluation;
      state = { ...state, personEvaluations: evals };
    } else {
      state = applyPersonEvaluation(state, evaluation);
    }
  } else if (step === "extra" || editing) {
    const idx = state.personEvaluations.findIndex(
      (e) => e.evaluateeName === name && e.relationship === rel,
    );
    const evaluation = {
      evaluateeName: name,
      relationship: rel,
      rating,
      comment: fields.comment?.trim() || undefined,
    };
    if (idx >= 0) {
      const evals = [...state.personEvaluations];
      evals[idx] = evaluation;
      state = { ...state, personEvaluations: evals };
    } else if (step === "extra") {
      state = applyPersonEvaluation(state, evaluation);
    } else {
      state = applyPersonEvaluation(state, evaluation);
    }
  } else {
    state = applyPersonEvaluation(state, {
      evaluateeName: name,
      relationship: rel,
      rating,
      comment: fields.comment?.trim() || undefined,
    });
  }

  const updated = await updateSession(session.id, {
    state: { ...state, pendingRelationship: undefined },
    current_step: editing ? "review" : step,
  });
  return { session: updated, editing };
}

async function handleWellbeingFlowInteraction(
  interaction: DiscordInteractionPayload,
  options: {
    session: WellbeingSession;
    copy: WellbeingCopyContext | null;
  },
): Promise<boolean> {
  const actionId = interaction.data?.custom_id ?? "";
  const { session, copy } = options;

  if (interaction.type === 3) {
    if (actionId === "wellbeing:more:yes") {
      await sendInteractionFollowup(interaction.token, {
        content: "Are you evaluating a teammate or a manager?",
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: "Teammate", custom_id: "wellbeing:open:extra:peer" },
              { type: 2, style: 2, label: "Manager", custom_id: "wellbeing:open:extra:leader" },
            ],
          },
        ],
      });
      return true;
    }

    if (actionId === "wellbeing:more:no") {
      const updated = await updateSession(session.id, { current_step: "review" });
      await promptNext(interaction, updated, copy, "review");
      return true;
    }

    if (actionId === "wellbeing:finalize") {
      const fresh = await updateSession(session.id, { current_step: "complete" });
      await promptNext(interaction, fresh, copy, "done");
      return true;
    }

    const extraRel = parseExtraRelationship(actionId);
    if (extraRel) {
      await updateSession(session.id, {
        state: { ...session.state, pendingRelationship: extraRel },
        current_step: "extra",
      });
      await openModalForStep(interaction, "extra");
      return true;
    }

    const openStep = parseOpenStep(actionId);
    if (openStep) {
      await openModalForStep(interaction, openStep);
      return true;
    }
  }

  if (interaction.type === 5) {
    const step = parseModalStep(actionId);
    if (!step) return false;

    const fields = parseModalFieldValues(interaction);
    const { session: updated, editing } = await applyModalSubmit(
      session,
      step,
      fields,
      session.state.pendingRelationship,
    );

    if (editing) {
      await promptNext(interaction, updated, copy, "review", true);
      return true;
    }

    const next = nextWizardStep(step);
    await promptNext(interaction, updated, copy, next);
    return true;
  }

  return false;
}

export async function handleWellbeingDiscordInteraction(
  interaction: DiscordInteractionPayload,
  options: {
    session: WellbeingSession;
    copy: WellbeingCopyContext | null;
    organizationId: string;
  },
): Promise<boolean> {
  if (options.session.state.campaignType === "project_evaluation") {
    return handleProjectEvalDiscordInteraction(interaction, {
      session: options.session,
      copy: options.copy,
    });
  }
  return handleWellbeingFlowInteraction(interaction, options);
}

export { parseOpenStep, parseModalStep };
