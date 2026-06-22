import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached read-scrapes (popular list, game details, search) — re-opening a
      // page within this window serves from cache instead of refetching.
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});
