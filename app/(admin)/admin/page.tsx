import Link from "next/link";
import { createOrganization } from "@/lib/admin/actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/admin/discord" className="text-sm underline">
          Discord guilds
        </Link>
      </div>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Nueva organización</h2>
        <form action={createOrganization} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required placeholder="Acme Corp" />
          </div>
          <Button type="submit">Crear</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Organizaciones</h2>
        <ul className="divide-y border rounded-lg">
          {(orgs ?? []).map((org) => (
            <li key={org.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.slug}</p>
              </div>
              <Link href={`/admin/orgs/${org.id}`} className="text-sm underline">
                Gestionar
              </Link>
            </li>
          ))}
          {!orgs?.length ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              No hay organizaciones todavía.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
