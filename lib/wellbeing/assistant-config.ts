import { loadAssistantBundle } from "@/lib/chat/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildWellbeingAssistantTemplate,
  WELLBEING_ASSISTANT_NAME,
} from "@/lib/wellbeing/default-assistant-template";

export type WellbeingCopyContext = {
  assistantName: string;
  orgName: string;
  instructions: string;
  context: string;
};

export async function getWellbeingCopyContext(
  organizationId: string,
): Promise<WellbeingCopyContext | null> {
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, wellbeing_assistant_id")
    .eq("id", organizationId)
    .single();

  if (!org) return null;

  const assistantId = org.wellbeing_assistant_id as string | null;
  if (!assistantId) return null;

  const bundle = await loadAssistantBundle(assistantId);
  if (!bundle || bundle.orgId !== organizationId) return null;

  return {
    assistantName: bundle.assistantName,
    orgName: bundle.orgName,
    instructions: bundle.instructions,
    context: bundle.context,
  };
}

export async function setWellbeingAssistant(
  organizationId: string,
  assistantId: string | null,
): Promise<void> {
  const admin = createAdminClient();

  if (assistantId) {
    const { data: assistant } = await admin
      .from("assistants")
      .select("id")
      .eq("id", assistantId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!assistant) throw new Error("Asistente inválido para esta organización");
  }

  const { error } = await admin
    .from("organizations")
    .update({ wellbeing_assistant_id: assistantId })
    .eq("id", organizationId);

  if (error) throw new Error(error.message);
}

export async function listOrgAssistantsForWellbeing(organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("assistants")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
}

/** Crea un asistente RRHH (instructions + context) y lo asigna como wellbeing_assistant_id. */
export async function provisionWellbeingAssistant(
  organizationId: string,
): Promise<{ assistantId: string; created: boolean }> {
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, wellbeing_assistant_id")
    .eq("id", organizationId)
    .single();

  if (!org) throw new Error("Organización no encontrada");

  if (org.wellbeing_assistant_id) {
    return { assistantId: org.wellbeing_assistant_id as string, created: false };
  }

  const { data: existing } = await admin
    .from("assistants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", WELLBEING_ASSISTANT_NAME)
    .maybeSingle();

  if (existing) {
    await setWellbeingAssistant(organizationId, existing.id);
    return { assistantId: existing.id, created: false };
  }

  const template = buildWellbeingAssistantTemplate(org.name as string);
  const { data: assistant, error } = await admin
    .from("assistants")
    .insert({
      organization_id: organizationId,
      name: template.name,
      instructions: template.instructions,
      context: template.context,
    })
    .select("id")
    .single();

  if (error || !assistant) {
    throw new Error(error?.message ?? "No se pudo crear el asistente de bienestar");
  }

  await setWellbeingAssistant(organizationId, assistant.id);
  return { assistantId: assistant.id, created: true };
}
