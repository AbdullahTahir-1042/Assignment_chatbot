import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Card } from "../../../../ui/Card";
import { cn } from "../../../../lib/cn";
import { useSendMessage } from "../../hooks/useSendMessage";
import { useChatSession } from "../../hooks/useChatSession";
import { MessageList } from "../MessageList";
import { MessageInput } from "../MessageInput";
import { ConfirmActions } from "../ConfirmActions";
import { BookingSummary } from "../BookingSummary";
import { FallbackNotice } from "../FallbackNotice";
import { TypingIndicator } from "../TypingIndicator";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import type { ChatDraft } from "../../chat.types";

type ChatWindowProps = {
  /**
   * The fallback form, passed in as a SLOT.
   *
   * ChatWindow does not import AppointmentForm: features never import each
   * other, and the chat feature has no business knowing what a booking form is.
   * The page decides when it is shown.
   */
  fallbackSlot?: ReactNode;
  /**
   * Reports the fallback state upward: whether the assistant wants the manual
   * form, and the draft it managed to extract so far. The page needs the draft
   * to pre-fill that form, and the chat feature cannot reach the appointments
   * feature to do it itself.
   */
  onFallbackStateChange?: (state: { needsForm: boolean; draft: ChatDraft }) => void;
  /**
   * Fired the moment a session books an appointment. The booking is created
   * server-side by the AI; the page is the one that owns the appointments query
   * cache, so it refreshes on this signal.
   */
  onAppointmentBooked?: () => void;
};

/**
 * A finished session starts over on the next message rather than going dead.
 * The backend opens a new session whenever no sessionId is sent, so "Book
 * another" is just a reset plus an empty send.
 */
export const ChatWindow = ({ fallbackSlot, onFallbackStateChange, onAppointmentBooked }: ChatWindowProps) => {
  const session = useChatSession();
  const send = useSendMessage((reply) => session.applyReply(reply));

  const isFinished = session.status !== "active";
  const isBusy = send.isPending;

  // The page owns the form, so the flag and the draft are lifted one level.
  useEffect(() => {
    onFallbackStateChange?.({ needsForm: session.needsForm, draft: session.draft });
  }, [session.needsForm, session.draft, onFallbackStateChange]);

  // A booking lands as a server event (the AI created it), so raise it to the
  // page, which owns the appointments query. Track the transition: this effect
  // must not announce the same booking again on unrelated re-renders.
  const hadAppointmentRef = useRef(false);
  useEffect(() => {
    if (session.appointment) {
      if (!hadAppointmentRef.current) onAppointmentBooked?.();
      hadAppointmentRef.current = true;
    } else {
      hadAppointmentRef.current = false;
    }
  }, [session.appointment, onAppointmentBooked]);

  const handleSend = (text: string) => {
    // Sending into a finished session starts a new one.
    if (isFinished) session.reset();
    // The user's own turn is rendered client-side; the API reply adds the
    // assistant turn on success.
    session.addLocalMessage("user", text);
    send.mutate({ text, sessionId: isFinished ? undefined : (session.sessionId ?? undefined) });
  };

  const error = send.error;

  return (
    <Card className="flex h-[32rem] flex-col overflow-hidden rounded-2xl lg:h-full">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/25">
            <SparkleIcon />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Slotly assistant</h2>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  session.awaitingConfirmation ? "bg-amber-400" : "bg-emerald-400",
                )}
              />
              {session.awaitingConfirmation
                ? "Waiting for your confirmation"
                : isFinished
                  ? "Session finished"
                  : "Nothing is booked until you confirm"}
            </p>
          </div>
        </div>
        <TypingIndicator show={send.isPending} />
      </div>

      <MessageList messages={session.messages} isSending={send.isPending} />

      {error && (
        <div className="px-4 pb-2">
          <ErrorMessage message={toMessage(error)} />
        </div>
      )}

      {session.needsForm && (
        <>
          <FallbackNotice reason={session.needsFormReason} />
          {fallbackSlot}
        </>
      )}

      {session.appointment && <BookingSummary appointment={session.appointment} />}

      {session.awaitingConfirmation && !session.appointment ? (
        <ConfirmActions
          isLoading={isBusy}
          onYes={() => handleSend("yes")}
          // "No, thanks" declines the offer but keeps this conversation going:
          // the decline is routed through the normal message path, so the reply
          // stays in the same session and the input comes straight back.
          onNo={() => handleSend("no thanks")}
        />
      ) : isFinished ? (
        <div className="flex justify-center border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={() => session.reset()}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Book another
          </button>
        </div>
      ) : (
        <MessageInput onSend={handleSend} isSending={isBusy} />
      )}
    </Card>
  );
};

const SparkleIcon = () => (
  <svg
    aria-hidden
    className="size-4"
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.332 1.164a2.214 2.214 0 0 0 1.523 1.523l1.164.332a.75.75 0 0 1 0 1.436l-1.164.332a2.214 2.214 0 0 0-1.523 1.523l-.332 1.164a.75.75 0 0 1-1.435 0l-.332-1.164a2.214 2.214 0 0 0-1.523-1.523l-1.164-.332a.75.75 0 0 1 0-1.436l1.164-.332a2.214 2.214 0 0 0 1.523-1.523l.332-1.164A.75.75 0 0 1 18 1.5Z"
    />
  </svg>
);
