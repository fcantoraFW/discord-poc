import Link from "next/link";
import { requireOrgAdmin } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export default async function ManageHomePage() {
  const profile = await requireOrgAdmin();
  const orgId = profile.organization_id!;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestionar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {org?.name ?? "Tu organización"} — asistentes, members y Discord.
        </p>
      </div>

      <nav className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/manage/assistants"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <p className="font-medium">Asistentes</p>
          <p className="text-xs text-muted-foreground mt-1">Crear y revisar</p>
        </Link>
        <Link
          href="/manage/members"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <p className="font-medium">Members</p>
          <p className="text-xs text-muted-foreground mt-1">Invitar y quitar</p>
        </Link>
        <Link
          href="/manage/discord"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <p className="font-medium">Discord</p>
          <p className="text-xs text-muted-foreground mt-1">Servidor y bot</p>
        </Link>
      </nav>

      <p className="text-sm text-muted-foreground">
        <Link href="/chat" className="underline">
          Ir al chat web
        </Link>
      </p>
    </div>
  );
}
