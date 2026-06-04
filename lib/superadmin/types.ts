export type SuperadminOrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  memberCount: number;
  adminCount: number;
  assistantCount: number;
  guildIds: string[];
};

export type SuperadminOrgDetail = {
  assistants: Array<{
    id: string;
    name: string;
    instructions: string;
    created_at: string;
  }>;
  members: Array<{
    id: string;
    email: string;
    discord_user_id: string | null;
    role: string;
  }>;
};

export type SuperadminUserRow = {
  id: string;
  email: string;
  role: string;
  organization_id: string | null;
  organization_name: string | null;
  discord_user_id: string | null;
};
