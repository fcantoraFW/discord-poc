import { createClient } from "@/lib/supabase/server";
import type {
  SuperadminOrgDetail,
  SuperadminOrgRow,
  SuperadminUserRow,
} from "@/lib/superadmin/types";

export async function loadSuperadminDashboard() {
  const supabase = await createClient();

  const [
    { data: orgs },
    { data: profiles },
    { data: assistants },
    { data: links },
    { data: allOrgs },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, email, role, organization_id, discord_user_id"),
    supabase.from("assistants").select("id, organization_id, name, instructions, created_at"),
    supabase.from("discord_guild_links").select("guild_id, organization_id"),
    supabase.from("organizations").select("id, name"),
  ]);

  const orgNameById = new Map((allOrgs ?? []).map((o) => [o.id, o.name]));

  const orgRows: SuperadminOrgRow[] = (orgs ?? []).map((org) => {
    const orgProfiles = (profiles ?? []).filter((p) => p.organization_id === org.id);
    const orgAssistants = (assistants ?? []).filter((a) => a.organization_id === org.id);
    const orgLinks = (links ?? []).filter((l) => l.organization_id === org.id);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      created_at: org.created_at,
      memberCount: orgProfiles.filter((p) => p.role === "member").length,
      adminCount: orgProfiles.filter((p) => p.role === "admin").length,
      assistantCount: orgAssistants.length,
      guildIds: orgLinks.map((l) => l.guild_id),
    };
  });

  const orgDetails: Record<string, SuperadminOrgDetail> = {};
  for (const org of orgs ?? []) {
    orgDetails[org.id] = {
      assistants: (assistants ?? [])
        .filter((a) => a.organization_id === org.id)
        .map((a) => ({
          id: a.id,
          name: a.name,
          instructions: a.instructions,
          created_at: a.created_at,
        })),
      members: (profiles ?? [])
        .filter((p) => p.organization_id === org.id)
        .map((p) => ({
          id: p.id,
          email: p.email,
          discord_user_id: p.discord_user_id,
          role: p.role,
        })),
    };
  }

  const users: SuperadminUserRow[] = (profiles ?? [])
    .filter((p) => p.role !== "superadmin")
    .map((p) => ({
      id: p.id,
      email: p.email,
      role: p.role,
      organization_id: p.organization_id,
      organization_name: p.organization_id
        ? (orgNameById.get(p.organization_id) ?? null)
        : null,
      discord_user_id: p.discord_user_id,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return {
    orgRows,
    orgDetails,
    users,
    orgOptions: allOrgs ?? [],
    allAssistants: assistants ?? [],
    guildLinks: links ?? [],
  };
}
