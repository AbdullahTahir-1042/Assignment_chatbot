import { Button } from "../../../../ui/Button";

type ConfirmActionsProps = {
  onYes: () => void;
  onNo: () => void;
  isLoading: boolean;
};

/**
 * Yes/No for a pending confirmation.
 *
 * Offered IN ADDITION to the free-text input, not instead of it. The buttons
 * remove the "ok but..." ambiguity, while the text box keeps corrections
 * possible -- the backend only books on a whole-message yes, so a typed
 * correction is treated as new information rather than a confirmation.
 */
export const ConfirmActions = ({ onYes, onNo, isLoading }: ConfirmActionsProps) => (
  <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
    <Button onClick={onYes} isLoading={isLoading} size="sm">
      Yes, book it
    </Button>
    <Button onClick={onNo} variant="secondary" size="sm" disabled={isLoading}>
      No, thanks
    </Button>
    <p className="self-center text-xs text-slate-500">Or tell me what to change.</p>
  </div>
);
