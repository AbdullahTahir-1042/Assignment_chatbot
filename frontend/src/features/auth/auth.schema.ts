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

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Password is too long")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[^A-Za-z0-9]/, "Include a special character"),
    // Never sent to the server: it confirms the typed password matches, then
    // the backend's own schema (which has no such field) strips it.
    confirmPassword: z.string().max(72, "Password is too long"),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Editable profile fields. businessId is a tenant boundary and password has its
 * own flow, so neither belongs in the profile editor.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
