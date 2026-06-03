import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@cursor/sdk",
    "chat",
    "@chat-adapter/discord",
    "@chat-adapter/state-redis",
    "@chat-adapter/state-memory",
    "discord.js",
    "@discordjs/ws",
  ],
};

export default nextConfig;
