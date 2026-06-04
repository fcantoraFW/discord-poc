"use server";

import { revalidatePath } from "next/cache";
import { canManageOrganization } from "@/lib/auth/roles";
import { requireOrgManagerFor, requireProfile, requireSuperAdmin } from "@/lib/auth/profile";
import {
  registerGuildSlashCommands,
  refreshSlashCommandsForOrg,
} from "@/lib/discord/register-slash";
import { getAppUrl } from "@/lib/discord/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertCanManageOrg(organizationId: string) {
  const profile = await requireProfile();
  if (!canManageOrganization(profile, organizationId)) {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function createOrgAssistant(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");
  await assertCanManageOrg(organizationId);

  const name = String(formData.get("name") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "");
  const context = String(formData.get("context") ?? "");
  if (!name) throw new Error("Name is required");

  const admin = createAdminClient();
  const { error } = await admin.from("assistants").insert({
    organization_id: organizationId,
    name,
    instructions,
    context,
  });
  if (error) throw new Error(error.message);

  await refreshSlashCommandsForOrg(organizationId);
  revalidatePath("/manage");
  revalidatePath("/manage/assistants");
  revalidatePath(`/admin/orgs/${organizationId}`);
}

export async function inviteOrgMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");
  await assertCanManageOrg(organizationId);

  const email = String(formData.get("email") ?? "").trim();
  if (!email) throw new Error("Missing email");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAppUrl()}/auth/confirm`,
  });
  if (error) throw new Error(error.message);

  if (data.user) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ organization_id: organizationId, role: "member" })
      .eq("id", data.user.id);
    if (profileError) throw new Error(profileError.message);
  }

  revalidatePath("/manage");
  revalidatePath("/manage/members");
  revalidatePath(`/admin/orgs/${organizationId}`);
}

export async function removeOrgMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");
  await assertCanManageOrg(organizationId);

  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) throw new Error("Missing profile");

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", profileId)
    .single();

  if (!target || target.organization_id !== organizationId) {
    throw new Error("Member not in this organization");
  }
  if (target.role !== "member") {
    throw new Error("Solo podés quitar members");
  }

  const { error } = await admin
    .from("profiles")
    .update({ organization_id: null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/manage");
  revalidatePath("/manage/members");
}

export async function linkOrgDiscordGuild(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");
  await assertCanManageOrg(organizationId);

  const guildId = String(formData.get("guild_id") ?? "");
  const defaultAssistantId = String(formData.get("default_assistant_id") ?? "");
  if (!guildId || !defaultAssistantId) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { error } = await admin.from("discord_guild_links").upsert({
    guild_id: guildId,
    organization_id: organizationId,
    default_assistant_id: defaultAssistantId,
  });
  if (error) throw new Error(error.message);

  await registerGuildSlashCommands(guildId, organizationId);
  revalidatePath("/manage");
  revalidatePath("/manage/discord");
  revalidatePath("/admin/discord");
}

export async function inviteOrgAdmin(formData: FormData) {
  await requireSuperAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!email || !organizationId) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAppUrl()}/auth/confirm`,
  });
  if (error) throw new Error(error.message);

  if (data.user) {
    await admin
      .from("profiles")
      .update({ organization_id: organizationId, role: "admin" })
      .eq("id", data.user.id);
  }

  revalidatePath(`/admin/orgs/${organizationId}`);
}

export async function promoteMemberToAdmin(formData: FormData) {
  await requireSuperAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!profileId || !organizationId) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "admin", organization_id: organizationId })
    .eq("id", profileId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/orgs/${organizationId}`);
  revalidatePath("/manage");
}

export async function demoteAdminToMember(formData: FormData) {
  await requireSuperAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!profileId || !organizationId) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "member" })
    .eq("id", profileId)
    .eq("organization_id", organizationId)
    .eq("role", "admin");
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/orgs/${organizationId}`);
}
