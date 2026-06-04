import { AppNav } from "@/components/app-nav";
import { requireSuperAdminOrg } from "@/lib/auth/profile";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireSuperAdminOrg();

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1 container max-w-4xl py-8 px-4">{children}</main>
    </div>
  );
}
