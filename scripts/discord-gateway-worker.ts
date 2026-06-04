import { runDiscordGatewayWorker } from "../lib/discord/gateway-worker";

runDiscordGatewayWorker().catch((err) => {
  console.error("[discord-gateway] fatal:", err);
  process.exit(1);
});
