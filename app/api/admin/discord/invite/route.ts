import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { botInviteUrl } from "@/lib/discord/oauth";

export async function GET(request: Request) {
  await requireSuperAdmin();
  const guildId = new URL(request.url).searchParams.get("guild_id");
  if (!guildId) {
    return NextResponse.json({ error: "guild_id required" }, { status: 400 });
  }
  return NextResponse.json({ url: botInviteUrl(guildId) });
}
