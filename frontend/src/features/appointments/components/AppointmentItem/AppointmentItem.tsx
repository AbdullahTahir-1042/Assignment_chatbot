import { Card } from "../../../../ui/Card";
import { browserTimezone } from "../../../../lib/timezone";
import { StatusBadge } from "../StatusBadge";
import { CancelButton } from "../CancelButton";
import type { Appointment } from "../../appointments.types";

const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: browserTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(iso));

const formatShortDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: browserTimezone(),
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

export const AppointmentItem = ({ appointment }: { appointment: Appointment }) => (
  <Card className="flex items-center gap-3 p-3 transition-[border-color,box-shadow,background-color] duration-150 hover:border-slate-300 hover:shadow-md">
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 overflow-hidden rounded-xl bg-gradient-to-b from-indigo-50 to-violet-50 px-1 py-2 ring-1 ring-inset ring-indigo-100">
      <span className="max-w-full whitespace-nowrap text-sm font-semibold tabular-nums leading-none text-indigo-700">
        {formatTime(appointment.startsAt)}
      </span>
      <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-500">{formatShortDate(appointment.startsAt)}</span>
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-slate-900">{appointment.service}</p>
        <StatusBadge status={appointment.status} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {appointment.durationMinutes} min
        {appointment.source === "chat" ? " · booked via chat" : ""}
      </p>
    </div>
    {appointment.status === "confirmed" && <CancelButton appointmentId={appointment.id} />}
  </Card>
);