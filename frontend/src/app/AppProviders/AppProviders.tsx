import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../../lib/queryClient";

/**
 * Only the providers that need to be ABOVE the router. TanStack Query goes here
 * because a protected route resolves data before it renders; anything route
 * scoped belongs in the element, not the provider.
 *
 * Auth deliberately has no provider: it is a Zustand store, read directly.
 */
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
