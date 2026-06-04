import Link from "next/link";
import { DiscordGuildLinkForm } from "@/components/discord-guild-link-form";
import { readCachedGuilds } from "@/lib/auth/oauth-cookie";
import { requireSuperAdminOrg } from "@/lib/auth/profile";
import { linkOrgDiscordGuild } from "@/lib/org/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDiscordPage() {
  const profile = await requireSuperAdminOrg();
  const orgId = profile.organization_id!;
  const supabase = await createClient();
  const guilds = (await readCachedGuilds<Array<{ id: string; name: string }>>()) ?? [];

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name, organization_id")
    .eq("organization_id", orgId);

  const { data: links } = await supabase
    .from("discord_guild_links")
    .select("guild_id, default_assistant_id")
    .eq("organization_id", orgId);

  const assistantNames = new Map((assistants ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Discord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Servidor de {org?.name ?? "tu org"}.
        </p>
      </div>

      <a href="/api/auth/discord/guilds" className="inline-flex text-sm underline">
        Refrescar lista de servidores (OAuth)
      </a>

      <section className="space-y-2">
        <h2 className="font-semibold">Vínculos</h2>
        <ul className="border rounded-lg divide-y text-sm">
          {(links ?? []).map((l) => (
            <li key={l.guild_id} className="px-4 py-2">
              Guild <code>{l.guild_id}</code> → default{" "}
              {assistantNames.get(l.default_assistant_id) ?? l.default_assistant_id}
            </li>
          ))}
          {!links?.length ? (
            <li className="px-4 py-4 text-muted-foreground">Ninguno</li>
          ) : null}
        </ul>
      </section>

      {org ? (
        <DiscordGuildLinkForm
          guilds={guilds}
          orgs={[org]}
          assistants={assistants ?? []}
          linkAction={linkOrgDiscordGuild}
          inviteApiPath="/api/manage/discord/invite"
        />
      ) : null}
    </div>
  );
}
