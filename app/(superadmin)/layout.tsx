import { AppNav } from "@/components/app-nav";
import { requireSuperAdmin } from "@/lib/auth/profile";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireSuperAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1 container max-w-6xl py-8 px-4">{children}</main>
    </div>
  );
}
