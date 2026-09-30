import { Card } from "../../../../ui/Card";
import { formatInUserZone, zoneLabel } from "../../../../lib/datetime";
import type { BookedAppointment } from "../../chat.types";

export const BookingSummary = ({ appointment }: { appointment: BookedAppointment }) => (
  <Card className="m-4 border-green-200 bg-green-50 p-4">
    <p className="text-sm font-medium text-green-900">Booked: {appointment.service}</p>
    <p className="mt-1 text-sm text-green-800">
      {formatInUserZone(appointment.startsAt)} ({zoneLabel()})
    </p>
    <p className="text-xs text-green-700">{appointment.durationMinutes} minutes</p>
  </Card>
);
