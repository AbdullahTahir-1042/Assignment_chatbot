import { Button } from "../../ui/Button";
import { useLogout } from "../../features/auth";

/**
 * Calls the logout hook and wires it to the button. The hook lives in the auth
 * feature; the layout just has a button to place.
 */
export const LogoutButton = () => {
  const { logout } = useLogout();
  return (
    <Button variant="secondary" size="sm" onClick={logout}>
      Sign out
    </Button>
  );
};
