import { useState } from "react";
import { Card } from "../../../../ui/Card";
import { Button } from "../../../../ui/Button";
import { FormField } from "../../../../ui/FormField";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import { localDateTimeToIso, todayInputValue, zoneLabel } from "../../../../lib/datetime";
import { useCreateAppointment } from "../../hooks/useCreateAppointment";
import type { Appointment } from "../../appointments.types";

type Prefill = Partial<{
  service: string;
  date: string;
  time: string;
  durationMinutes: number;
}>;

type AppointmentFormProps = {
  /**
   * Used by the AI fallback: the chat reply's draft pre-fills the fields. The
   * SAME component serves manual booking and the fallback -- same validation,
   * same request, so the two paths cannot drift.
   */
  prefill?: Prefill | undefined;
  onBooked?: (appointment: Appointment) => void;
};

const DEFAULT_DURATION = 30;

const num = (value: string): number => Number(value);

/**
 * date + time inputs give a bare "2026-10-07T16:30", which the backend rejects
 * because it requires an explicit offset. localDateTimeToIso parses it as LOCAL
 * time and returns UTC, which is correct because the browser's zone is the
 * user's zone. Getting this wrong is a 400 on every manual booking.
 */
export const AppointmentForm = ({ prefill, onBooked }: AppointmentFormProps) => {
  const create = useCreateAppointment(onBooked);
  const [service, setService] = useState(prefill?.service ?? "");
  const [date, setDate] = useState(prefill?.date ?? "");
  const [time, setTime] = useState(prefill?.time ?? "");
  const [duration, setDuration] = useState(String(prefill?.durationMinutes ?? DEFAULT_DURATION));
  const [conversionError, setConversionError] = useState<string | null>(null);

  const errors = create.fieldErrors;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.clearFieldErrors();
    setConversionError(null);
    try {
      create.mutate({
        service: service.trim(),
        startsAt: localDateTimeToIso(date, time),
        durationMinutes: num(duration),
      });
    } catch (err) {
      // Only reachable when date or time is empty or malformed, which the
      // required/min/pattern attributes mostly prevent. Surfaced rather than
      // thrown, so a half-filled form cannot crash the page.
      setConversionError(toMessage(err));
    }
  };

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-900">Book an appointment</h3>
      <p className="mt-0.5 text-xs text-slate-500">Times are in {zoneLabel()}.</p>

      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        <FormField
          label="Service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Haircut"
          required
          error={errors.service}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={todayInputValue()}
            required
            error={errors.date ?? errors.startsAt}
          />
          <FormField
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            error={errors.time}
          />
        </div>
        <FormField
          label="Duration (minutes)"
          type="number"
          min={5}
          max={480}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          error={errors.durationMinutes}
        />

        {conversionError && <ErrorMessage message={conversionError} />}
        {create.isError && Object.keys(errors).length === 0 && (
          <ErrorMessage message={toMessage(create.error)} />
        )}

        <Button type="submit" isLoading={create.isPending} disabled={create.isPending} className="w-full">
          {create.isPending ? "Booking..." : "Book appointment"}
        </Button>
      </form>
    </Card>
  );
};
