import { Badge } from "../../../../ui/Badge";
import type { AppointmentStatus } from "../../appointments.types";

/**
 * Maps a booking status to a Badge tone. Lives in the feature, not in ui/,
 * because ui/Badge has no idea what a status is.
 */
const TONES: Record<AppointmentStatus, "positive" | "danger"> = {
  confirmed: "positive",
  cancelled: "danger",
};

export const StatusBadge = ({ status }: { status: AppointmentStatus }) => (
  <Badge tone={TONES[status]}>{status}</Badge>
);
