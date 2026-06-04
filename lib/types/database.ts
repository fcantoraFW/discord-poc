export type UserRole = "superadmin" | "admin" | "member";
export type ConversationSource = "web" | "discord";
export type MessageRole = "user" | "assistant";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Assistant = {
  id: string;
  organization_id: string;
  name: string;
  instructions: string;
  context: string;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  created_at: string;
};

export type DiscordGuildLink = {
  guild_id: string;
  organization_id: string;
  default_assistant_id: string;
  linked_at: string;
};

export type Conversation = {
  id: string;
  profile_id: string;
  assistant_id: string;
  source: ConversationSource;
  cursor_agent_id: string | null;
  discord_thread_key: string | null;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
};
