import { Button } from "../../../../ui/Button";
import { EmptyState } from "../../../../ui/EmptyState";
import { Spinner } from "../../../../ui/Spinner";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import { useAppointments } from "../../hooks/useAppointments";
import { AppointmentItem } from "../AppointmentItem";

/**
 * The list, paged by the server's keyset cursor. Cancelled appointments are
 * hidden by default, matching the backend's own default, and the button only
 * appears when there is genuinely another page.
 */
export const AppointmentList = () => {
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAppointments();

  if (isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner label="Loading appointments" />
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage message={toMessage(error)} />;
  }

  const appointments = data?.pages.flatMap((p) => p.appointments) ?? [];

  if (appointments.length === 0) {
    return (
      <EmptyState
        title="No appointments yet"
        description="Book one with the assistant, or use the form."
      />
    );
  }

  return (
    <div className="space-y-3">
      {appointments.map((a) => (
        <AppointmentItem key={a.id} appointment={a} />
      ))}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="sm" isLoading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
