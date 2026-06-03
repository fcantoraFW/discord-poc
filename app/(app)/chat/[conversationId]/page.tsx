import { ChatPanel } from "@/components/chat-panel";
import { requireMemberWithOrg } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const profile = await requireMemberWithOrg();
  const supabase = await createClient();

  const orgId = profile.organization_id;
  if (!orgId && profile.role !== "superadmin") redirect("/auth/login");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, assistant_id, profile_id")
    .eq("id", conversationId)
    .single();

  if (!conversation || conversation.profile_id !== profile.id) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");

  const { data: assistants } = await supabase
    .from("assistants")
    .select("id, name")
    .eq("organization_id", orgId ?? "")
    .order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Chat</h1>
      <ChatPanel
        assistants={assistants ?? []}
        initialConversationId={conversationId}
        initialMessages={messages ?? []}
      />
    </div>
  );
}
