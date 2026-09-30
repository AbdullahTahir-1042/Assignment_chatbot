import { createBrowserRouter } from "react-router";
import { AppShell } from "../layout/AppShell";
import { ProtectedRoute, PublicOnlyRoute } from "./guards";
import { LoginPage, SignupPage, DashboardPage, NotFoundPage } from "../pages";

/**
 * The route table.
 *
 * Protected and public-only routes are layout ROUTES with nested children, so
 * the guard runs before any private component mounts. That is what keeps a
 * signed-out visitor from ever rendering the dashboard shell.
 */
export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
