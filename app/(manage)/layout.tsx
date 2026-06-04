import { AppNav } from "@/components/app-nav";
import { requireOrgAdmin } from "@/lib/auth/profile";

export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireOrgAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1 container max-w-4xl py-8 px-4">{children}</main>
    </div>
  );
}
