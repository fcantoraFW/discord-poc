"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import {
  registerGuildSlashCommands,
  refreshSlashCommandsForOrg,
} from "@/lib/discord/register-slash";
import { inviteUserToOrganization } from "@/lib/auth/invite";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createOrganization(formData: FormData) {
  await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const admin = createAdminClient();
  const { error } = await admin.from("organizations").insert({
    name,
    slug: slugify(name),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/superadmin");
}

export async function createAssistant(formData: FormData) {
  await requireSuperAdmin();
  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "");
  const context = String(formData.get("context") ?? "");
  if (!organizationId || !name) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { error } = await admin.from("assistants").insert({
    organization_id: organizationId,
    name,
    instructions,
    context,
  });
  if (error) throw new Error(error.message);

  await refreshSlashCommandsForOrg(organizationId);
  revalidatePath("/superadmin");
}

export async function inviteMember(formData: FormData) {
  await requireSuperAdmin();
  const email = String(formData.get("email") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) throw new Error("Missing fields");

  await inviteUserToOrganization({
    email,
    organizationId,
    role: "member",
  });

  revalidatePath("/superadmin");
}

export async function linkDiscordGuild(formData: FormData) {
  await requireSuperAdmin();
  const guildId = String(formData.get("guild_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  const defaultAssistantId = String(formData.get("default_assistant_id") ?? "");
  if (!guildId || !organizationId || !defaultAssistantId) {
    throw new Error("Missing fields");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("discord_guild_links").upsert({
    guild_id: guildId,
    organization_id: organizationId,
    default_assistant_id: defaultAssistantId,
  });
  if (error) throw new Error(error.message);

  await registerGuildSlashCommands(guildId, organizationId);
  revalidatePath("/superadmin");
}

export async function assignMemberOrg(formData: FormData) {
  await requireSuperAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!profileId || !organizationId) throw new Error("Missing fields");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ organization_id: organizationId, role: "member" })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/superadmin");
}
