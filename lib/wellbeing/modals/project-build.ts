import type { TeamMemberRole } from "@/lib/types/database";
import { RESPONSE_MODAL } from "@/lib/wellbeing/discord-api";
import {
  PROJECT_EVAL_FIELD_LABELS,
  PROJECT_EVAL_PLACEHOLDERS,
  TEAM_MEMBER_ROLE_LABELS,
  TEAM_MEMBER_ROLES,
} from "@/lib/wellbeing/project-eval-template";
import { continueButtonRow, parseRating, yesNoRow } from "@/lib/wellbeing/modals/build";

export type ProjectEvalStep =
  | "project_name"
  | "self_satisfaction"
  | "self_contributions_did_well"
  | "self_challenges_improvement"
  | "self_learned_comments"
  | "team_name"
  | "team_qualitative"
  | "team_ratings"
  | "team_comments"
  | "extra"
  | "review";

export const PROJECT_SELF_STEPS: ProjectEvalStep[] = [
  "project_name",
  "self_satisfaction",
  "self_contributions_did_well",
  "self_challenges_improvement",
  "self_learned_comments",
];

export const PROJECT_TEAM_STEPS: ProjectEvalStep[] = [
  "team_name",
  "team_qualitative",
  "team_ratings",
  "team_comments",
];

function textInput(
  customId: string,
  label: string,
  options: { required?: boolean; placeholder?: string; multiline?: boolean; maxLength?: number },
) {
  return {
    type: 4,
    custom_id: customId,
    label: label.slice(0, 45),
    style: options.multiline ? 2 : 1,
    required: options.required ?? false,
    placeholder: options.placeholder?.slice(0, 100),
    max_length: options.maxLength ?? (options.multiline ? 500 : 100),
  };
}

function modalRow(...components: unknown[]) {
  return { type: 1, components };
}

export function projectModalCustomId(step: ProjectEvalStep): string {
  return `wellbeing:modal:${step}`;
}

export function projectOpenActionId(step: ProjectEvalStep): string {
  return `wellbeing:open:${step}`;
}

export function projectEditActionId(step: ProjectEvalStep): string {
  return `wellbeing:edit:${step}`;
}

export function parseProjectEvalStep(customId: string | undefined): ProjectEvalStep | null {
  const m = customId?.match(/^wellbeing:modal:(.+)$/);
  if (!m) return null;
  const step = m[1] as ProjectEvalStep;
  const valid: ProjectEvalStep[] = [
    "project_name",
    "self_satisfaction",
    "self_contributions_did_well",
    "self_challenges_improvement",
    "self_learned_comments",
    "team_name",
    "team_qualitative",
    "team_ratings",
    "team_comments",
    "extra",
  ];
  return valid.includes(step) ? step : null;
}

export function parseProjectOpenStep(actionId: string): ProjectEvalStep | null {
  const open = actionId.match(/^wellbeing:open:(.+)$/);
  if (open) {
    const step = open[1] as ProjectEvalStep;
    return step === "extra" || PROJECT_SELF_STEPS.includes(step) || PROJECT_TEAM_STEPS.includes(step)
      ? step
      : null;
  }
  const edit = actionId.match(/^wellbeing:edit:(.+)$/);
  if (edit) {
    const step = edit[1] as ProjectEvalStep;
    return step === "extra" || PROJECT_SELF_STEPS.includes(step) || PROJECT_TEAM_STEPS.includes(step)
      ? step
      : null;
  }
  return null;
}

export function parseTeamMemberRole(actionId: string): TeamMemberRole | null {
  const m = actionId.match(/^wellbeing:role:(design|qa|product_manager|jr_dev|sr_dev)$/);
  return m ? (m[1] as TeamMemberRole) : null;
}

