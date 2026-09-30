import { RouterProvider } from "react-router";
import { AppProviders } from "./AppProviders";
import { router } from "./routes";

/**
 * Providers, then the router, then nothing else. The app has exactly one
 * composition root; if a second entry point is ever added it should import
 * App rather than re-implement this.
 */
export const App = () => (
  <AppProviders>
    <RouterProvider router={router} />
  </AppProviders>
);
