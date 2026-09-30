export type AppointmentStatus = "confirmed" | "cancelled";

/** Mirrors the backend's toAppointment row. */
export type Appointment = {
  id: string;
  businessId: string;
  userId: string;
  service: string;
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: "form" | "chat";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentListResponse = {
  appointments: Appointment[];
  nextCursor: string | null;
};
