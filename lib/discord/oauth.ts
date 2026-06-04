const DISCORD_API = "https://discord.com/api/v10";

export function getDiscordClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID;
  if (!id) throw new Error("DISCORD_CLIENT_ID is not set");
  return id;
}

export function getDiscordClientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!secret) throw new Error("DISCORD_CLIENT_SECRET is not set");
  return secret;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function appUrlFromRequest(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Public app origin for OAuth redirects. Prefer explicit env; auto-detect on Vercel. */
export function getAppUrl(request?: Request): string {
  if (request) {
    const fromRequest = appUrlFromRequest(request);
    if (fromRequest && !isLocalhost(fromRequest)) {
      return stripTrailingSlash(fromRequest);
    }
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !isLocalhost(configured)) {
    return stripTrailingSlash(configured);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost && process.env.VERCEL_ENV === "production") {
    const url = productionHost.startsWith("http")
      ? productionHost
      : `https://${productionHost}`;
    return stripTrailingSlash(url);
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const url = vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`;
    return stripTrailingSlash(url);
  }

  if (configured) return stripTrailingSlash(configured);
  return "http://localhost:3000";
}

export function discordAuthorizeUrl(options: {
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: getDiscordClientId(),
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: options.scope,
    state: options.state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

export async function exchangeDiscordCode(options: {
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; token_type: string }> {
  const body = new URLSearchParams({
    client_id: getDiscordClientId(),
    client_secret: getDiscordClientSecret(),
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchDiscordUser(accessToken: string) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Discord user");
  return res.json() as Promise<{
    id: string;
    username: string;
    global_name?: string;
  }>;
}

export async function fetchDiscordGuilds(accessToken: string) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Discord guilds");
  return res.json() as Promise<
    Array<{ id: string; name: string; owner: boolean; permissions: string }>
  >;
}

export function botInviteUrl(guildId: string): string {
  const clientId = getDiscordClientId();
  const permissions =
    process.env.DISCORD_BOT_PERMISSIONS ?? "117760";
  const params = new URLSearchParams({
    client_id: clientId,
    permissions,
    scope: "bot applications.commands",
    guild_id: guildId,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}
