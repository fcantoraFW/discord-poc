import { createClient } from "@/lib/supabase/server";
import {
  canAccessOrgAdmin,
  canManageOrganization,
  canUseChat,
  requireOrganizationId,
} from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/database";
import { redirect } from "next/navigation";

export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

export async function getProfile(): Promise<Profile | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/auth/login");
  return profile;
}

export async function requireSuperAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "superadmin") redirect("/chat");
  return profile;
}

export async function requireOrgAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "superadmin") redirect("/admin");
  if (profile.role !== "admin" || !profile.organization_id) redirect("/chat");
  return profile;
}

/** Superadmin gestionando su propia organización en /admin. */
export async function requireSuperAdminOrg(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "superadmin") redirect("/chat");
  if (!profile.organization_id) redirect("/superadmin");
  return profile;
}

/** Superadmin or org admin — for Discord guild OAuth used in /manage and /admin/discord. */
export async function requireDiscordGuildLinker(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "superadmin") return profile;
  if (profile.role === "admin" && profile.organization_id) return profile;
  redirect("/chat");
}

export async function requireOrgManagerFor(organizationId: string): Promise<Profile> {
  const profile = await requireProfile();
  if (!canManageOrganization(profile, organizationId)) redirect("/chat");
  return profile;
}

export async function requireMemberWithOrg(): Promise<Profile> {
  const profile = await requireProfile();
  if (!canUseChat(profile)) {
    redirect("/auth/login?error=no_org");
  }
  return profile;
}
