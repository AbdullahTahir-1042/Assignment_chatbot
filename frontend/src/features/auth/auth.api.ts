import { request } from "../../lib/http";
import type { AuthResponse } from "./auth.types";
import type { LoginInput, SignupInput, UpdateProfileInput } from "./auth.schema";

/**
 * HTTP only. No store access, no cache keys, no React -- so the auth flow can
 * be reasoned about without a component in the way.
 */
export const authApi = {
  login: (input: LoginInput) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input, anonymous: true }),

  signup: (input: SignupInput) =>
    request<AuthResponse>("/auth/signup", { method: "POST", body: input, anonymous: true }),

  me: (signal?: AbortSignal) => request<{ user: AuthResponse["user"] }>("/auth/me", ...(signal ? [{ signal }] : [])),

  updateProfile: (input: UpdateProfileInput) =>
    request<{ user: AuthResponse["user"] }>("/auth/me", { method: "PATCH", body: input }),
};
