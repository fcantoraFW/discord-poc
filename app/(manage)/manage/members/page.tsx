import Link from "next/link";
import { inviteOrgMember, removeOrgMember } from "@/lib/org/actions";
import { requireOrgAdmin } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function ManageMembersPage() {
  const profile = await requireOrgAdmin();
  const orgId = profile.organization_id!;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, discord_user_id, role")
    .eq("organization_id", orgId)
    .order("email");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/manage" className="text-sm text-muted-foreground hover:underline">
          ← Gestionar
        </Link>
        <h1 className="text-2xl font-bold mt-2">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solo podés invitar members y quitar members (no admins).
        </p>
      </div>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Invitar member</h2>
        <form action={inviteOrgMember} className="flex gap-2 items-end">
          <input type="hidden" name="organization_id" value={orgId} />
          <div className="flex-1 space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <Button type="submit">Invitar</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Equipo</h2>
        <ul className="border rounded-lg divide-y text-sm">
          {(members ?? []).map((m) => (
            <li key={m.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span>{m.email}</span>
                <span className="text-muted-foreground text-xs ml-2">({m.role})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {m.discord_user_id ? `Discord ${m.discord_user_id}` : "sin Discord"}
                </span>
                {m.role === "member" && m.id !== profile.id ? (
                  <form action={removeOrgMember}>
                    <input type="hidden" name="organization_id" value={orgId} />
                    <input type="hidden" name="profile_id" value={m.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Quitar
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
