import { createClient } from "@/lib/supabase/server";
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

export async function requireMemberWithOrg(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "superadmin") return profile;
  if (!profile.organization_id) redirect("/auth/login?error=no_org");
  return profile;
}
