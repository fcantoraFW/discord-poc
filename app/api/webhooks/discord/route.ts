import { getChatBot } from "@/lib/discord/bot";

export async function POST(request: Request) {
  const bot = await getChatBot();
  return bot.webhooks.discord(request);
}
