import { env } from "@/lib/env";
import type {
  ApiError,
  Benefit,
  BenefitDetail,
  Lesson,
  MeResponse,
  ProgressSubmitRequest,
  ProgressSubmitResponse,
  UdidVerifyRequest,
  UdidVerifyResponse,
  UpdateProfileRequest,
  UserProfile,
} from "./types";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${env.apiBase}${path}`;
  const token = localStorage.getItem("sonorous:token");

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = { code: `http_${res.status}`, message: res.statusText };
    }
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const restClient = {
  verifyUdid: (body: UdidVerifyRequest) =>
    request<UdidVerifyResponse>("/auth/udid-verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<MeResponse>("/auth/me"),

  updateProfile: (body: UpdateProfileRequest) =>
    request<UserProfile>("/auth/profile", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listBenefits: (params?: {
    category?: string;
    state?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<Benefit[]>(`/benefits${qs ? `?${qs}` : ""}`);
  },

  getBenefit: (id: string) => request<BenefitDetail>(`/benefits/${id}`),

  getCurriculum: () => request<Lesson[]>("/learning/curriculum"),

  submitProgress: (body: ProgressSubmitRequest) =>
    request<ProgressSubmitResponse>("/learning/progress", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
