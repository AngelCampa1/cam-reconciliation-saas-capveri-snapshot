export type OnboardInitResult =
  | {
      state: "created";
      organizationId: string;
      userId: string;
    }
  | {
      state: "already_exists";
      organizationId: string;
      userId: string;
    };

export type OnboardUpgradeResult =
  | { state: "updated" }
  | { state: "user_not_found" };

export type OnboardingRepository = {
  initUser(input: { userId: string }): Promise<OnboardInitResult>;
  upgradeUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    organizationName: string;
  }): Promise<OnboardUpgradeResult>;
};
