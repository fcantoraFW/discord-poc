"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createOrganization, assignMemberOrg, linkDiscordGuild } from "@/lib/admin/actions";
import { DiscordGuildLinkForm } from "@/components/discord-guild-link-form";
import { SuperadminOrgDrawer } from "@/components/superadmin/org-drawer";
import type {
  SuperadminOrgDetail,
  SuperadminOrgRow,
  SuperadminUserRow,
} from "@/lib/superadmin/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SuperadminConsole({
  orgRows,
  orgDetails,
  users,
  orgOptions,
  allAssistants,
  guilds,
}: {
  orgRows: SuperadminOrgRow[];
  orgDetails: Record<string, SuperadminOrgDetail>;
  users: SuperadminUserRow[];
  orgOptions: Array<{ id: string; name: string }>;
  allAssistants: Array<{ id: string; name: string; organization_id: string }>;
  guilds: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "organizations";
  const initialOrgId = searchParams.get("org");

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialOrgId);
  const drawerOpen = Boolean(selectedOrgId);

  useEffect(() => {
    if (initialOrgId && orgDetails[initialOrgId]) {
      setSelectedOrgId(initialOrgId);
    }
  }, [initialOrgId, orgDetails]);

  const selectedOrg = useMemo(
    () => orgRows.find((o) => o.id === selectedOrgId) ?? null,
    [orgRows, selectedOrgId],
  );
  const selectedDetail = selectedOrgId ? orgDetails[selectedOrgId] ?? null : null;

  const openOrg = useCallback(
    (orgId: string) => {
      setSelectedOrgId(orgId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("org", orgId);
      params.set("tab", "organizations");
      router.replace(`/superadmin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeDrawer = useCallback(() => {
    setSelectedOrgId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("org");
    router.replace(`/superadmin?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Superadmin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plataforma: organizaciones, usuarios y Discord global. Tu org se gestiona en{" "}
          <a href="/admin" className="underline">
            Admin
          </a>
          .
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList>
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Organización</th>
                  <th className="px-3 py-2 font-medium">Members</th>
                  <th className="px-3 py-2 font-medium">Admins</th>
                  <th className="px-3 py-2 font-medium">Asistentes</th>
                  <th className="px-3 py-2 font-medium">Discord</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {orgRows.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => openOrg(org.id)}
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </td>
                    <td className="px-3 py-3">{org.memberCount}</td>
                    <td className="px-3 py-3">{org.adminCount}</td>
                    <td className="px-3 py-3">{org.assistantCount}</td>
                    <td className="px-3 py-3">
                      {org.guildIds.length ? (
                        <span className="text-xs">{org.guildIds.length} guild(s)</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOrg(org.id);
                        }}
                      >
                        Configurar
                      </Button>
                    </td>
                  </tr>
                ))}
                {!orgRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No hay organizaciones. Creá una en Config.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Organización</th>
                  <th className="px-3 py-2 font-medium">Discord</th>
                  <th className="px-3 py-2 font-medium">Asignar org</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {user.organization_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {user.discord_user_id ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {!user.organization_id && orgOptions.length ? (
                        <form action={assignMemberOrg} className="flex gap-1 items-center">
                          <input type="hidden" name="profile_id" value={user.id} />
                          <select
                            name="organization_id"
                            required
                            className="h-8 rounded-md border bg-background px-2 text-xs max-w-[140px]"
                            defaultValue={orgOptions[0]?.id}
                          >
                            {orgOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" size="sm" variant="outline">
                            Asignar
                          </Button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!users.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Sin usuarios
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-8">
          <section className="border rounded-lg p-4 space-y-3 max-w-lg">
            <h2 className="font-semibold">Nueva organización</h2>
            <form action={createOrganization} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="org_name">Nombre</Label>
                <Input id="org_name" name="name" required placeholder="Acme Corp" />
              </div>
              <Button type="submit">Crear</Button>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Discord (global)</h2>
            <a
              href="/api/auth/discord/guilds"
              className="inline-flex text-sm underline"
            >
              Refrescar servidores (OAuth)
            </a>
            <DiscordGuildLinkForm
              guilds={guilds}
              orgs={orgOptions}
              assistants={allAssistants}
              linkAction={linkDiscordGuild}
              inviteApiPath="/api/admin/discord/invite"
            />
          </section>
        </TabsContent>
      </Tabs>

      <SuperadminOrgDrawer
        org={selectedOrg}
        detail={selectedDetail}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
