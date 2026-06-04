import Link from "next/link";
import { createOrgAssistant } from "@/lib/org/actions";
import { requireOrgAdmin } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function ManageAssistantsPage() {
  const profile = await requireOrgAdmin();
  const orgId = profile.organization_id!;
  const supabase = await createClient();

  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name, instructions, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/manage" className="text-sm text-muted-foreground hover:underline">
          ← Gestionar
        </Link>
        <h1 className="text-2xl font-bold mt-2">Asistentes</h1>
      </div>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Nuevo asistente</h2>
        <form action={createOrgAssistant} className="space-y-3">
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
        <h2 className="font-semibold">Listado</h2>
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
    </div>
  );
}
