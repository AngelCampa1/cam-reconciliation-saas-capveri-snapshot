export type FeedbackType = "bug" | "feature_request" | "general";

export type FeedbackStatus = "new" | "reviewed" | "resolved" | "dismissed";

export type FeedbackRecord = {
  id: string;
  userId: string;
  organizationId: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  pageUrl: string;
  screenshotUrl: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackListQuery = {
  organizationId: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
  page: number;
  perPage: number;
};

export type FeedbackCreateInput = {
  userId: string;
  organizationId: string;
  type: FeedbackType;
  message: string;
  pageUrl: string;
  screenshotUrl: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

export type FeedbackUpdateInput = {
  feedbackId: string;
  organizationId: string;
  status?: FeedbackStatus;
  metadata?: Record<string, unknown>;
};

export type FeedbackDeleteInput = {
  feedbackId: string;
  organizationId: string;
};

export type FeedbackStats = {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
};

export type FeedbackRepository = {
  countRecentForUser(input: {
    userId: string;
    sinceIso: string;
  }): Promise<number>;
  createFeedback(input: FeedbackCreateInput): Promise<FeedbackRecord>;
  listFeedback(query: FeedbackListQuery): Promise<FeedbackRecord[]>;
  listMyFeedback(input: {
    userId: string;
    limit: number;
  }): Promise<FeedbackRecord[]>;
  getFeedback(input: {
    feedbackId: string;
    organizationId: string;
  }): Promise<FeedbackRecord | null>;
  updateFeedback(input: FeedbackUpdateInput): Promise<FeedbackRecord | null>;
  deleteFeedback(input: FeedbackDeleteInput): Promise<FeedbackRecord | null>;
  getStats(organizationId: string): Promise<FeedbackStats>;
};
