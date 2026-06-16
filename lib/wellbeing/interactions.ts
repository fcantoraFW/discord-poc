import type { WebhookOptions } from "chat";
import { getWellbeingCopyContext } from "@/lib/wellbeing/assistant-config";
import {
  deferInteraction,
  getInteractionUserId,
  INTERACTION_APPLICATION_COMMAND,
  INTERACTION_MESSAGE_COMPONENT,
  INTERACTION_MODAL_SUBMIT,
  isWellbeingInteraction,
  respondToInteractionCallback,
  sendInteractionFollowup,
  type DiscordInteractionPayload,
} from "@/lib/wellbeing/discord-api";
import {
  beginSurveyFromInteraction,
  resolveProfileContextForInteraction,
} from "@/lib/wellbeing/interaction-context";
import {
  buildWizardModal,
  continueButtonRow,
  openActionId,
} from "@/lib/wellbeing/modals/build";
import { buildProjectEvalModal } from "@/lib/wellbeing/modals/project-build";
import {
  getProjectEvalFirstOpenAction,
  getProjectEvalFirstStep,
} from "@/lib/wellbeing/modals/project-wizard";
import { handleWellbeingDiscordInteraction } from "@/lib/wellbeing/modals/wizard";
import { getProjectEvalConsentMessage } from "@/lib/wellbeing/project-eval-template";
import { getConsentMessage } from "@/lib/wellbeing/template";

export type WellbeingRouteResult =
  | { kind: "none" }
  | { kind: "respond"; body: unknown; after?: () => Promise<void> }
  | { kind: "handled" };

function threadKey(interaction: DiscordInteractionPayload): string {
  return interaction.channel_id ?? "";
}

function isModalOpenAction(actionId: string): boolean {
  return (
    actionId.startsWith("wellbeing:open:") ||
    actionId.startsWith("wellbeing:edit:") ||
    actionId.startsWith("wellbeing:role:")
  );
}

function isProjectEvalSession(session: { state: { campaignType?: string } }): boolean {
  return session.state.campaignType === "project_evaluation";
}

async function handleSlashEncuesta(
  interaction: DiscordInteractionPayload,
): Promise<WellbeingRouteResult> {
  const userId = getInteractionUserId(interaction);
  if (!userId || !interaction.channel_id) return { kind: "none" };

  const ctx = await resolveProfileContextForInteraction(userId, interaction.guild_id ?? null);
  if ("error" in ctx) {
    await deferInteraction(interaction, true);
    await sendInteractionFollowup(interaction.token, { content: ctx.error });
    return { kind: "handled" };
  }

  await deferInteraction(interaction, true);

  const copy = await getWellbeingCopyContext(ctx.organizationId);
  const session = await beginSurveyFromInteraction({
    profile: ctx.profile,
    organizationId: ctx.organizationId,
    discordThreadKey: interaction.channel_id,
    source: "encuesta",
    copy,
  });

  if (!session) {
    await sendInteractionFollowup(interaction.token, {
      content: "You already completed the survey for this campaign. Thank you!",
    });
    return { kind: "handled" };
  }

  const projectEval = isProjectEvalSession(session);
  await sendInteractionFollowup(interaction.token, {
    content: projectEval
      ? getProjectEvalConsentMessage(copy ?? undefined)
      : getConsentMessage(copy ?? undefined),
    components: continueButtonRow(
      projectEval ? getProjectEvalFirstOpenAction() : openActionId("workload"),
      "Start survey",
    ),
  });

  return { kind: "handled" };
}

async function handleCampaignStart(
  interaction: DiscordInteractionPayload,
  campaignId: string,
): Promise<WellbeingRouteResult> {
  const userId = getInteractionUserId(interaction);
  if (!userId || !interaction.channel_id) return { kind: "none" };

  const ctx = await resolveProfileContextForInteraction(userId, interaction.guild_id ?? null);
  if ("error" in ctx) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, { content: ctx.error });
    return { kind: "handled" };
  }

  const copy = await getWellbeingCopyContext(ctx.organizationId);
  const session = await beginSurveyFromInteraction({
    profile: ctx.profile,
    organizationId: ctx.organizationId,
    discordThreadKey: interaction.channel_id,
    source: "campaign",
    campaignId,
    copy,
  });

  if (!session) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, {
      content: "You already completed the survey for this campaign. Thank you!",
    });
    return { kind: "handled" };
  }

  const firstModal = isProjectEvalSession(session)
    ? buildProjectEvalModal(getProjectEvalFirstStep())
    : buildWizardModal("workload");

  return {
    kind: "respond",
    body: firstModal,
  };
}

