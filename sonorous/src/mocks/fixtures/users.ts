import type { User, UserProfile } from "@/api/types";

export const demoUser: User = {
  id: "user-demo-001",
  udid: "MH-0002-4817-2301",
  displayName: "Arjun Sharma",
  email: "arjun@example.com",
  disabilityCategory: "hearing",
  state: "Maharashtra",
  createdAt: "2024-08-12T10:30:00Z",
};

export const demoProfile: UserProfile = {
  preferredLanguage: "bilingual",
  notifications: {
    benefitUpdates: true,
    lessonReminders: true,
    emergencyAlerts: true,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    fontScale: 1.0,
  },
};

export function resolveUserFromUdid(udid: string): User {
  // First two chars = state code; last section = deterministic id
  const stateCode = udid.slice(0, 2).toUpperCase();
  const stateMap: Record<string, string> = {
    MH: "Maharashtra",
    DL: "Delhi",
    KA: "Karnataka",
    TN: "Tamil Nadu",
    UP: "Uttar Pradesh",
    WB: "West Bengal",
    GJ: "Gujarat",
    RJ: "Rajasthan",
    KL: "Kerala",
    AP: "Andhra Pradesh",
    TS: "Telangana",
    MP: "Madhya Pradesh",
    BR: "Bihar",
    HR: "Haryana",
    PB: "Punjab",
  };
  const suffix = udid.slice(-2);
  const codeNum = parseInt(suffix, 36) % 6;
  const categories: User["disabilityCategory"][] = [
    "hearing",
    "speech",
    "visual",
    "locomotor",
    "multiple",
    "other",
  ];
  return {
    ...demoUser,
    id: `user-${udid}`,
    udid,
    disabilityCategory: categories[codeNum],
    state: stateMap[stateCode] ?? "Maharashtra",
  };
}
