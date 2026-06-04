import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "chat",
    "@chat-adapter/discord",
    "@chat-adapter/state-redis",
    "@chat-adapter/state-memory",
    "discord.js",
    "@discordjs/ws",
  ],
};

export default nextConfig;
