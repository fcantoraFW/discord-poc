"use client";

import { useState } from "react";
import { linkDiscordGuild } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Guild = { id: string; name: string };
type Org = { id: string; name: string };
type Assistant = { id: string; name: string; organization_id: string };

export function DiscordGuildLinkForm({
  guilds,
  orgs,
  assistants,
}: {
  guilds: Guild[];
  orgs: Org[];
  assistants: Assistant[];
}) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadInvite(guildId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/discord/invite?guild_id=${guildId}`);
      const data = await res.json();
      setInviteUrl(data.url ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {guilds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay guilds en caché.{" "}
          <a href="/api/auth/discord/guilds" className="underline">
            Conectar Discord
          </a>{" "}
          para listar servidores.
        </p>
      ) : null}

      {guilds.map((guild) => (
        <form
          key={guild.id}
          action={linkDiscordGuild}
          className="border rounded-lg p-4 space-y-3"
        >
          <p className="font-medium">{guild.name}</p>
          <input type="hidden" name="guild_id" value={guild.id} />

          <div className="space-y-1">
            <Label>Organización</Label>
            <select
              name="organization_id"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={orgs[0]?.id}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Asistente default</Label>
            <select
              name="default_assistant_id"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Guardar vínculo</Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => loadInvite(guild.id)}
            >
              Generar invite del bot
            </Button>
          </div>
        </form>
      ))}

      {inviteUrl ? (
        <p className="text-sm break-all">
          <a href={inviteUrl} className="underline" target="_blank" rel="noreferrer">
            {inviteUrl}
          </a>
        </p>
      ) : null}
    </div>
  );
}
