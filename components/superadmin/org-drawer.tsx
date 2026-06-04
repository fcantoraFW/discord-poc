"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { createAssistant } from "@/lib/admin/actions";
import {
  demoteAdminToMember,
  inviteOrgAdmin,
  inviteOrgMember,
  promoteMemberToAdmin,
  removeOrgMember,
} from "@/lib/org/actions";
import type { SuperadminOrgDetail, SuperadminOrgRow } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SuperadminOrgDrawer({
  org,
  detail,
  open,
  onClose,
}: {
  org: SuperadminOrgRow | null;
  detail: SuperadminOrgDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!org || !detail) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar panel"
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{org.name}</h2>
            <p className="text-xs text-muted-foreground">
              {org.slug} · <code className="text-[10px]">{org.id}</code>
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8">
          <section className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Nuevo asistente</h3>
            <form action={createAssistant} className="space-y-3">
              <input type="hidden" name="organization_id" value={org.id} />
              <div className="space-y-1">
                <Label htmlFor={`drawer_name_${org.id}`}>Nombre</Label>
                <Input id={`drawer_name_${org.id}`} name="name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`drawer_instructions_${org.id}`}>Instructions</Label>
                <textarea
                  id={`drawer_instructions_${org.id}`}
                  name="instructions"
                  className="w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`drawer_context_${org.id}`}>Context</Label>
                <textarea
                  id={`drawer_context_${org.id}`}
                  name="context"
                  className="w-full min-h-[96px] rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button type="submit" size="sm">
                Crear asistente
              </Button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Asistentes ({detail.assistants.length})</h3>
            <ul className="border rounded-lg divide-y text-sm">
              {detail.assistants.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.instructions.slice(0, 100) || "(sin instructions)"}
                  </p>
                </li>
              ))}
              {!detail.assistants.length ? (
                <li className="px-3 py-4 text-muted-foreground">Sin asistentes</li>
              ) : null}
            </ul>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Invitar member</h3>
            <form action={inviteOrgMember} className="flex gap-2 items-end">
              <input type="hidden" name="organization_id" value={org.id} />
              <div className="flex-1 space-y-1">
                <Label htmlFor={`drawer_member_${org.id}`}>Email</Label>
                <Input
                  id={`drawer_member_${org.id}`}
                  name="email"
                  type="email"
                  required
                />
              </div>
              <Button type="submit" size="sm">
                Invitar
              </Button>
            </form>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Invitar org admin</h3>
            <form action={inviteOrgAdmin} className="flex gap-2 items-end">
              <input type="hidden" name="organization_id" value={org.id} />
              <div className="flex-1 space-y-1">
                <Label htmlFor={`drawer_admin_${org.id}`}>Email</Label>
                <Input
                  id={`drawer_admin_${org.id}`}
                  name="email"
                  type="email"
                  required
                />
              </div>
              <Button type="submit" size="sm">
                Invitar admin
              </Button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Equipo</h3>
            <ul className="border rounded-lg divide-y text-sm">
              {detail.members.map((m) => (
                <li
                  key={m.id}
                  className="px-3 py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span>{m.email}</span>
                    <span className="text-muted-foreground text-xs ml-2">({m.role})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {m.discord_user_id ? `Discord ${m.discord_user_id}` : "sin Discord"}
                    </span>
                    {m.role === "member" ? (
                      <>
                        <form action={promoteMemberToAdmin}>
                          <input type="hidden" name="organization_id" value={org.id} />
                          <input type="hidden" name="profile_id" value={m.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Admin
                          </Button>
                        </form>
                        <form action={removeOrgMember}>
                          <input type="hidden" name="organization_id" value={org.id} />
                          <input type="hidden" name="profile_id" value={m.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Quitar
                          </Button>
                        </form>
                      </>
                    ) : null}
                    {m.role === "admin" ? (
                      <form action={demoteAdminToMember}>
                        <input type="hidden" name="organization_id" value={org.id} />
                        <input type="hidden" name="profile_id" value={m.id} />
                        <Button type="submit" variant="outline" size="sm">
                          → member
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
              {!detail.members.length ? (
                <li className="px-3 py-4 text-muted-foreground">Sin members</li>
              ) : null}
            </ul>
          </section>
        </div>
      </aside>
    </>
  );
}
