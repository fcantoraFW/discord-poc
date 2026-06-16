import type { WellbeingPillar, WellbeingRelationship } from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";

export const WELLBEING_PILLARS: WellbeingPillar[] = [
  "workload",
  "climate",
  "wellbeing",
  "recognition",
];

export const PILLAR_LABELS: Record<WellbeingPillar, string> = {
  workload: "Workload",
  climate: "Work climate & relationships",
  wellbeing: "Emotional & physical wellbeing",
  recognition: "Recognition & development",
};

export const PILLAR_QUESTIONS: Record<WellbeingPillar, string> = {
  workload:
    "How would you rate the balance between your assigned tasks and available time?",
  climate:
    "How would you rate communication with your leader and dynamics with your team?",
  wellbeing:
    "How would you rate your stress level and perceived support from the company?",
  recognition:
    "How would you rate the recognition you receive and your growth opportunities?",
};

export const RELATIONSHIP_LABELS: Record<WellbeingRelationship, string> = {
  peer: "teammate",
  leader: "manager / leader",
};

export function getPaeResourcesText(): string {
  const url = process.env.WELLBEING_PAE_URL?.trim();
  const text =
    process.env.WELLBEING_PAE_TEXT?.trim() ??
    "If you need support, contact your organization's Employee Assistance Program (EAP).";
  if (url) {
    return `${text}\n\nResources: ${url}`;
  }
  return text;
}

type CopyInput = Pick<WellbeingCopyContext, "assistantName" | "orgName" | "instructions" | "context">;

export function getConsentMessage(copy?: CopyInput): string {
  const assistantName = copy?.assistantName ?? "your organizational wellbeing assistant";
  const orgLine = copy?.orgName ? ` at **${copy.orgName}**` : "";
  const intro = copy?.instructions?.trim()
    ? copy.instructions.trim()
    : [
        `Hi, I'm **${assistantName}**${orgLine}.`,
        "",
        "**Purpose:** collect information about your work experience to help HR improve the workplace and prevent burnout.",
        "",
        "**Confidentiality:** your information will be handled privately by the People team.",
        "",
        "**Important:** I do not provide mental health diagnoses. If you're going through a difficult time, I'll point you to support resources when you finish.",
      ].join("\n");

  const contextBlock = copy?.context?.trim()
    ? `\n\n${copy.context.trim()}`
    : "";

  return [
    intro,
    contextBlock,
    "",
    "The survey takes a few minutes. Rate each section from 1 to 5 and you can add optional comments.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getClosingMessage(copy?: CopyInput): string {
  const orgLine = copy?.orgName ? ` Your feedback helps **${copy.orgName}**.` : "";
  return [
    `Thank you for completing the survey!${orgLine}`,
    "",
    getPaeResourcesText(),
  ].join("\n");
}

export const RATING_LABELS: Record<number, string> = {
  1: "1 — Very poor",
  2: "2 — Poor",
  3: "3 — Fair",
  4: "4 — Good",
  5: "5 — Excellent",
};
