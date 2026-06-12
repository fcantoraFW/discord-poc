import { AcceptInviteForm } from "@/components/accept-invite-form";
import { getProfile, getSessionUserId } from "@/lib/auth/profile";
import { redirect } from "next/navigation";

export default async function Page() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/auth/login");

  const profile = await getProfile();
  if (!profile?.organization_id) {
    redirect("/auth/error?error=invite_incomplete");
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AcceptInviteForm />
      </div>
    </div>
  );
}
