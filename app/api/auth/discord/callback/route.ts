import { NextResponse } from "next/server";
import { cacheGuilds, verifyOAuthState } from "@/lib/auth/oauth-cookie";
import { requireProfile, requireSuperAdmin } from "@/lib/auth/profile";
import {
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordUser,
  getAppUrl,
} from "@/lib/discord/oauth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = getAppUrl(request);

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }

  const flow = await verifyOAuthState(state);
  if (!flow) {
    return NextResponse.redirect(`${appUrl}/settings?discord=invalid_state`);
  }

  const redirectUri = `${appUrl}/api/auth/discord/callback`;

  try {
    const token = await exchangeDiscordCode({ code, redirectUri });

    if (flow === "guilds") {
      await requireSuperAdmin();
      const guilds = await fetchDiscordGuilds(token.access_token);
      const adminGuilds = guilds.filter(
        (g) => g.owner || (BigInt(g.permissions) & BigInt(0x20)) === BigInt(0x20),
      );
      await cacheGuilds(adminGuilds);
      return NextResponse.redirect(`${appUrl}/admin/discord?guilds=1`);
    }

    const profile = await requireProfile();
    const discordUser = await fetchDiscordUser(token.access_token);
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        discord_user_id: discordUser.id,
        discord_username: discordUser.global_name ?? discordUser.username,
      })
      .eq("id", profile.id);

    if (updateError) {
      return NextResponse.redirect(`${appUrl}/settings?discord=save_error`);
    }

    return NextResponse.redirect(`${appUrl}/settings?discord=connected`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }
}
