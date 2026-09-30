import { useMutation } from "@tanstack/react-query";
import { appointmentsApi } from "../appointments.api";
import { useInvalidateAppointments } from "./useAppointments";

export const useCancelAppointment = () => {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => appointmentsApi.cancel(id),
    onSuccess: invalidate,
  });
};
