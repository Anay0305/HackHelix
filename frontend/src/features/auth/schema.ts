import { z } from "zod";

export const udidSchema = z.object({
  udid: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
    .refine((v) => v.length >= 10 && v.length <= 14, {
      message: "UDID must be 10\u201314 characters (e.g., MH-0002-4817-2301)",
    }),
});

export type UdidFormValues = z.infer<typeof udidSchema>;

export const profileSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters"),
  preferredLanguage: z.enum(["en", "hi", "bilingual"]),
  notifications: z.object({
    benefitUpdates: z.boolean(),
    lessonReminders: z.boolean(),
    emergencyAlerts: z.boolean(),
  }),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
