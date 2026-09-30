/**
 * Class-name joiner.
 *
 * Deliberately not a dependency: `clsx` plus `tailwind-merge` is the usual pair,
 * but this app uses a handful of static Tailwind classes and nothing merges
 * conflicting utilities dynamically, so a filter-and-join is the whole
 * requirement.
 */
export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");
