import { NextResponse } from "next/server";
import { setOAuthState } from "@/lib/auth/oauth-cookie";
import { discordAuthorizeUrl, getAppUrl } from "@/lib/discord/oauth";

export async function GET(request: Request) {
  const state = await setOAuthState("connect");
  const redirectUri = `${getAppUrl(request)}/api/auth/discord/callback`;
  const url = discordAuthorizeUrl({
    redirectUri,
    scope: "identify",
    state,
  });
  return NextResponse.redirect(url);
}
