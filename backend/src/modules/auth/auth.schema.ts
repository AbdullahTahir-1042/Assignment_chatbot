import { z } from "zod";
import { env } from "../../config/env.js";

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  // bcrypt silently ignores everything past 72 BYTES, so two long passwords
  // sharing a prefix would authenticate as the same user. Cap it here.
  .max(72, "Password must be at most 72 characters");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Must be a valid email address")
  .max(254, "Email is too long");

export const signupSchema = z.object({
  // businessId is deliberately absent: it comes from env.DEFAULT_BUSINESS_ID.
  // Accepting it from the client would let anyone sign up into another tenant.
  name: z.string().trim().min(1, "Name is required").max(100),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const defaultBusinessId = env.DEFAULT_BUSINESS_ID;
