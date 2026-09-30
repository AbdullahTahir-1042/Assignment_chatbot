/**
 * Secure random password generator for the signup hint button.
 *
 * `crypto.getRandomValues` rather than Math.random: the whole point of the
 * suggestion is that it beats a human-chosen password, and a Math.random one is
 * only as strong as a human's habit. Kept in lib/ so the exact rules the schema
 * enforces (lower + upper + special) are produced here, and the schema stays the
 * single place that validates.
 */
const CLASSES = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "23456789",
  "!@#$%^&*()-_=+?",
] as const;

const DEFAULT_LENGTH = 16;

const randomIndex = (bound: number): number => {
  const r = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return r % bound;
};

export const generatePassword = (length = DEFAULT_LENGTH): string => {
  // One character from every class guarantees the rule is satisfied, no matter
  // what the fill produces afterwards.
  const chars: string[] = CLASSES.map((pool) => pool.charAt(randomIndex(pool.length)));

  while (chars.length < length) {
    const pool = CLASSES[randomIndex(CLASSES.length)] ?? CLASSES[0]!;
    chars.push(pool.charAt(randomIndex(pool.length)));
  }

  // Fisher-Yates so the guaranteed characters are not predictably front-loaded.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
};