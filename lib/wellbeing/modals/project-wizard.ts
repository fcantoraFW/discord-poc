import type {
  ProjectSelfEvalDraft,
  TeamMemberEvalDraft,
  WellbeingSession,
  WellbeingSessionState,
} from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";
import {
  parseModalFieldValues,
  respondToInteractionCallback,
  sendInteractionFollowup,
  type DiscordInteractionPayload,
} from "@/lib/wellbeing/discord-api";
import {
  buildProjectEvalModal,
  continueButtonRow,
  nextProjectEvalStep,
  parseProjectEvalStep,
  parseRating,
  parseTeamMemberRole,
  projectEditActionId,
  projectOpenActionId,
  projectYesNoRow,
  PROJECT_SELF_STEPS,
  PROJECT_TEAM_STEPS,
  roleSelectionRow,
  type ProjectEvalStep,
} from "@/lib/wellbeing/modals/project-build";
import { persistSubmission } from "@/lib/wellbeing/submit";
import { updateSession } from "@/lib/wellbeing/session-store";
import {
  getProjectEvalClosingMessage,
  PROJECT_EVAL_FIELD_LABELS,
  TEAM_MEMBER_ROLE_LABELS,
} from "@/lib/wellbeing/project-eval-template";

function requireText(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function formatProjectReviewSummary(session: WellbeingSession): string {
  const self = session.state.projectSelfEval ?? {};
  const lines: string[] = ["**Survey summary**", ""];
  lines.push(`**Project:** ${self.projectName ?? "—"}`);
  lines.push(`**Your satisfaction:** ${self.overallSatisfaction ?? "—"}/5`);
  lines.push(`**Key contributions:** ${self.keyContributions ?? "—"}`);
  lines.push(`**Did well:** ${self.didWell ?? "—"}`);
  lines.push(`**Challenges:** ${self.challenges ?? "—"}`);
  lines.push(`**Could do better:** ${self.couldDoBetter ?? "—"}`);
  lines.push(`**Learned:** ${self.learned ?? "—"}`);
  if (self.additionalComments) {
    lines.push(`**Your comments:** _${self.additionalComments}_`);
  }

  const team = session.state.teamEvaluations ?? [];
  if (team.length) {
    lines.push("", "**Team members evaluated:**");
    for (const member of team) {
      lines.push(
        `• ${member.evaluateeName} (${TEAM_MEMBER_ROLE_LABELS[member.role]}): ${member.overallRating}/5`,
      );
    }
  }

  lines.push("", "You can edit a section or submit the survey.");
  return lines.join("\n");
}

function reviewEditButtons() {
  const selfRows = PROJECT_SELF_STEPS.map((step) => ({
    type: 2,
    style: 2,
    label: `Edit ${step.replace(/_/g, " ").slice(0, 20)}`,
    custom_id: projectEditActionId(step),
  }));
  const chunks: unknown[] = [];
  for (let i = 0; i < selfRows.length; i += 5) {
    chunks.push({ type: 1, components: selfRows.slice(i, i + 5) });
  }
  chunks.push({
    type: 1,
    components: [
      { type: 2, style: 2, label: "Edit team member", custom_id: projectEditActionId("team_name") },
      { type: 2, style: 3, label: "Submit survey", custom_id: "wellbeing:finalize" },
    ],
  });
  return chunks;
}

async function openProjectModal(
  interaction: DiscordInteractionPayload,
  step: ProjectEvalStep,
): Promise<void> {
  await respondToInteractionCallback(interaction, buildProjectEvalModal(step));
}

async function promptProjectNext(
  interaction: DiscordInteractionPayload,
  session: WellbeingSession,
  copy: WellbeingCopyContext | null,
  next: ProjectEvalStep | "role_select" | "more_eval" | "review" | "done",
  editing = false,
): Promise<void> {
  if (next === "role_select") {
    await sendInteractionFollowup(interaction.token, {
      content: "Select this team member's role:",
      components: roleSelectionRow(),
    });
    await updateSession(session.id, { current_step: "role_select" });
    return;
  }

  if (next === "more_eval") {
    await sendInteractionFollowup(interaction.token, {
      content: "Would you like to evaluate another team member?",
      components: projectYesNoRow(),
    });
    await updateSession(session.id, { current_step: "more_eval" });
    return;
  }

  if (next === "review") {
    await sendInteractionFollowup(interaction.token, {
      content: formatProjectReviewSummary(session),
      components: reviewEditButtons(),
    });
    await updateSession(session.id, { current_step: "review" });
    return;
  }

  if (next === "done") {
    await persistSubmission(session);
    const closing = getProjectEvalClosingMessage(copy ?? undefined);
    await sendInteractionFollowup(interaction.token, { content: closing });
    return;
  }

  const stepLabel = next.replace(/_/g, " ");
  const label = editing ? `Edit: ${stepLabel}` : `Continue: ${stepLabel}`;
  await sendInteractionFollowup(interaction.token, {
    content: editing ? "Open the form to edit this section." : "Step saved. Continue with the next one.",
    components: continueButtonRow(projectOpenActionId(next), label.slice(0, 80)),
  });
  await updateSession(session.id, { current_step: next });
}

function finalizePendingTeamEval(
  state: WellbeingSessionState,
  pending: Partial<TeamMemberEvalDraft>,
): WellbeingSessionState {
  const evaluation: TeamMemberEvalDraft = {
    evaluateeName: pending.evaluateeName!,
    role: pending.role!,
    didWell: pending.didWell!,
    couldDoBetter: pending.couldDoBetter!,
    communicationRating: pending.communicationRating!,
    collaborationRating: pending.collaborationRating!,
    problemSolvingRating: pending.problemSolvingRating!,
    overallRating: pending.overallRating!,
    additionalComments: pending.additionalComments?.trim() || undefined,
  };

  const teamEvaluations = [...(state.teamEvaluations ?? [])];
  const editIndex = state.pendingTeamEvalIndex;
  if (editIndex != null && editIndex >= 0 && editIndex < teamEvaluations.length) {
    teamEvaluations[editIndex] = evaluation;
  } else {
    teamEvaluations.push(evaluation);
  }

  return {
    ...state,
    teamEvaluations,
    pendingTeamEval: undefined,
    pendingTeamEvalIndex: undefined,
    pendingRole: undefined,
  };
}

async function applyProjectModalSubmit(
  session: WellbeingSession,
  step: ProjectEvalStep,
  fields: Record<string, string>,
): Promise<{ session: WellbeingSession; editing: boolean }> {
  const editing = session.current_step === "review";
  let state: WellbeingSessionState = session.state;
  const self: ProjectSelfEvalDraft = { ...(state.projectSelfEval ?? {}) };
  const pending: Partial<TeamMemberEvalDraft> = { ...(state.pendingTeamEval ?? {}) };

  if (step === "project_name") {
    self.projectName = requireText(fields.project_name, PROJECT_EVAL_FIELD_LABELS.projectName);
  } else if (step === "self_satisfaction") {
    const rating = parseRating(fields.overall_satisfaction);
    if (rating == null) throw new Error("Rating must be a number from 1 to 5.");
    self.overallSatisfaction = rating;
  } else if (step === "self_contributions_did_well") {
    self.keyContributions = requireText(
      fields.key_contributions,
      PROJECT_EVAL_FIELD_LABELS.keyContributions,
    );
    self.didWell = requireText(fields.did_well, PROJECT_EVAL_FIELD_LABELS.didWell);
  } else if (step === "self_challenges_improvement") {
    self.challenges = requireText(fields.challenges, PROJECT_EVAL_FIELD_LABELS.challenges);
    self.couldDoBetter = requireText(
      fields.could_do_better,
      PROJECT_EVAL_FIELD_LABELS.couldDoBetter,
    );
  } else if (step === "self_learned_comments") {
    self.learned = requireText(fields.learned, PROJECT_EVAL_FIELD_LABELS.learned);
    self.additionalComments = fields.additional_comments?.trim() || undefined;
  } else if (step === "team_name" || step === "extra") {
    pending.evaluateeName = requireText(fields.name, PROJECT_EVAL_FIELD_LABELS.evaluateeName);
    if (!pending.role && !state.pendingRole) {
      throw new Error("Select a role before entering the team member name.");
    }
    pending.role = pending.role ?? state.pendingRole;
  } else if (step === "team_qualitative") {
    pending.didWell = requireText(fields.did_well, PROJECT_EVAL_FIELD_LABELS.teamDidWell);
    pending.couldDoBetter = requireText(
      fields.could_do_better,
      PROJECT_EVAL_FIELD_LABELS.teamCouldDoBetter,
    );
  } else if (step === "team_ratings") {
    const communication = parseRating(fields.communication);
    const collaboration = parseRating(fields.collaboration);
    const problemSolving = parseRating(fields.problem_solving);
    const overall = parseRating(fields.overall);
    if (
      communication == null ||
      collaboration == null ||
      problemSolving == null ||
      overall == null
    ) {
      throw new Error("All ratings must be numbers from 1 to 5.");
    }
    pending.communicationRating = communication;
    pending.collaborationRating = collaboration;
    pending.problemSolvingRating = problemSolving;
    pending.overallRating = overall;
  } else if (step === "team_comments") {
    pending.additionalComments = fields.additional_comments?.trim() || undefined;
    state = finalizePendingTeamEval(
      { ...state, projectSelfEval: self, pendingTeamEval: pending },
      pending,
    );
    const updated = await updateSession(session.id, {
      state,
      current_step: editing ? "review" : step,
    });
    return { session: updated, editing };
  }

  state = {
    ...state,
    projectSelfEval: self,
    pendingTeamEval: PROJECT_TEAM_STEPS.includes(step) || step === "extra" ? pending : state.pendingTeamEval,
    pendingRole: step === "team_name" || step === "extra" ? pending.role : state.pendingRole,
  };

  const updated = await updateSession(session.id, {
    state,
    current_step: editing ? "review" : step,
  });
  return { session: updated, editing };
}

export async function handleProjectEvalDiscordInteraction(
  interaction: DiscordInteractionPayload,
  options: {
    session: WellbeingSession;
    copy: WellbeingCopyContext | null;
  },
): Promise<boolean> {
  const actionId = interaction.data?.custom_id ?? "";
  const { session, copy } = options;

  if (interaction.type === 3) {
    const role = parseTeamMemberRole(actionId);
    if (role) {
      const modalStep: ProjectEvalStep =
        (session.state.teamEvaluations?.length ?? 0) > 0 ? "extra" : "team_name";
      await updateSession(session.id, {
        state: {
          ...session.state,
          pendingRole: role,
          pendingTeamEval: { role },
        },
        current_step: modalStep,
      });
      await openProjectModal(interaction, modalStep);
      return true;
    }

    if (actionId === "wellbeing:more:yes") {
      await sendInteractionFollowup(interaction.token, {
        content: "Select this team member's role:",
        components: roleSelectionRow(),
      });
      await updateSession(session.id, { current_step: "role_select" });
      return true;
    }

    if (actionId === "wellbeing:more:no") {
      const teamCount = session.state.teamEvaluations?.length ?? 0;
      if (teamCount < 1) {
        await sendInteractionFollowup(interaction.token, {
          content: "Please evaluate at least one team member before continuing.",
        });
        return true;
      }
      const updated = await updateSession(session.id, { current_step: "review" });
      await promptProjectNext(interaction, updated, copy, "review");
      return true;
    }

    if (actionId === "wellbeing:finalize") {
      const teamCount = session.state.teamEvaluations?.length ?? 0;
      if (teamCount < 1) {
        await sendInteractionFollowup(interaction.token, {
          content: "Please evaluate at least one team member before submitting.",
        });
        return true;
      }
      const fresh = await updateSession(session.id, { current_step: "complete" });
      await promptProjectNext(interaction, fresh, copy, "done");
      return true;
    }

    const openStep = actionId.match(/^wellbeing:(?:open|edit):(.+)$/)?.[1];
    if (openStep && (PROJECT_SELF_STEPS.includes(openStep as ProjectEvalStep) || PROJECT_TEAM_STEPS.includes(openStep as ProjectEvalStep) || openStep === "extra")) {
      if (openStep === "team_name" || PROJECT_TEAM_STEPS.includes(openStep as ProjectEvalStep)) {
        await sendInteractionFollowup(interaction.token, {
          content: "Select this team member's role:",
          components: roleSelectionRow(),
        });
        await updateSession(session.id, { current_step: "role_select" });
        return true;
      }
      await openProjectModal(interaction, openStep as ProjectEvalStep);
      return true;
    }
  }

  if (interaction.type === 5) {
    const step = parseProjectEvalStep(actionId);
    if (!step) return false;

    const fields = parseModalFieldValues(interaction);
    const { session: updated, editing } = await applyProjectModalSubmit(session, step, fields);

    if (editing) {
      await promptProjectNext(interaction, updated, copy, "review", true);
      return true;
    }

    const next = nextProjectEvalStep(step);
    await promptProjectNext(interaction, updated, copy, next);
    return true;
  }

  return false;
}

export function getProjectEvalFirstStep(): ProjectEvalStep {
  return "project_name";
}

export function getProjectEvalFirstOpenAction(): string {
  return projectOpenActionId("project_name");
}
