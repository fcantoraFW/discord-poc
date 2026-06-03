import Link from "next/link";
import { DiscordGuildLinkForm } from "@/components/discord-guild-link-form";
import { readCachedGuilds } from "@/lib/auth/oauth-cookie";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDiscordPage() {
  const supabase = await createClient();
  const guilds = (await readCachedGuilds<Array<{ id: string; name: string }>>()) ?? [];

  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name, organization_id");

  const { data: links } = await supabase
    .from("discord_guild_links")
    .select("guild_id, organization_id, default_assistant_id");

  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Discord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vinculá servidores de Discord con organizaciones y un asistente default.
        </p>
      </div>

      <a
        href="/api/auth/discord/guilds"
        className="inline-flex text-sm underline"
      >
        Refrescar lista de servidores (OAuth)
      </a>

      <section className="space-y-2">
        <h2 className="font-semibold">Vínculos activos</h2>
        <ul className="border rounded-lg divide-y text-sm">
          {(links ?? []).map((l) => (
            <li key={l.guild_id} className="px-4 py-2">
              Guild <code>{l.guild_id}</code> →{" "}
              {orgNames.get(l.organization_id) ?? l.organization_id}
            </li>
          ))}
          {!links?.length ? (
            <li className="px-4 py-4 text-muted-foreground">Ninguno</li>
          ) : null}
        </ul>
      </section>

      <DiscordGuildLinkForm
        guilds={guilds}
        orgs={orgs ?? []}
        assistants={assistants ?? []}
      />
    </div>
  );
}
