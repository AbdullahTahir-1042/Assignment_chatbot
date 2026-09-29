import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Pool } from "pg";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import type { LoginInput, SignupInput } from "./auth.schema.js";
import { authRepository, type PublicUser } from "./auth.repository.js";

const BCRYPT_COST = env.BCRYPT_COST;

const TOKEN_TTL = "7d";

/**
 * Hash of a throwaway random value, used to spend the same CPU when the email
 * does not exist. Without it a wrong email answers in ~1ms and a wrong
 * password in ~250ms, which is enough to enumerate accounts by timing even
 * though the response bodies are identical.
 *
 * Generated at startup from `randomBytes` rather than hardcoded. A hardcoded
 * literal is easy to get wrong: a bcrypt hash is 60 characters, and a
 * hand-typed 59-character one is still accepted by bcrypt.compare (returning
 * false) while being one character away from correct. Deriving it means the
 * cost and length can never drift from BCRYPT_COST.
 */
const DUMMY_HASH: string = await bcrypt.hash(randomBytes(16).toString("hex"), BCRYPT_COST);

const signToken = (user: PublicUser): string =>
  jwt.sign({ businessId: user.businessId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL,
    subject: user.id,
  });

const INVALID_CREDENTIALS = "Invalid email or password";

export const authService = {
  async signup(pool: Pool, input: SignupInput): Promise<{ token: string; user: PublicUser }> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    // businessId comes from env only, never from the request body.
    const user = await authRepository.create(pool, {
      businessId: env.DEFAULT_BUSINESS_ID,
      email: input.email,
      passwordHash,
      name: input.name,
    });
    return { token: signToken(user), user };
  },

  async login(pool: Pool, input: LoginInput): Promise<{ token: string; user: PublicUser }> {
    const row = await authRepository.findByEmail(pool, input.email);

    if (!row) {
      // Equalize timing against the found-user path.
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const ok = await bcrypt.compare(input.password, row.password_hash);
    if (!ok) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const user: PublicUser = {
      id: row.id,
      businessId: row.business_id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at.toISOString(),
    };
    return { token: signToken(user), user };
  },
};

export { signToken };
