import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const STATE_COOKIE = "discord_oauth_state";
const FLOW_COOKIE = "discord_oauth_flow";
const GUILDS_COOKIE = "discord_guilds_cache";

export type DiscordOAuthFlow = "connect" | "guilds";

export async function setOAuthState(flow: DiscordOAuthFlow): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", maxAge: 600 });
  jar.set(FLOW_COOKIE, flow, { httpOnly: true, secure, sameSite: "lax", maxAge: 600 });
  return state;
}

export async function verifyOAuthState(state: string): Promise<DiscordOAuthFlow | null> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const flow = jar.get(FLOW_COOKIE)?.value as DiscordOAuthFlow | undefined;
  if (!expected || expected !== state || !flow) return null;
  jar.delete(STATE_COOKIE);
  jar.delete(FLOW_COOKIE);
  return flow;
}

export async function cacheGuilds(guilds: unknown) {
  const jar = await cookies();
  jar.set(GUILDS_COOKIE, JSON.stringify(guilds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3600,
  });
}

export async function readCachedGuilds<T>(): Promise<T | null> {
  const jar = await cookies();
  const raw = jar.get(GUILDS_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
