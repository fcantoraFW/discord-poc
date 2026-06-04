import Link from "next/link";
import { notFound } from "next/navigation";
import { createAssistant } from "@/lib/admin/actions";
import {
  demoteAdminToMember,
  inviteOrgAdmin,
  inviteOrgMember,
  promoteMemberToAdmin,
  removeOrgMember,
} from "@/lib/org/actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function OrgAdminPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (!org) notFound();

  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name, instructions, context, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, discord_user_id, role")
    .eq("organization_id", orgId)
    .order("email");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">{org.name}</h1>
      </div>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Nuevo asistente</h2>
        <form action={createAssistant} className="space-y-3">
          <input type="hidden" name="organization_id" value={orgId} />
          <div className="space-y-1">
            <Label htmlFor="assistant_name">Nombre</Label>
            <Input id="assistant_name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="instructions">Instructions</Label>
            <textarea
              id="instructions"
              name="instructions"
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Reglas del asistente…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="context">Context</Label>
            <textarea
              id="context"
              name="context"
              className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="FAQs, políticas, docs…"
            />
          </div>
          <Button type="submit">Crear asistente</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Asistentes</h2>
        <ul className="border rounded-lg divide-y text-sm">
          {(assistants ?? []).map((a) => (
            <li key={a.id} className="px-4 py-3">
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {a.instructions.slice(0, 120) || "(sin instructions)"}
              </p>
            </li>
          ))}
          {!assistants?.length ? (
            <li className="px-4 py-4 text-muted-foreground">Sin asistentes</li>
          ) : null}
        </ul>
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Invitar member</h2>
        <form action={inviteOrgMember} className="flex gap-2 items-end">
          <input type="hidden" name="organization_id" value={orgId} />
          <div className="flex-1 space-y-1">
            <Label htmlFor="member_email">Email</Label>
            <Input id="member_email" name="email" type="email" required />
          </div>
          <Button type="submit">Invitar</Button>
        </form>
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Invitar org admin</h2>
        <p className="text-xs text-muted-foreground">
          Solo superadmin puede crear admins de org.
        </p>
        <form action={inviteOrgAdmin} className="flex gap-2 items-end">
          <input type="hidden" name="organization_id" value={orgId} />
          <div className="flex-1 space-y-1">
            <Label htmlFor="admin_email">Email</Label>
            <Input id="admin_email" name="email" type="email" required />
          </div>
          <Button type="submit">Invitar admin</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Members</h2>
        <ul className="border rounded-lg divide-y text-sm">
          {(members ?? []).map((m) => (
            <li
              key={m.id}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <span>{m.email}</span>
                <span className="text-muted-foreground text-xs ml-2">({m.role})</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {m.discord_user_id ? `Discord ${m.discord_user_id}` : "sin Discord"}
                </span>
                {m.role === "member" ? (
                  <>
                    <form action={promoteMemberToAdmin}>
                      <input type="hidden" name="organization_id" value={orgId} />
                      <input type="hidden" name="profile_id" value={m.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Hacer admin
                      </Button>
                    </form>
                    <form action={removeOrgMember}>
                      <input type="hidden" name="organization_id" value={orgId} />
                      <input type="hidden" name="profile_id" value={m.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Quitar
                      </Button>
                    </form>
                  </>
                ) : null}
                {m.role === "admin" ? (
                  <form action={demoteAdminToMember}>
                    <input type="hidden" name="organization_id" value={orgId} />
                    <input type="hidden" name="profile_id" value={m.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Pasar a member
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {!members?.length ? (
            <li className="px-4 py-4 text-muted-foreground">Sin members</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
