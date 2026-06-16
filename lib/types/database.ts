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

export type WellbeingPillar = "workload" | "climate" | "wellbeing" | "recognition";
export type WellbeingRelationship = "peer" | "leader";
export type WellbeingSessionStatus = "in_progress" | "completed" | "abandoned";
export type WellbeingCampaignStatus = "draft" | "active" | "closed";
export type WellbeingSubmissionSource = "encuesta" | "campaign";

export type WellbeingCampaign = {
  id: string;
  organization_id: string;
  name: string;
  status: WellbeingCampaignStatus;
  started_by: string | null;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type WellbeingSession = {
  id: string;
  profile_id: string;
  organization_id: string;
  campaign_id: string | null;
  discord_thread_key: string;
  status: WellbeingSessionStatus;
  current_step: string;
  state: WellbeingSessionState;
  source: WellbeingSubmissionSource;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type PillarRatingDraft = {
  rating: number;
  comment?: string;
};

export type PersonEvaluationDraft = {
  evaluateeName: string;
  relationship: WellbeingRelationship;
  rating: number;
  comment?: string;
};

export type WellbeingSessionState = {
  pillarRatings: Partial<Record<WellbeingPillar, PillarRatingDraft>>;
  personEvaluations: PersonEvaluationDraft[];
  pendingPillar?: WellbeingPillar;
  pendingRelationship?: WellbeingRelationship;
  personDraft?: {
    evaluateeName?: string;
    relationship?: WellbeingRelationship;
    rating?: number;
  };
};

export type WellbeingSubmission = {
  id: string;
  session_id: string;
  profile_id: string;
  organization_id: string;
  campaign_id: string | null;
  source: WellbeingSubmissionSource;
  completed_at: string;
};

export type WellbeingPillarRating = {
  id: string;
  submission_id: string;
  pillar: WellbeingPillar;
  rating: number;
  comment: string | null;
};

export type WellbeingPersonEvaluation = {
  id: string;
  submission_id: string;
  evaluator_profile_id: string;
  evaluatee_name: string;
  relationship: WellbeingRelationship;
  rating: number;
  comment: string | null;
};
