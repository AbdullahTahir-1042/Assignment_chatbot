import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "../layout/AppShell";
import { ProtectedRoute, PublicOnlyRoute } from "./guards";
import { LoginPage, SignupPage, DashboardPage, ProfilePage, NotFoundPage } from "../pages";

/**
 * The route table.
 *
 * Every surface has its own URL (/login, /signup, /dashboard) and "/" is only a
 * landing that forwards to the dashboard, so the address always tells you where
 * you are. Protected and public-only routes are layout ROUTES with nested
 * children, so the guard runs before any private component mounts. That is what
 * keeps a signed-out visitor from ever rendering the dashboard shell.
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
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
