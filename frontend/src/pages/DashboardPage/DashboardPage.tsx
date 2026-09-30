import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "../../ui/PageContainer";
import { ChatWindow, type ChatDraft } from "../../features/chat";
import { AppointmentForm, AppointmentList } from "../../features/appointments";

/**
 * The page decides what "the fallback form" is. ChatWindow cannot know: features
 * never import each other, and the chat feature has no business knowing that a
 * booking form exists. It reports the draft; the page renders the form with it
 * as a prefill, which is the whole point of the fallback.
 */
export const DashboardPage = () => {
  const [fallbackDraft, setFallbackDraft] = useState<ChatDraft | null>(null);

  useEffect(() => {
    document.title = "Bookings";
  }, []);

  // Stable identity, or the effect inside ChatWindow would re-run on every
  // render of this page and notify upward forever.
  const onFallbackStateChange = useCallback(({ needsForm, draft }: { needsForm: boolean; draft: ChatDraft }) => {
    setFallbackDraft(needsForm ? draft : null);
  }, []);

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
    <PageContainer>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Your bookings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tell the assistant what you need, or fill in the form yourself.
          </p>
        </div>

        <ChatWindow
          onFallbackStateChange={onFallbackStateChange}
          fallbackSlot={
            <div className="border-t border-slate-200 bg-slate-50 p-4">
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

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Your appointments</h2>
          <AppointmentList />
        </section>
      </div>
    </PageContainer>
  );
};
