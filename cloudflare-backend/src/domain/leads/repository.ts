export type ContentLeadInsert = {
  firstName: string | null;
  email: string;
  company: string | null;
  assetSlug: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type LeadRepository = {
  isSuppressed(email: string): Promise<boolean>;
  hasRecentLead(input: {
    email: string;
    assetSlug: string;
    createdSinceIso: string;
  }): Promise<boolean>;
  insertContentLead(input: ContentLeadInsert): Promise<string>;
  suppressEmail(input: {
    email: string;
    reason: "user_unsubscribe";
  }): Promise<void>;
  markContentLeadsUnsubscribed(input: {
    email: string;
    unsubscribedAtIso: string;
  }): Promise<void>;
};
