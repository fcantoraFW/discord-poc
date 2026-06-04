import { NextResponse } from "next/server";
import { requireDiscordGuildLinker } from "@/lib/auth/profile";
import { setOAuthState } from "@/lib/auth/oauth-cookie";
import { discordAuthorizeUrl, getAppUrl } from "@/lib/discord/oauth";

export async function GET(request: Request) {
  await requireDiscordGuildLinker();
  const state = await setOAuthState("guilds");
  const redirectUri = `${getAppUrl(request)}/api/auth/discord/callback`;
  const url = discordAuthorizeUrl({
    redirectUri,
    scope: "identify guilds",
    state,
  });
  return NextResponse.redirect(url);
}
