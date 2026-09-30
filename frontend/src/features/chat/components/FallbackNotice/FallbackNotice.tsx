import type { NeedsFormReason } from "../../chat.types";

const COPY: Record<NeedsFormReason, string> = {
  ai_unavailable: "The Slotly assistant is not responding right now.",
  ai_unparseable: "I could not read that reply.",
  ai_truncated: "That reply was cut off.",
  invalid_time: "That time could not be used.",
  unclear: "I could not work out the details.",
};

/**
 * "Use the form below" banner.
 *
 * It explains WHY the assistant stopped, rather than showing a bare error, and
 * points at the pre-filled form. Every reason maps to the same fallback because
 * the backend already collapsed them all onto needsForm.
 */
export const FallbackNotice = ({ reason }: { reason: NeedsFormReason | null }) => {
  const text = reason ? COPY[reason] : COPY.unclear;
  return (
    <div role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{text}</p>
      <p className="mt-0.5 text-xs text-amber-800">
        Your details are kept below in the form. Nothing is booked until you submit it.
      </p>
    </div>
  );
};
