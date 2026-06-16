import { requireOrgAdmin } from "@/lib/auth/profile";
import { loadWellbeingDashboard } from "@/lib/wellbeing/analytics";
import { WellbeingDashboard } from "@/components/wellbeing-dashboard";

export default async function ManageWellbeingPage() {
  const profile = await requireOrgAdmin();
  const orgId = profile.organization_id!;
  const data = await loadWellbeingDashboard(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bienestar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Encuestas de bienestar laboral vía Discord — campañas, promedios y respuestas.
        </p>
      </div>
      <WellbeingDashboard organizationId={orgId} data={data} />
    </div>
  );
}
