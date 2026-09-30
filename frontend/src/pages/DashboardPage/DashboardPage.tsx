import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "../../ui/PageContainer";
import { ChatWindow, type ChatDraft } from "../../features/chat";
import { AppointmentForm, AppointmentCalendar, useInvalidateAppointments } from "../../features/appointments";
import { setDocumentTitle } from "../../lib/documentTitle";

/**
 * The page decides what "the fallback form" is. ChatWindow cannot know: features
 * never import each other, and the chat feature has no business knowing that a
 * booking form exists. It reports the draft; the page renders the form with it
 * as a prefill, which is the whole point of the fallback.
 */
export const DashboardPage = () => {
  const [fallbackDraft, setFallbackDraft] = useState<ChatDraft | null>(null);

  useEffect(() => {
    setDocumentTitle();
  }, []);

  // Stable identity, or the effect inside ChatWindow would re-run on every
  // render of this page and notify upward forever.
  const onFallbackStateChange = useCallback(({ needsForm, draft }: { needsForm: boolean; draft: ChatDraft }) => {
    setFallbackDraft(needsForm ? draft : null);
  }, []);
  const invalidateAppointments = useInvalidateAppointments();

  const prefill = fallbackDraft
    ? {
        ...(fallbackDraft.service !== undefined ? { service: fallbackDraft.service } : {}),
        ...(fallbackDraft.date !== undefined ? { date: fallbackDraft.date } : {}),
        ...(fallbackDraft.time !== undefined ? { time: fallbackDraft.time } : {}),
        ...(fallbackDraft.durationMinutes !== undefined
          ? { durationMinutes: fallbackDraft.durationMinutes }
          : {}),
      }
    : undefined;

  return (
    <PageContainer size="full" padding={false} className="h-[calc(100vh-4rem)] px-2 pt-2 pb-4">
      <div className="grid h-full gap-2 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <ChatWindow
          onFallbackStateChange={onFallbackStateChange}
          onAppointmentBooked={invalidateAppointments}
          fallbackSlot={
            <div className="border-t border-slate-200 bg-slate-200/50 p-4">
              {/* Remounted on draft change so the prefill actually lands: the
                  form holds its field state in useState initialised from
                  prefill, and prop changes alone would not update it. */}
              <AppointmentForm
                key={JSON.stringify(prefill ?? null)}
                prefill={prefill}
              />
            </div>
          }
        />

        <AppointmentCalendar />
      </div>
    </PageContainer>
  );
};
