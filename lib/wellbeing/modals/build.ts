import type { WellbeingPillar, WellbeingRelationship } from "@/lib/types/database";
import { PILLAR_LABELS, PILLAR_QUESTIONS } from "@/lib/wellbeing/template";
import { RESPONSE_MODAL } from "@/lib/wellbeing/discord-api";

export type ModalWizardStep =
  | WellbeingPillar
  | "peer"
  | "leader"
  | "extra"
  | "review";

export const PILLAR_MODAL_STEPS: WellbeingPillar[] = [
  "workload",
  "climate",
  "wellbeing",
  "recognition",
];

export function modalCustomId(step: ModalWizardStep): string {
  return `wellbeing:modal:${step}`;
}

export function openActionId(step: ModalWizardStep): string {
  return `wellbeing:open:${step}`;
}

export function editActionId(step: ModalWizardStep): string {
  return `wellbeing:edit:${step}`;
}

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

export function buildWizardModal(step: ModalWizardStep): { type: typeof RESPONSE_MODAL; data: unknown } {
  if (PILLAR_MODAL_STEPS.includes(step as WellbeingPillar)) {
    const pillar = step as WellbeingPillar;
    const title = PILLAR_LABELS[pillar].slice(0, 45);
    const question = PILLAR_QUESTIONS[pillar];
    return {
      type: RESPONSE_MODAL,
      data: {
        custom_id: modalCustomId(step),
        title,
        components: [
          modalRow(
            textInput("rating", "Calificación (1-5)", {
              required: true,
              placeholder: "1 = muy mal, 5 = excelente",
              maxLength: 1,
            }),
          ),
          modalRow(
            textInput("comment", "Comentario opcional", {
              required: false,
              multiline: true,
              placeholder: question.slice(0, 100),
            }),
          ),
        ],
      },
    };
  }

  if (step === "peer" || step === "leader" || step === "extra") {
    const rel = step === "leader" ? "superior/líder" : "compañero/a";
    return {
      type: RESPONSE_MODAL,
      data: {
        custom_id: modalCustomId(step),
        title: step === "extra" ? "Evaluar otra persona" : `Evaluar ${rel}`.slice(0, 45),
        components: [
          modalRow(
            textInput("name", "Nombre", { required: true, placeholder: "Nombre de la persona" }),
          ),
          modalRow(
            textInput("rating", "Calificación (1-5)", { required: true, maxLength: 1 }),
          ),
          modalRow(
            textInput("comment", "Comentario opcional", { required: false, multiline: true }),
          ),
        ],
      },
    };
  }

  throw new Error(`No modal for step: ${step}`);
}

export function parseRating(value: string | undefined): number | null {
  const n = Number(value?.trim());
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

export function relationshipForPersonStep(step: ModalWizardStep): WellbeingRelationship | null {
  if (step === "peer") return "peer";
  if (step === "leader") return "leader";
  if (step === "extra") return null;
  return null;
}

export function nextWizardStep(current: ModalWizardStep): ModalWizardStep | "more_eval" | "review" | "done" {
  const pillarIdx = PILLAR_MODAL_STEPS.indexOf(current as WellbeingPillar);
  if (pillarIdx >= 0 && pillarIdx < PILLAR_MODAL_STEPS.length - 1) {
    return PILLAR_MODAL_STEPS[pillarIdx + 1]!;
  }
  if (pillarIdx === PILLAR_MODAL_STEPS.length - 1) return "peer";
  if (current === "peer") return "leader";
  if (current === "leader") return "more_eval";
  if (current === "extra") return "more_eval";
  return "review";
}

export function continueButtonRow(actionId: string, label: string) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: label.slice(0, 80),
          custom_id: actionId,
        },
      ],
    },
  ];
}

export function yesNoRow(yesId: string, noId: string) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Sí, evaluar a alguien más", custom_id: yesId },
        { type: 2, style: 2, label: "No, ver resumen", custom_id: noId },
      ],
    },
  ];
}
