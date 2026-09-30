import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../../../lib/http";
import { appointmentsApi } from "../appointments.api";
import { useInvalidateAppointments } from "./useAppointments";
import type { Appointment } from "../appointments.types";

/**
 * Creates a booking. Used by the manual form AND by the chat fallback -- the
 * same request, so the AI path and the form path cannot drift apart.
 *
 * Per-field errors are extracted from the 400 envelope rather than shown as one
 * banner, because a rejected past time belongs next to the time input.
 */
export const useCreateAppointment = (onBooked?: (appointment: Appointment) => void) => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const invalidate = useInvalidateAppointments();

  const mutation = useMutation({
    mutationFn: (input: { service: string; startsAt: string; durationMinutes: number }) =>
      appointmentsApi.create(input),
    onSuccess: ({ appointment }) => {
      setFieldErrors({});
      invalidate();
      onBooked?.(appointment);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields.length > 0) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      } else {
        setFieldErrors({});
      }
    },
  });

  return {
    ...mutation,
    fieldErrors,
    clearFieldErrors: () => setFieldErrors({}),
  };
};