export function buildProjectEvalModal(step: ProjectEvalStep): { type: typeof RESPONSE_MODAL; data: unknown } {
  switch (step) {
    case "project_name":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Project evaluation",
          components: [
            modalRow(
              textInput("project_name", PROJECT_EVAL_FIELD_LABELS.projectName, {
                required: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.projectName,
              }),
            ),
          ],
        },
      };
    case "self_satisfaction":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Your performance",
          components: [
            modalRow(
              textInput("overall_satisfaction", PROJECT_EVAL_FIELD_LABELS.overallSatisfaction, {
                required: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.overallSatisfaction,
                maxLength: 1,
              }),
            ),
          ],
        },
      };
    case "self_contributions_did_well":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Contributions & strengths",
          components: [
            modalRow(
              textInput("key_contributions", PROJECT_EVAL_FIELD_LABELS.keyContributions, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.keyContributions,
              }),
            ),
            modalRow(
              textInput("did_well", PROJECT_EVAL_FIELD_LABELS.didWell, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.didWell,
              }),
            ),
          ],
        },
      };
    case "self_challenges_improvement":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Challenges & growth",
          components: [
            modalRow(
              textInput("challenges", PROJECT_EVAL_FIELD_LABELS.challenges, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.challenges,
              }),
            ),
            modalRow(
              textInput("could_do_better", PROJECT_EVAL_FIELD_LABELS.couldDoBetter, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.couldDoBetter,
              }),
            ),
          ],
        },
      };
    case "self_learned_comments":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Learnings & comments",
          components: [
            modalRow(
              textInput("learned", PROJECT_EVAL_FIELD_LABELS.learned, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.learned,
              }),
            ),
            modalRow(
              textInput("additional_comments", PROJECT_EVAL_FIELD_LABELS.additionalComments, {
                required: false,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.additionalComments,
              }),
            ),
          ],
        },
      };
    case "team_name":
    case "extra":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step === "extra" ? "extra" : "team_name"),
          title: "Team member",
          components: [
            modalRow(
              textInput("name", PROJECT_EVAL_FIELD_LABELS.evaluateeName, {
                required: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.evaluateeName,
              }),
            ),
          ],
        },
      };
    case "team_qualitative":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Team member feedback",
          components: [
            modalRow(
              textInput("did_well", PROJECT_EVAL_FIELD_LABELS.teamDidWell, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.teamDidWell,
              }),
            ),
            modalRow(
              textInput("could_do_better", PROJECT_EVAL_FIELD_LABELS.teamCouldDoBetter, {
                required: true,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.teamCouldDoBetter,
              }),
            ),
          ],
        },
      };
    case "team_ratings":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Team member ratings",
          components: [
            modalRow(
              textInput("communication", PROJECT_EVAL_FIELD_LABELS.communication, {
                required: true,
                maxLength: 1,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.rating,
              }),
            ),
            modalRow(
              textInput("collaboration", PROJECT_EVAL_FIELD_LABELS.collaboration, {
                required: true,
                maxLength: 1,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.rating,
              }),
            ),
            modalRow(
              textInput("problem_solving", PROJECT_EVAL_FIELD_LABELS.problemSolving, {
                required: true,
                maxLength: 1,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.rating,
              }),
            ),
            modalRow(
              textInput("overall", PROJECT_EVAL_FIELD_LABELS.overall, {
                required: true,
                maxLength: 1,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.rating,
              }),
            ),
          ],
        },
      };
    case "team_comments":
      return {
        type: RESPONSE_MODAL,
        data: {
          custom_id: projectModalCustomId(step),
          title: "Additional comments",
          components: [
            modalRow(
              textInput("additional_comments", PROJECT_EVAL_FIELD_LABELS.additionalComments, {
                required: false,
                multiline: true,
                placeholder: PROJECT_EVAL_PLACEHOLDERS.additionalComments,
              }),
            ),
          ],
        },
      };
    default:
      throw new Error(`No modal for step: ${step}`);
  }
}

export function roleSelectionRow() {
  return [
    {
      type: 1,
      components: TEAM_MEMBER_ROLES.slice(0, 3).map((role) => ({
        type: 2,
        style: 1,
        label: TEAM_MEMBER_ROLE_LABELS[role].slice(0, 80),
        custom_id: `wellbeing:role:${role}`,
      })),
    },
    {
      type: 1,
      components: TEAM_MEMBER_ROLES.slice(3).map((role) => ({
        type: 2,
        style: 2,
        label: TEAM_MEMBER_ROLE_LABELS[role].slice(0, 80),
        custom_id: `wellbeing:role:${role}`,
      })),
    },
  ];
}

export function nextProjectEvalStep(
  current: ProjectEvalStep,
): ProjectEvalStep | "role_select" | "more_eval" | "review" | "done" {
  const selfIdx = PROJECT_SELF_STEPS.indexOf(current);
  if (selfIdx >= 0 && selfIdx < PROJECT_SELF_STEPS.length - 1) {
    return PROJECT_SELF_STEPS[selfIdx + 1]!;
  }
  if (selfIdx === PROJECT_SELF_STEPS.length - 1) return "role_select";

  const teamIdx = PROJECT_TEAM_STEPS.indexOf(current);
  if (teamIdx >= 0 && teamIdx < PROJECT_TEAM_STEPS.length - 1) {
    return PROJECT_TEAM_STEPS[teamIdx + 1]!;
  }
  if (teamIdx === PROJECT_TEAM_STEPS.length - 1) return "more_eval";
  if (current === "extra") return "team_qualitative";

  return "review";
}

export { continueButtonRow, parseRating, yesNoRow };

export function projectYesNoRow() {
  return yesNoRow("wellbeing:more:yes", "wellbeing:more:no");
}
