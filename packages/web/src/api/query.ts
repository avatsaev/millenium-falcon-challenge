import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

/**
 * Shared query-client policy so the app and the tests configure retries identically.
 *
 * An `ApiError` means the backend answered and rejected the request (bad config, invalid
 * `empire.json`): the same request will be rejected again, so it is never retried. Anything else is
 * a transport failure worth one more attempt.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The onboard computer's mission is fixed by the server's millennium-falcon.json; it cannot
        // change without a restart, so a fetched mission never goes stale.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      },
      mutations: {
        // Never silently re-upload an empire.json on the user's behalf.
        retry: false,
      },
    },
  });
}
