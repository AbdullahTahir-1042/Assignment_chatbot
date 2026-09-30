import { useEffect } from "react";
import type { ReactNode } from "react";
import { Card } from "../../../../ui/Card";
import { useSendMessage } from "../../hooks/useSendMessage";
import { useCancelChat } from "../../hooks/useCancelChat";
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
};

/**
 * A finished session starts over on the next message rather than going dead.
 * The backend opens a new session whenever no sessionId is sent, so "Book
 * another" is just a reset plus an empty send.
 */
export const ChatWindow = ({ fallbackSlot, onFallbackStateChange }: ChatWindowProps) => {
  const session = useChatSession();
  const send = useSendMessage((reply) => session.applyReply(reply));
  const cancel = useCancelChat();

  const isFinished = session.status !== "active";
  const isBusy = send.isPending || cancel.isPending;

  // The page owns the form, so the flag and the draft are lifted one level.
  useEffect(() => {
    onFallbackStateChange?.({ needsForm: session.needsForm, draft: session.draft });
  }, [session.needsForm, session.draft, onFallbackStateChange]);

  const handleSend = (text: string) => {
    // Sending into a finished session starts a new one.
    if (isFinished) session.reset();
    send.mutate({ text, sessionId: isFinished ? undefined : (session.sessionId ?? undefined) });
  };

  const error = send.error ?? cancel.error;

  return (
    <Card className="flex h-[32rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Booking assistant</h2>
          <p className="text-xs text-slate-500">
            {session.awaitingConfirmation
              ? "Waiting for your confirmation"
              : isFinished
                ? "Session finished"
                : "Nothing is booked until you confirm"}
          </p>
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
          onNo={() => {
            if (session.sessionId) cancel.mutate(session.sessionId);
            else session.reset();
          }}
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
