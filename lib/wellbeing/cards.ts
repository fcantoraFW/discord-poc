import { Actions, Button, Card, CardText as Text } from "chat";
import type { WellbeingPillar, WellbeingRelationship } from "@/lib/types/database";
import {
  getConsentMessage,
  PILLAR_LABELS,
  PILLAR_QUESTIONS,
  RATING_LABELS,
  RELATIONSHIP_LABELS,
} from "@/lib/wellbeing/template";

function ratingButtons(prefix: string) {
  return [1, 2, 3, 4, 5].map((n) =>
    Button({
      id: `${prefix}:${n}`,
      label: RATING_LABELS[n] ?? String(n),
      style: n >= 4 ? "primary" : "default",
    }),
  );
}

export function consentCard() {
  return Card({
    title: "Encuesta de bienestar",
    children: [
      Text(getConsentMessage()),
      Actions([
        Button({
          id: "wellbeing:consent:accept",
          label: "Acepto continuar",
          style: "primary",
        }),
      ]),
    ],
  });
}

export function pillarRatingCard(pillar: WellbeingPillar) {
  return Card({
    title: PILLAR_LABELS[pillar],
    children: [
      Text(PILLAR_QUESTIONS[pillar]),
      Text("_Calificá del 1 (muy mal) al 5 (excelente)._"),
      Actions(ratingButtons(`wellbeing:rate:${pillar}`)),
    ],
  });
}

export function commentPromptCard(context: string) {
  return Card({
    title: "Comentario opcional",
    children: [
      Text(`¿Querés agregar un comentario sobre **${context}**?`),
      Actions([
        Button({
          id: "wellbeing:comment:yes",
          label: "Agregar comentario",
          style: "primary",
        }),
        Button({
          id: "wellbeing:comment:skip",
          label: "Omitir",
        }),
      ]),
    ],
  });
}

export function textInputPrompt(message: string) {
  return Card({
    title: "Tu respuesta",
    children: [Text(message)],
  });
}

export function peerNamePrompt() {
  return textInputPrompt(
    "Escribí el **nombre** de un compañero/a de equipo que quieras evaluar (1–5).",
  );
}

export function leaderNamePrompt() {
  return textInputPrompt(
    "Escribí el **nombre** de tu superior o líder directo que quieras evaluar (1–5).",
  );
}

export function personRatingCard(relationship: WellbeingRelationship, name: string) {
  const rel = RELATIONSHIP_LABELS[relationship];
  return Card({
    title: `Evaluación: ${name}`,
    children: [
      Text(`¿Cómo calificarías a **${name}** como ${rel}?`),
      Actions(ratingButtons(`wellbeing:person_rate:${relationship}`)),
    ],
  });
}

export function moreEvalPromptCard() {
  return Card({
    title: "¿Evaluar a alguien más?",
    children: [
      Text("¿Querés evaluar a otra persona antes de finalizar?"),
      Actions([
        Button({
          id: "wellbeing:more_eval:yes",
          label: "Sí, evaluar a alguien más",
          style: "primary",
        }),
        Button({
          id: "wellbeing:more_eval:no",
          label: "No, finalizar encuesta",
        }),
      ]),
    ],
  });
}

export function extraRelationshipCard() {
  return Card({
    title: "Tipo de evaluación",
    children: [
      Text("¿Esta persona es un compañero/a o un superior?"),
      Actions([
        Button({
          id: "wellbeing:relationship:peer",
          label: "Compañero/a",
          style: "primary",
        }),
        Button({
          id: "wellbeing:relationship:leader",
          label: "Superior / líder",
        }),
      ]),
    ],
  });
}

export function extraNamePrompt(relationship: WellbeingRelationship) {
  const rel = RELATIONSHIP_LABELS[relationship];
  return textInputPrompt(`Escribí el **nombre** del ${rel} que querés evaluar.`);
}

export function campaignStartCard(campaignName: string, campaignId: string) {
  return Card({
    title: campaignName,
    children: [
      Text(
        "Tu organización te invita a completar una breve encuesta de bienestar. Tu feedback es confidencial y ayuda a mejorar la experiencia laboral.",
      ),
      Actions([
        Button({
          id: `wellbeing:campaign:start:${campaignId}`,
          label: "Comenzar encuesta",
          style: "primary",
        }),
      ]),
    ],
  });
}
