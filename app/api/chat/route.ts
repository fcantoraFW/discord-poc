import { NextResponse } from "next/server";

export const maxDuration = 300;
import { z } from "zod";
import { getProfile } from "@/lib/auth/profile";
import { loadAssistantBundle, getOrCreateConversation } from "@/lib/chat/pipeline";
import { streamAgentResponse } from "@/lib/cursor/agent";
import type { AssistantPromptContext } from "@/lib/cursor/prompt";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  assistantId: z.string().uuid(),
  message: z.string().min(1).max(32000),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { assistantId, message, conversationId } = parsed.data;

  if (
    profile.role !== "superadmin" &&
    !profile.organization_id
  ) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const bundle = await loadAssistantBundle(assistantId);
  if (!bundle) {
    return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
  }

  if (
    profile.role !== "superadmin" &&
    profile.organization_id !== bundle.orgId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conversation = await getOrCreateConversation({
    profileId: profile.id,
    assistantId,
    source: "web",
    conversationId,
  });

  const admin = createAdminClient();
  await admin.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: message,
  });

  const promptContext: AssistantPromptContext = {
    orgName: bundle.orgName,
    assistantName: bundle.assistantName,
    instructions: bundle.instructions,
    context: bundle.context,
  };

  const encoder = new TextEncoder();
  let fullText = "";
  let agentId = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await streamAgentResponse({
          cursorAgentId: conversation.cursor_agent_id,
          promptContext,
          userMessage: message,
          onChunk(chunk) {
            fullText += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`),
            );
          },
        });
        agentId = result.agentId;
        fullText = result.text;

        await admin.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: fullText,
        });

        await admin
          .from("conversations")
          .update({
            cursor_agent_id: agentId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              conversationId: conversation.id,
              cursorAgentId: agentId,
            })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("branch") || msg.includes("repository")) {
          await admin
            .from("conversations")
            .update({ cursor_agent_id: null })
            .eq("id", conversation.id);
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, assistant_id, updated_at, assistants(name)")
    .eq("profile_id", profile.id)
    .eq("source", "web")
    .order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}
