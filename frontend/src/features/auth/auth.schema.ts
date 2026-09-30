import { z } from "zod";

/**
 * Client-side schemas, matching the backend's constraints rather than
 * inventing new ones. The point is to fail fast on an empty field instead of
 * spending a round trip; the server remains the authority and its 400s are
 * surfaced per-field.
 *
 * Password max 72 is bcrypt's input limit, not a UI nicety: bcrypt silently
 * ignores bytes past 72, so a longer password would authenticate a truncated
 * one.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(72, "Password is too long"),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Password is too long"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
