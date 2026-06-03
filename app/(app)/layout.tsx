import { AppNav } from "@/components/app-nav";
import { requireProfile } from "@/lib/auth/profile";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1 container max-w-5xl py-8 px-4">{children}</main>
    </div>
  );
}
