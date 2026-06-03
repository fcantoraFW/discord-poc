"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Assistant = { id: string; name: string };
type ConversationRow = {
  id: string;
  assistant_id: string;
  updated_at: string;
  assistants: { name: string } | null;
};
type MessageRow = { id: string; role: string; content: string; created_at: string };

export function ChatPanel({
  assistants,
  initialConversationId,
  initialMessages,
}: {
  assistants: Assistant[];
  initialConversationId?: string;
  initialMessages: MessageRow[];
}) {
  const [assistantId, setAssistantId] = useState(assistants[0]?.id ?? "");
  const [conversationId, setConversationId] = useState(initialConversationId ?? "");
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    if (!input.trim() || !assistantId || loading) return;
    const userText = input.trim();
    setInput("");
    setLoading(true);
    setMessages((m) => [
      ...m,
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: userText,
        created_at: new Date().toISOString(),
      },
    ]);

    let assistantSoFar = "";
    setMessages((m) => [
      ...m,
      {
        id: "tmp-assistant",
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          message: userText,
          conversationId: conversationId || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            conversationId?: string;
            error?: string;
          };
          if (payload.type === "chunk" && payload.text) {
            assistantSoFar += payload.text;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === "tmp-assistant"
                  ? { ...msg, content: assistantSoFar }
                  : msg,
              ),
            );
          }
          if (payload.type === "done" && payload.conversationId) {
            setConversationId(payload.conversationId);
          }
          if (payload.type === "error") {
            throw new Error(payload.error ?? "Stream error");
          }
        }
      }

      const listRes = await fetch("/api/chat");
      const listData = await listRes.json();
      setConversations(listData.conversations ?? []);
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === "tmp-assistant"
            ? {
                ...msg,
                content: err instanceof Error ? err.message : "Error",
              }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setConversationId("");
    setMessages([]);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-3">
        <div>
          <Label htmlFor="assistant">Asistente</Label>
          <select
            id="assistant"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={assistantId}
            onChange={(e) => {
              setAssistantId(e.target.value);
              startNewChat();
            }}
          >
            {assistants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={startNewChat}>
          Nueva conversación
        </Button>
        <ul className="text-xs space-y-1 max-h-64 overflow-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <a
                href={`/chat/${c.id}`}
                className="text-muted-foreground hover:underline"
              >
                {c.assistants?.name ?? "Chat"} ·{" "}
                {new Date(c.updated_at).toLocaleDateString()}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex flex-col border rounded-lg min-h-[480px]">
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Escribí un mensaje para probar el asistente Cursor.
            </p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm"
                  : "mr-auto max-w-[85%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {m.content || (loading && m.role === "assistant" ? "…" : "")}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form
          className="border-t p-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tu mensaje…"
            disabled={loading || !assistantId}
          />
          <Button type="submit" disabled={loading || !assistantId}>
            Enviar
          </Button>
        </form>
      </div>
    </div>
  );
}
