import { Actions, Button, Card, CardText as Text } from "chat";
import type { WellbeingCampaignType, WellbeingPillar, WellbeingRelationship } from "@/lib/types/database";
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
    title: "Wellbeing survey",
    children: [
      Text(getConsentMessage()),
      Actions([
        Button({
          id: "wellbeing:consent:accept",
          label: "I agree to continue",
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
      Text("_Rate from 1 (very poor) to 5 (excellent)._"),
      Actions(ratingButtons(`wellbeing:rate:${pillar}`)),
    ],
  });
}

export function commentPromptCard(context: string) {
  return Card({
    title: "Optional comment",
    children: [
      Text(`Would you like to add a comment about **${context}**?`),
      Actions([
        Button({
          id: "wellbeing:comment:yes",
          label: "Add comment",
          style: "primary",
        }),
        Button({
          id: "wellbeing:comment:skip",
          label: "Skip",
        }),
      ]),
    ],
  });
}

export function textInputPrompt(message: string) {
  return Card({
    title: "Your response",
    children: [Text(message)],
  });
}

export function peerNamePrompt() {
  return textInputPrompt(
    "Enter the **name** of a teammate you would like to evaluate (1–5).",
  );
}

export function leaderNamePrompt() {
  return textInputPrompt(
    "Enter the **name** of your manager or leader you would like to evaluate (1–5).",
  );
}

export function personRatingCard(relationship: WellbeingRelationship, name: string) {
  const rel = RELATIONSHIP_LABELS[relationship];
  return Card({
    title: `Evaluation: ${name}`,
    children: [
      Text(`How would you rate **${name}** as a ${rel}?`),
      Actions(ratingButtons(`wellbeing:person_rate:${relationship}`)),
    ],
  });
}

export function moreEvalPromptCard() {
  return Card({
    title: "Evaluate someone else?",
    children: [
      Text("Would you like to evaluate another person before finishing?"),
      Actions([
        Button({
          id: "wellbeing:more_eval:yes",
          label: "Yes, evaluate someone else",
          style: "primary",
        }),
        Button({
          id: "wellbeing:more_eval:no",
          label: "No, finish survey",
        }),
      ]),
    ],
  });
}

export function extraRelationshipCard() {
  return Card({
    title: "Evaluation type",
    children: [
      Text("Is this person a teammate or a manager?"),
      Actions([
        Button({
          id: "wellbeing:relationship:peer",
          label: "Teammate",
          style: "primary",
        }),
        Button({
          id: "wellbeing:relationship:leader",
          label: "Manager / leader",
        }),
      ]),
    ],
  });
}

export function extraNamePrompt(relationship: WellbeingRelationship) {
  const rel = RELATIONSHIP_LABELS[relationship];
  return textInputPrompt(`Enter the **name** of the ${rel} you want to evaluate.`);
}

export function campaignStartCard(
  campaignName: string,
  campaignId: string,
  campaignType: WellbeingCampaignType = "wellbeing",
) {
  const intro =
    campaignType === "project_evaluation"
      ? "Your organization invites you to complete a project evaluation survey. Your feedback is confidential and helps improve team performance."
      : "Your organization invites you to complete a brief wellbeing survey. Your feedback is confidential and helps improve the workplace experience.";

  return Card({
    title: campaignName,
    children: [
      Text(intro),
      Actions([
        Button({
          id: `wellbeing:campaign:start:${campaignId}`,
          label: "Start survey",
          style: "primary",
        }),
      ]),
    ],
  });
}
