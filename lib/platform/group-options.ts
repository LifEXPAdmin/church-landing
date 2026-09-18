export const GROUP_SCHEMA = 1;
export const groupKinds = {
  INTEREST: "Interest community",
  CHURCH_LIFE: "Church life group",
  MINISTRY_TEAM: "Ministry team",
  PRIVATE_COHORT: "Private cohort"
} as const;
export const groupFormats = {
  LOCAL: "Local",
  ONLINE: "Online",
  HYBRID: "Local and online"
} as const;
export const groupJoinPolicies = {
  OPEN: "Join after accepting the rules",
  APPROVAL: "Ask a leader to approve",
  INVITE_ONLY: "Named invitation only"
} as const;
export const groupCategories = {
  GENERAL: "General",
  PRAYER: "Prayer",
  PLANNING: "Planning",
  RESOURCES: "Resources"
} as const;
