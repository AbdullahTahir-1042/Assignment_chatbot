import { Navigate, Outlet, useLocation } from "react-router";
import { PageContainer } from "../../ui/PageContainer";
import { ErrorMessage } from "../../ui/ErrorMessage";
import { Button } from "../../ui/Button";
import { toMessage } from "../../lib/http";
import { useAuthStore, selectIsAuthenticated, useCurrentUser } from "../../features/auth";

/**
 * Gate for signed-in routes.
 *
 * Waits for the token to be CHECKED, not just present, before deciding. A token
 * in localStorage is a claim, not a fact; redirecting to /login on the strength
 * of it would bounce a valid session out on every refresh, and trusting it
 * blindly would render a dashboard that then 401s on its first query.
 *
 * Everything here is derived during render rather than mirrored into state --
 * the query already holds the answer, and a second copy could disagree with it.
 */
export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const location = useLocation();
  const query = useCurrentUser();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (query.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <RefreshArrowIcon />
        <p className="text-sm text-slate-500">Checking your session</p>
      </div>
    );
  }

  if (query.isError) {
    // A rejected token is not a session; useCurrentUser has already cleared the
    // store, so this is a redirect rather than a re-check. Anything else (a
    // network blip, a 500) is not the user's fault and must not log them out.
    if (query.error.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <PageContainer size="narrow">
        <div className="space-y-3">
          <ErrorMessage message={toMessage(query.error)} />
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return <Outlet />;
};

/** Keeps a signed-in user off /login and /signup. */
export const PublicOnlyRoute = () => {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

/** A spinning refresh arrow for the session check. */
const RefreshArrowIcon = () => (
  <svg
    aria-hidden
    className="size-14 animate-spin text-indigo-600"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);