async function handleComponent(
  interaction: DiscordInteractionPayload,
  options?: WebhookOptions,
): Promise<WellbeingRouteResult> {
  const actionId = interaction.data?.custom_id ?? "";
  const userId = getInteractionUserId(interaction);
  if (!userId || !interaction.channel_id) return { kind: "none" };

  const campaignMatch = actionId.match(/^wellbeing:campaign:start:(.+)$/);
  if (campaignMatch) {
    return handleCampaignStart(interaction, campaignMatch[1]!);
  }

  if (isModalOpenAction(actionId)) {
    const ctx = await resolveProfileContextForInteraction(userId, interaction.guild_id ?? null);
    if ("error" in ctx) {
      await deferInteraction(interaction);
      await sendInteractionFollowup(interaction.token, { content: ctx.error });
      return { kind: "handled" };
    }

    const { findInProgressSession, updateSession } = await import("@/lib/wellbeing/session-store");
    const session = await findInProgressSession(ctx.profile.id, interaction.channel_id);
    if (!session) {
      await deferInteraction(interaction);
      await sendInteractionFollowup(interaction.token, {
        content: "No active survey. Use `/encuesta` or the campaign button.",
      });
      return { kind: "handled" };
    }

    if (actionId.match(/^wellbeing:open:extra:(peer|leader)$/)) {
      const rel = actionId.endsWith(":leader") ? "leader" : "peer";
      await updateSession(session.id, {
        state: { ...session.state, pendingRelationship: rel },
        current_step: "extra",
      });
      return { kind: "respond", body: buildWizardModal("extra") };
    }

    if (actionId.startsWith("wellbeing:role:")) {
      const { parseTeamMemberRole } = await import("@/lib/wellbeing/modals/project-build");
      const role = parseTeamMemberRole(actionId);
      if (role && isProjectEvalSession(session)) {
        const modalStep =
          (session.state.teamEvaluations?.length ?? 0) > 0 ? "extra" : "team_name";
        await updateSession(session.id, {
          state: {
            ...session.state,
            pendingRole: role,
            pendingTeamEval: { role },
          },
          current_step: modalStep,
        });
        return { kind: "respond", body: buildProjectEvalModal(modalStep) };
      }
    }

    const stepMatch =
      actionId.match(/^wellbeing:open:(.+)$/) ?? actionId.match(/^wellbeing:edit:(.+)$/);
    const step = stepMatch?.[1];
    if (!step || step === "extra") return { kind: "none" };

    if (isProjectEvalSession(session)) {
      const { parseProjectOpenStep } = await import("@/lib/wellbeing/modals/project-build");
      const projectStep = parseProjectOpenStep(actionId);
      if (projectStep) {
        if (projectStep === "team_name" && actionId.startsWith("wellbeing:edit:")) {
          await deferInteraction(interaction);
          const copy = await getWellbeingCopyContext(ctx.organizationId);
          const after = async () => {
            await handleWellbeingDiscordInteraction(interaction, {
              session,
              copy,
              organizationId: ctx.organizationId,
            });
          };
          if (options?.waitUntil) options.waitUntil(after());
          else await after();
          return { kind: "handled" };
        }
        return { kind: "respond", body: buildProjectEvalModal(projectStep) };
      }
    }

    return {
      kind: "respond",
      body: buildWizardModal(step as Parameters<typeof buildWizardModal>[0]),
    };
  }

  const ctx = await resolveProfileContextForInteraction(userId, interaction.guild_id ?? null);
  if ("error" in ctx) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, { content: ctx.error });
    return { kind: "handled" };
  }

  const { findInProgressSession } = await import("@/lib/wellbeing/session-store");
  const session = await findInProgressSession(ctx.profile.id, threadKey(interaction));
  if (!session) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, {
      content: "No active survey. Use `/encuesta` or the campaign button.",
    });
    return { kind: "handled" };
  }

  const copy = await getWellbeingCopyContext(ctx.organizationId);

  await deferInteraction(interaction);

  const after = async () => {
    try {
      await handleWellbeingDiscordInteraction(interaction, {
        session,
        copy,
        organizationId: ctx.organizationId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error processing the survey";
      console.error("[wellbeing] component failed", { actionId, error: msg });
      await sendInteractionFollowup(interaction.token, { content: `⚠️ ${msg}` });
    }
  };

  if (options?.waitUntil) {
    options.waitUntil(after());
  } else {
    await after();
  }

  return { kind: "handled" };
}

async function handleModalSubmit(
  interaction: DiscordInteractionPayload,
  options?: WebhookOptions,
): Promise<WellbeingRouteResult> {
  const userId = getInteractionUserId(interaction);
  if (!userId || !interaction.channel_id) return { kind: "none" };

  const ctx = await resolveProfileContextForInteraction(userId, interaction.guild_id ?? null);
  if ("error" in ctx) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, { content: ctx.error });
    return { kind: "handled" };
  }

  const { findInProgressSession } = await import("@/lib/wellbeing/session-store");
  const session = await findInProgressSession(ctx.profile.id, threadKey(interaction));
  if (!session) {
    await deferInteraction(interaction);
    await sendInteractionFollowup(interaction.token, {
      content: "No active survey. Use `/encuesta` or the campaign button.",
    });
    return { kind: "handled" };
  }

  const copy = await getWellbeingCopyContext(ctx.organizationId);
  await deferInteraction(interaction);

  const after = async () => {
    try {
      await handleWellbeingDiscordInteraction(interaction, {
        session,
        copy,
        organizationId: ctx.organizationId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error processing the survey";
      console.error("[wellbeing] modal submit failed", { error: msg });
      await sendInteractionFollowup(interaction.token, { content: `⚠️ ${msg}` });
    }
  };

  if (options?.waitUntil) {
    options.waitUntil(after());
  } else {
    await after();
  }

  return { kind: "handled" };
}

export async function routeWellbeingInteraction(
  interaction: DiscordInteractionPayload,
  options?: WebhookOptions,
): Promise<WellbeingRouteResult> {
  if (!isWellbeingInteraction(interaction)) return { kind: "none" };

  if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
    return handleSlashEncuesta(interaction);
  }

  if (interaction.type === INTERACTION_MESSAGE_COMPONENT) {
    return handleComponent(interaction, options);
  }

  if (interaction.type === INTERACTION_MODAL_SUBMIT) {
    return handleModalSubmit(interaction, options);
  }

  return { kind: "none" };
}

export async function applyWellbeingRouteResult(
  interaction: Pick<DiscordInteractionPayload, "id" | "token">,
  result: WellbeingRouteResult,
  options?: WebhookOptions,
): Promise<boolean> {
  if (result.kind === "none") return false;

  if (result.kind === "respond") {
    await respondToInteractionCallback(interaction, result.body);
    if (result.after) {
      if (options?.waitUntil) options.waitUntil(result.after());
      else await result.after();
    }
    return true;
  }

  return true;
}
