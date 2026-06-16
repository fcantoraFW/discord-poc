import type { WellbeingPillar, WellbeingRelationship } from "@/lib/types/database";
import type { WellbeingCopyContext } from "@/lib/wellbeing/assistant-config";

export const WELLBEING_PILLARS: WellbeingPillar[] = [
  "workload",
  "climate",
  "wellbeing",
  "recognition",
];

export const PILLAR_LABELS: Record<WellbeingPillar, string> = {
  workload: "Carga de trabajo",
  climate: "Clima laboral y relaciones",
  wellbeing: "Bienestar emocional y físico",
  recognition: "Reconocimiento y desarrollo",
};

export const PILLAR_QUESTIONS: Record<WellbeingPillar, string> = {
  workload:
    "¿Cómo calificarías el equilibrio entre tus tareas asignadas y el tiempo disponible?",
  climate:
    "¿Cómo calificarías la comunicación con tu líder y la dinámica con tu equipo?",
  wellbeing:
    "¿Cómo calificarías tu nivel de estrés y la percepción de apoyo de la empresa?",
  recognition:
    "¿Cómo calificarías el reconocimiento que recibís y tus oportunidades de crecimiento?",
};

export const RELATIONSHIP_LABELS: Record<WellbeingRelationship, string> = {
  peer: "compañero/a de equipo",
  leader: "superior / líder",
};

export function getPaeResourcesText(): string {
  const url = process.env.WELLBEING_PAE_URL?.trim();
  const text =
    process.env.WELLBEING_PAE_TEXT?.trim() ??
    "Si necesitás apoyo, contactá al programa de asistencia al empleado (PAE) de tu organización.";
  if (url) {
    return `${text}\n\nRecursos: ${url}`;
  }
  return text;
}

type CopyInput = Pick<WellbeingCopyContext, "assistantName" | "orgName" | "instructions" | "context">;

export function getConsentMessage(copy?: CopyInput): string {
  const assistantName = copy?.assistantName ?? "tu asistente de bienestar organizacional";
  const orgLine = copy?.orgName ? ` de **${copy.orgName}**` : "";
  const intro = copy?.instructions?.trim()
    ? copy.instructions.trim()
    : [
        `Hola, soy **${assistantName}**${orgLine}.`,
        "",
        "**Propósito:** recopilar información sobre tu experiencia laboral para ayudar a HR a mejorar el clima y prevenir el agotamiento.",
        "",
        "**Confidencialidad:** tu información será tratada con privacidad por el equipo de People.",
        "",
        "**Importante:** no realizo diagnósticos de salud mental. Si estás pasando por un momento difícil, te orientaré hacia recursos de apoyo al finalizar.",
      ].join("\n");

  const contextBlock = copy?.context?.trim()
    ? `\n\n${copy.context.trim()}`
    : "";

  return [
    intro,
    contextBlock,
    "",
    "La encuesta toma unos minutos. Calificá del 1 al 5 en cada sección y podés agregar comentarios opcionales.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getClosingMessage(copy?: CopyInput): string {
  const orgLine = copy?.orgName ? ` Tu feedback ayuda a **${copy.orgName}**.` : "";
  return [
    `¡Gracias por completar la encuesta!${orgLine}`,
    "",
    getPaeResourcesText(),
  ].join("\n");
}

export const RATING_LABELS: Record<number, string> = {
  1: "1 — Muy mal",
  2: "2 — Mal",
  3: "3 — Regular",
  4: "4 — Bien",
  5: "5 — Excelente",
};
