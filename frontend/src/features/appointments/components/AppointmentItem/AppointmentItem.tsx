import { Card } from "../../../../ui/Card";
import { formatInUserZone } from "../../../../lib/datetime";
import { StatusBadge } from "../StatusBadge";
import { CancelButton } from "../CancelButton";
import type { Appointment } from "../../appointments.types";

export const AppointmentItem = ({ appointment }: { appointment: Appointment }) => (
  <Card className="flex items-center justify-between gap-4 p-4">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-slate-900">{appointment.service}</p>
        <StatusBadge status={appointment.status} />
      </div>
      <p className="mt-0.5 text-sm text-slate-600">{formatInUserZone(appointment.startsAt)}</p>
      <p className="text-xs text-slate-400">
        {appointment.durationMinutes} min
        {appointment.source === "chat" ? " · booked via chat" : ""}
      </p>
    </div>
    {appointment.status === "confirmed" && <CancelButton appointmentId={appointment.id} />}
  </Card>
);
