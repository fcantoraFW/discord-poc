import { redirect } from "next/navigation";

export default async function LegacyOrgAdminPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/superadmin?tab=organizations&org=${orgId}`);
}
