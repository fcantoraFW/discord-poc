import { INVITE_CONFIRM_URL } from "@/lib/auth/redirect-urls";
import type { InviteRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteUserToOrganization({
  email,
  organizationId,
  role,
}: {
  email: string;
  organizationId: string;
  role: InviteRole;
}) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("Missing email");
  if (!organizationId) throw new Error("Missing organization");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: INVITE_CONFIRM_URL,
  });
  if (error) throw new Error(error.message);

  if (!data.user) {
    throw new Error("Invite succeeded but no user was returned");
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ organization_id: organizationId, role })
    .eq("id", data.user.id);
  if (profileError) throw new Error(profileError.message);

  return data.user;
}
