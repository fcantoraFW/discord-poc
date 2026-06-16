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
import { handleWellbeingDiscordInteraction } from "@/lib/wellbeing/modals/wizard";
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
    actionId.startsWith("wellbeing:edit:")
  );
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
      content: "Ya completaste la encuesta de esta campaña. ¡Gracias!",
    });
    return { kind: "handled" };
  }

  await sendInteractionFollowup(interaction.token, {
    content: getConsentMessage(copy ?? undefined),
    components: continueButtonRow(openActionId("workload"), "Comenzar encuesta"),
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
      content: "Ya completaste la encuesta de esta campaña. ¡Gracias!",
    });
    return { kind: "handled" };
  }

  return {
    kind: "respond",
    body: buildWizardModal("workload"),
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

    const stepMatch =
      actionId.match(/^wellbeing:open:(\w+)$/) ??
      actionId.match(/^wellbeing:edit:(\w+)$/) ??
      actionId.match(/^wellbeing:open:extra:(peer|leader)$/);

    if (actionId.match(/^wellbeing:open:extra:(peer|leader)$/)) {
      const { findInProgressSession, updateSession } = await import("@/lib/wellbeing/session-store");
      const session = await findInProgressSession(ctx.profile.id, interaction.channel_id);
      if (!session) {
        await deferInteraction(interaction);
        await sendInteractionFollowup(interaction.token, {
          content: "No hay encuesta activa. Usá `/encuesta` o el botón de la campaña.",
        });
        return { kind: "handled" };
      }
      const rel = actionId.endsWith(":leader") ? "leader" : "peer";
      await updateSession(session.id, {
        state: { ...session.state, pendingRelationship: rel },
        current_step: "extra",
      });
      return { kind: "respond", body: buildWizardModal("extra") };
    }

    const step = stepMatch?.[1];
    if (!step || step === "extra") return { kind: "none" };

    const { findInProgressSession } = await import("@/lib/wellbeing/session-store");
    const session = await findInProgressSession(ctx.profile.id, interaction.channel_id);
    if (!session) {
      await deferInteraction(interaction);
      await sendInteractionFollowup(interaction.token, {
        content: "No hay encuesta activa. Usá `/encuesta` o el botón de la campaña.",
      });
      return { kind: "handled" };
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
      content: "No hay encuesta activa. Usá `/encuesta` o el botón de la campaña.",
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
      const msg = err instanceof Error ? err.message : "Error al procesar la encuesta";
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
      content: "No hay encuesta activa. Usá `/encuesta` o el botón de la campaña.",
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
      const msg = err instanceof Error ? err.message : "Error al procesar la encuesta";
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
