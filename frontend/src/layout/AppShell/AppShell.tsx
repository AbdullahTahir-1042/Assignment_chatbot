import { Outlet } from "react-router";
import { Header } from "../Header";

/**
 * The signed-in chrome. Rendered only under ProtectedRoute, so it never has to
 * ask whether there is a user. The page container belongs to the pages, not
 * here, so each one controls its own width.
 */
export const AppShell = () => (
  <div className="flex min-h-screen flex-col bg-slate-50">
    <Header />
    <main className="flex-1">
      <Outlet />
    </main>
  </div>
);
