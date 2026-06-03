import { ChatPanel } from "@/components/chat-panel";
import { requireMemberWithOrg } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const profile = await requireMemberWithOrg();
  const supabase = await createClient();

  if (profile.role === "superadmin" && !profile.organization_id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-muted-foreground text-sm">
          Como super-admin sin org asignada, usá el panel Admin o asignate una
          organización en Supabase para chatear como member.
        </p>
      </div>
    );
  }

  const orgId = profile.organization_id;
  if (!orgId) redirect("/auth/login");

  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name")
    .eq("organization_id", orgId)
    .order("name");

  if (!assistants?.length) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-muted-foreground text-sm">
          Tu organización aún no tiene asistentes. Pedile al admin que cree uno.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Chat</h1>
      <ChatPanel assistants={assistants} initialMessages={[]} />
    </div>
  );
}
