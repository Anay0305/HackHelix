import { http, HttpResponse, delay } from "msw";
import { env } from "@/lib/env";
import {
  demoProfile,
  resolveUserFromUdid,
} from "./fixtures/users";
import { benefitsFixture } from "./fixtures/benefits";
import { lessonsFixture } from "./fixtures/lessons";
import type {
  ApiError,
  ProgressSubmitRequest,
  ProgressSubmitResponse,
  UdidVerifyRequest,
  UdidVerifyResponse,
  UpdateProfileRequest,
  UserProfile,
} from "@/api/types";

const apiBase = env.apiBase;

export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────────
  http.post(`${apiBase}/auth/udid-verify`, async ({ request }) => {
    await delay(450);
    const body = (await request.json()) as UdidVerifyRequest;
    const raw = body.udid?.trim() ?? "";
    const normalized = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (normalized.length < 10) {
      const err: ApiError = {
        code: "invalid_udid",
        message: "UDID must be at least 10 characters.",
      };
      return HttpResponse.json(err, { status: 400 });
    }
    const formatted = [
      normalized.slice(0, 2),
      normalized.slice(2, 6),
      normalized.slice(6, 10),
      normalized.slice(10, 14) || "0000",
    ].join("-");

    const user = resolveUserFromUdid(formatted);
    const resp: UdidVerifyResponse = {
      token: `mock-token-${normalized}`,
      user,
      isNewUser: true,
    };
    return HttpResponse.json(resp);
  }),

  http.get(`${apiBase}/auth/me`, async () => {
    await delay(120);
    const user = resolveUserFromUdid("MH-0002-4817-2301");
    return HttpResponse.json({ user, profile: demoProfile });
  }),

  http.post(`${apiBase}/auth/profile`, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as UpdateProfileRequest;
    const profile: UserProfile = {
      ...demoProfile,
      preferredLanguage: body.preferredLanguage ?? demoProfile.preferredLanguage,
      notifications: { ...demoProfile.notifications, ...body.notifications },
      accessibility: { ...demoProfile.accessibility, ...body.accessibility },
    };
    return HttpResponse.json(profile);
  }),

  // ── Benefits ──────────────────────────────────────────────────────
  http.get(`${apiBase}/benefits`, async ({ request }) => {
    await delay(220);
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const state = url.searchParams.get("state");
    const search = url.searchParams.get("search")?.toLowerCase();

    let list = benefitsFixture;
    if (category && category !== "all") {
      list = list.filter((b) => b.category === category);
    }
    if (state && state !== "all") {
      list = list.filter((b) => !b.state || b.state === state);
    }
    if (search) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(search) ||
          b.summary.toLowerCase().includes(search) ||
          b.tags.some((t) => t.toLowerCase().includes(search)),
      );
    }
    return HttpResponse.json(list);
  }),

  http.get(`${apiBase}/benefits/:id`, async ({ params }) => {
    await delay(150);
    const b = benefitsFixture.find((x) => x.id === params.id);
    if (!b)
      return HttpResponse.json(
        { code: "not_found", message: "Benefit not found" } satisfies ApiError,
        { status: 404 },
      );
    return HttpResponse.json(b);
  }),

  // ── Learning ──────────────────────────────────────────────────────
  http.get(`${apiBase}/learning/curriculum`, async () => {
    await delay(180);
    return HttpResponse.json(lessonsFixture);
  }),

  http.post(`${apiBase}/learning/progress`, async ({ request }) => {
    await delay(250);
    const body = (await request.json()) as ProgressSubmitRequest;
    const lesson = lessonsFixture.find((l) => l.id === body.lessonId);
    const resp: ProgressSubmitResponse = {
      xp: lesson ? Math.round(lesson.xpReward * Math.max(body.score, 0.6)) : 20,
      streakDays: 1,
      newUnlocks: [],
    };
    return HttpResponse.json(resp);
  }),
];
