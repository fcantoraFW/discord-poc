export type UserRole = "superadmin" | "admin" | "member";
export type ConversationSource = "web" | "discord";
export type MessageRole = "user" | "assistant";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  wellbeing_assistant_id: string | null;
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
export type WellbeingSubmissionSource = "campaign";
export type WellbeingCampaignType = "wellbeing" | "project_evaluation";
export type TeamMemberRole =
  | "design"
  | "qa"
  | "product_manager"
  | "jr_dev"
  | "sr_dev";

export type WellbeingCampaign = {
  id: string;
  organization_id: string;
  name: string;
  campaign_type: WellbeingCampaignType;
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

export type ProjectSelfEvalDraft = {
  projectName?: string;
  overallSatisfaction?: number;
  keyContributions?: string;
  didWell?: string;
  challenges?: string;
  couldDoBetter?: string;
  learned?: string;
  additionalComments?: string;
};

export type TeamMemberEvalDraft = {
  evaluateeName: string;
  role: TeamMemberRole;
  didWell: string;
  couldDoBetter: string;
  communicationRating: number;
  collaborationRating: number;
  problemSolvingRating: number;
  overallRating: number;
  additionalComments?: string;
};

export type WellbeingSessionState = {
  campaignType?: WellbeingCampaignType;
  pillarRatings: Partial<Record<WellbeingPillar, PillarRatingDraft>>;
  personEvaluations: PersonEvaluationDraft[];
  projectSelfEval?: ProjectSelfEvalDraft;
  teamEvaluations?: TeamMemberEvalDraft[];
  pendingPillar?: WellbeingPillar;
  pendingRelationship?: WellbeingRelationship;
  pendingRole?: TeamMemberRole;
  pendingTeamEval?: Partial<TeamMemberEvalDraft>;
  pendingTeamEvalIndex?: number;
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

export type WellbeingProjectSelfEvaluation = {
  id: string;
  submission_id: string;
  project_name: string;
  overall_satisfaction: number;
  key_contributions: string;
  did_well: string;
  challenges: string;
  could_do_better: string;
  learned: string;
  additional_comments: string | null;
};

export type WellbeingTeamMemberEvaluation = {
  id: string;
  submission_id: string;
  evaluator_profile_id: string;
  evaluatee_name: string;
  role: TeamMemberRole;
  did_well: string;
  could_do_better: string;
  communication_rating: number;
  collaboration_rating: number;
  problem_solving_rating: number;
  overall_rating: number;
  additional_comments: string | null;
};
