"use server";

import { revalidatePath } from "next/cache";
import { canManageOrganization } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/profile";
import { setWellbeingAssistant, provisionWellbeingAssistant } from "@/lib/wellbeing/assistant-config";

export async function updateWellbeingAssistant(
  organizationId: string,
  assistantId: string | null,
) {
  const profile = await requireProfile();
  if (!canManageOrganization(profile, organizationId)) {
    throw new Error("Forbidden");
  }

  await setWellbeingAssistant(organizationId, assistantId);
  revalidatePath("/manage/wellbeing");
}

export async function createWellbeingAssistantFromTemplate(organizationId: string) {
  const profile = await requireProfile();
  if (!canManageOrganization(profile, organizationId)) {
    throw new Error("Forbidden");
  }

  const result = await provisionWellbeingAssistant(organizationId);
  revalidatePath("/manage/wellbeing");
  revalidatePath("/manage/assistants");
  return result;
}
