import type { Profile, UserRole } from "@/lib/types/database";

export function isSuperAdmin(profile: Profile): boolean {
  return profile.role === "superadmin";
}

export function isOrgAdmin(profile: Profile): boolean {
  return profile.role === "admin";
}

export function canManageOrganization(profile: Profile, organizationId: string): boolean {
  if (isSuperAdmin(profile)) return true;
  return isOrgAdmin(profile) && profile.organization_id === organizationId;
}

export function requireOrganizationId(profile: Profile): string {
  if (!profile.organization_id) {
    throw new Error("No organization assigned");
  }
  return profile.organization_id;
}

export function canUseChat(profile: Profile): boolean {
  if (isSuperAdmin(profile)) return true;
  return Boolean(profile.organization_id) && (profile.role === "member" || profile.role === "admin");
}

export function canAccessOrgAdmin(profile: Profile): boolean {
  return isSuperAdmin(profile) || isOrgAdmin(profile);
}

export type InviteRole = Extract<UserRole, "member" | "admin">;
