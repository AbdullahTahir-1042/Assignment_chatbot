import { Button } from "../../../../ui/Button";

type SendButtonProps = {
  onClick: () => void;
  isLoading: boolean;
  disabled: boolean;
};

export const SendButton = ({ onClick, isLoading, disabled }: SendButtonProps) => (
  <Button type="submit" onClick={onClick} isLoading={isLoading} disabled={disabled} size="sm">
    Send
  </Button>
);
