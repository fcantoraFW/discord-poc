import { AcceptInviteForm } from "@/components/accept-invite-form";
import { getSessionUserId } from "@/lib/auth/profile";
import { redirect } from "next/navigation";

export default async function Page() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/auth/login");

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AcceptInviteForm />
      </div>
    </div>
  );
}
