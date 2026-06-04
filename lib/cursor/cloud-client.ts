const CURSOR_API_BASE = "https://api.cursor.com";

export type V1Repository = { url: string; startingRef?: string };
export type V1Run = {
  id: string;
  agentId: string;
  status: "CREATING" | "RUNNING" | "FINISHED" | "ERROR" | "CANCELLED" | "EXPIRED";
  result?: string;
};
export type V1Agent = { id: string; latestRunId?: string };

function authHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    const msg = json.error?.message ?? json.message;
    if (msg) {
      const code = json.error?.code;
      return code ? `[${code}] ${msg}` : msg;
    }
  } catch {
    /* plain text */
  }
  return text.slice(0, 500) || res.statusText;
}

async function request<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CURSOR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listRepositories(apiKey: string): Promise<V1Repository[]> {
  const data = await request<{ items: V1Repository[] }>(apiKey, "/v1/repositories");
  return data.items ?? [];
}

export async function createAgent(
  apiKey: string,
  body: {
    prompt: { text: string };
    model: { id: string };
    repos: V1Repository[];
  },
): Promise<{ agent: V1Agent; run: V1Run }> {
  return request(apiKey, "/v1/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getAgent(apiKey: string, agentId: string): Promise<V1Agent> {
  return request(apiKey, `/v1/agents/${agentId}`);
}

export async function createRun(
  apiKey: string,
  agentId: string,
  body: { prompt: { text: string }; model?: { id: string } },
): Promise<{ run: V1Run }> {
  return request(apiKey, `/v1/agents/${agentId}/runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getRun(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<V1Run> {
  return request(apiKey, `/v1/agents/${agentId}/runs/${runId}`);
}

export async function* streamRun(
  apiKey: string,
  agentId: string,
  runId: string,
): AsyncGenerator<{ event: string; data: unknown }> {
  const res = await fetch(
    `${CURSOR_API_BASE}/v1/agents/${agentId}/runs/${runId}/stream`,
    {
      headers: {
        Authorization: authHeader(apiKey),
        Accept: "text/event-stream",
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Cursor stream: empty body");

  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  const flush = () => {
    if (!eventName && dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    let data: unknown = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }
    }
    const ev = { event: eventName || "message", data };
    eventName = "";
    dataLines = [];
    return ev;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let lineEnd: number;
    while ((lineEnd = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
      buffer = buffer.slice(lineEnd + 1);

      if (line === "") {
        const ev = flush();
        if (ev) yield ev;
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
  }

  const tail = flush();
  if (tail) yield tail;
}
