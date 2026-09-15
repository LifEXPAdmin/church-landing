// Optional hints only. These choices never change consent or church access.
export const onboardingSteps = [
  "church",
  "profile",
  "sharing",
  "discovery",
  "contribute"
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];
export const welcomePurposes = {
  NONE: "Ordinary post",
  INTRODUCTION: "Introduction",
  QUESTION: "Question"
} as const;
export type WelcomePurpose = keyof typeof welcomePurposes;
