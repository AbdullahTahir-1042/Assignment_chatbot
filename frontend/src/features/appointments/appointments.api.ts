import { request } from "../../lib/http";
import type { Appointment, AppointmentListResponse } from "./appointments.types";

export const appointmentsApi = {
  list: (cursor?: string, signal?: AbortSignal) =>
    request<AppointmentListResponse>(
      `/appointments?pageSize=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      ...(signal ? [{ signal }] : []),
    ),

  create: (body: { service: string; startsAt: string; durationMinutes: number }) =>
    request<{ appointment: Appointment }>("/appointments", { method: "POST", body }),

  cancel: (id: string) =>
    request<{ appointment: Appointment }>(`/appointments/${id}/cancel`, { method: "POST" }),
};
