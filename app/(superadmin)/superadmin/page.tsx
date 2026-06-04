import { Suspense } from "react";
import { readCachedGuilds } from "@/lib/auth/oauth-cookie";
import { SuperadminConsole } from "@/components/superadmin/superadmin-console";
import { loadSuperadminDashboard } from "@/lib/superadmin/load-dashboard";

export default async function SuperadminPage() {
  const { orgRows, orgDetails, users, orgOptions, allAssistants } =
    await loadSuperadminDashboard();
  const guilds =
    (await readCachedGuilds<Array<{ id: string; name: string }>>()) ?? [];

  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Cargando panel…</p>}
    >
      <SuperadminConsole
        orgRows={orgRows}
        orgDetails={orgDetails}
        users={users}
        orgOptions={orgOptions}
        allAssistants={allAssistants}
        guilds={guilds}
      />
    </Suspense>
  );
}
