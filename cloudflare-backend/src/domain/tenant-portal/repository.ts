export type TenantPropertySummary = {
  id: string;
  name: string;
  address: string;
};

export type TenantUnitSummary = {
  id: string;
  unit_number: string;
  rentable_sqft: string;
};

export type TenantLeaseDetail = {
  id: string;
  property: TenantPropertySummary;
  unit: TenantUnitSummary | null;
  start_date: string;
  end_date: string;
  pro_rata_share: string;
  base_year: number | null;
};

export type TenantStatementSummary = {
  id: string;
  property_name: string;
  period_start: string;
  period_end: string;
  tenant_share: string;
  status: "pending" | "paid" | "disputed" | "overdue";
  pdf_url: string | null;
  created_at: string;
};

export type TenantDashboard = {
  leases: TenantLeaseDetail[];
  statements: TenantStatementSummary[];
  unread_notifications: number;
};

export type TenantNotification = {
  id: string;
  tenant_user_id: string;
  notification_type:
    | "new_statement"
    | "dispute_update"
    | "statement_reminder"
    | "system";
  title: string;
  message: string;
  link_url: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type TenantEmailPreferences = {
  tenant_user_id: string;
  new_statement_emails: boolean;
  dispute_update_emails: boolean;
  reminder_emails: boolean;
  marketing_emails: boolean;
  updated_at: string;
};

export type TenantEmailPreferencesPatch = {
  new_statement_emails?: boolean;
  dispute_update_emails?: boolean;
  reminder_emails?: boolean;
  marketing_emails?: boolean;
};

export type TenantPortalRepository = {
  getDashboard(input: {
    tenantUserId: string;
    organizationId: string;
  }): Promise<TenantDashboard>;
  listNotifications(input: {
    tenantUserId: string;
    unreadOnly: boolean;
    skip: number;
    limit: number;
  }): Promise<TenantNotification[]>;
  markNotificationRead(input: {
    tenantUserId: string;
    notificationId: string;
    readAt: string;
  }): Promise<boolean>;
  markAllNotificationsRead(input: {
    tenantUserId: string;
    readAt: string;
  }): Promise<number>;
  getEmailPreferences(input: {
    tenantUserId: string;
    timestamp: string;
  }): Promise<TenantEmailPreferences>;
  updateEmailPreferences(input: {
    tenantUserId: string;
    patch: TenantEmailPreferencesPatch;
    updatedAt: string;
  }): Promise<TenantEmailPreferences | null>;
};
