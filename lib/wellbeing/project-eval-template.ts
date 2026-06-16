import type { TeamMemberRole } from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";

export const TEAM_MEMBER_ROLES: TeamMemberRole[] = [
  "design",
  "qa",
  "product_manager",
  "jr_dev",
  "sr_dev",
];

export const TEAM_MEMBER_ROLE_LABELS: Record<TeamMemberRole, string> = {
  design: "Design",
  qa: "QA",
  product_manager: "Product Manager",
  jr_dev: "JR Dev",
  sr_dev: "SR Dev",
};

type CopyInput = Pick<WellbeingCopyContext, "assistantName" | "orgName" | "instructions" | "context">;

export function getProjectEvalConsentMessage(copy?: CopyInput): string {
  const orgLine = copy?.orgName ? ` at **${copy.orgName}**` : "";
  const intro = copy?.instructions?.trim()
    ? copy.instructions.trim()
    : [
        `Hello! You've been invited to complete a **project evaluation survey**${orgLine}.`,
        "",
        "**Purpose:** reflect on your project performance and provide constructive feedback on teammates.",
        "",
        "**Confidentiality:** your responses are handled privately by the People team.",
      ].join("\n");

  const contextBlock = copy?.context?.trim() ? `\n\n${copy.context.trim()}` : "";

  return [
    intro,
    contextBlock,
    "",
    "This survey takes a few minutes. You'll rate items from 1 to 5 and can add optional comments.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getProjectEvalClosingMessage(copy?: CopyInput): string {
  const orgLine = copy?.orgName ? ` Your feedback helps **${copy.orgName}** improve.` : "";
  return `Thank you for completing the project evaluation survey!${orgLine}`;
}

export const PROJECT_EVAL_FIELD_LABELS = {
  projectName: "Project name",
  overallSatisfaction: "Overall satisfaction (1-5)",
  keyContributions: "Key contributions",
  didWell: "What you did well",
  challenges: "Challenges faced",
  couldDoBetter: "What you could do better",
  learned: "What you learned",
  additionalComments: "Additional comments",
  evaluateeName: "Name",
  role: "Role",
  teamDidWell: "What they did well",
  teamCouldDoBetter: "What they could do better",
  communication: "Communication (1-5)",
  collaboration: "Collaboration (1-5)",
  problemSolving: "Problem solving (1-5)",
  overall: "Overall performance (1-5)",
} as const;

export const PROJECT_EVAL_PLACEHOLDERS = {
  projectName: "Enter the project name",
  overallSatisfaction: "1 = very dissatisfied, 5 = very satisfied",
  keyContributions: "Be specific, list 3-5 key items",
  didWell: "Focus on specific actions and outcomes",
  challenges: "Be honest and specific",
  couldDoBetter: "Focus on personal growth",
  learned: "Focus on personal growth",
  additionalComments: "Optional",
  evaluateeName: "Team member name",
  teamDidWell: "Be specific, provide examples",
  teamCouldDoBetter: "Be specific, provide constructive feedback",
  rating: "1 to 5",
} as const;

export const PROJECT_EVAL_QUESTIONS = {
  overallSatisfaction:
    "How satisfied are you with your overall performance on this project?",
  keyContributions: "What were your key contributions to this project?",
  didWell: "What did you do particularly well on this project?",
  challenges: "What challenges did you face during this project?",
  couldDoBetter: "What could you have done differently or better on this project?",
  learned: "What did you learn from this project that you can apply to future projects?",
  teamDidWell: "What did this team member do particularly well on this project?",
  teamCouldDoBetter:
    "What could this role have done differently or better on this project?",
  communication: "How effective was this role's communication throughout the project?",
  collaboration:
    "How effectively did this team member collaborate with you and other team members?",
  problemSolving:
    "How effectively did this team member contribute to solving problems that arose during the project?",
  overall: "Overall, how would you rate this team member's performance on this project?",
} as const;
