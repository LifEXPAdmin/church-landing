export const feedbackIdeaStates = {
  CONSIDERING: "Considering",
  PLANNED: "Planned",
  BUILDING: "Building",
  TESTING: "Testing",
  RELEASED: "Released",
  NOT_NOW: "Not now"
} as const;
export type FeedbackIdeaState = keyof typeof feedbackIdeaStates;
export type PublicFeedbackIdea = {
  id: string;
  version: number;
  title: string;
  summary: string;
  status: FeedbackIdeaState;
  explanation: string;
  releaseId: string | null;
  attribution: string | null;
  publishedAt: string;
  updatedAt: string;
  mergedIntoId: string | null;
  votes: number;
};
export type FeedbackIdeaInterest = {
  canVote: boolean;
  voted: boolean;
  voteVersion: string;
  subscriptionVersion: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
};
export type FeedbackIdeasSnapshot = {
  ownerId: string | null;
  available: boolean;
  ideas: PublicFeedbackIdea[];
  page: number;
  more: boolean;
  query: string;
  detail?: PublicFeedbackIdea;
  destination?: { id: string; title: string };
  interest?: FeedbackIdeaInterest;
  history?: {
    version: number;
    status: FeedbackIdeaState;
    explanation: string;
    releaseId: string | null;
    createdAt: string;
  }[];
};
