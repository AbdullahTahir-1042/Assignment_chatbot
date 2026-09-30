import { Button } from "../../../../ui/Button";
import { useCancelAppointment } from "../../hooks/useCancelAppointment";

type CancelButtonProps = {
  appointmentId: string;
};

/**
 * Cancels a booking. Rendered only for a confirmed appointment, and disabled
 * while its own request is in flight so a double-click cannot send two.
 */
export const CancelButton = ({ appointmentId }: CancelButtonProps) => {
  const cancel = useCancelAppointment();
  return (
    <Button
      variant="danger"
      size="sm"
      isLoading={cancel.isPending}
      disabled={cancel.isPending}
      onClick={() => cancel.mutate(appointmentId)}
    >
      Cancel
    </Button>
  );
};
