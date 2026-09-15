import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createQueryClient } from "./query";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });
}

/** Fresh client per render: the production retry/stale policy, but no cache shared across tests. */
function renderApp(): void {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

function empireFile(): File {
  return new File([JSON.stringify({ countdown: 8, bounty_hunters: [] })], "empire.json", {
    type: "application/json",
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/mission")) {
          return jsonResponse({ departure: "Tatooine", arrival: "Endor", autonomy: 6 });
        }
        if (url.includes("/api/odds")) {
          return jsonResponse({ odds: 0.81, oddsPercent: 81, reachable: true, minRiskEncounters: 2 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  it("renders the mission info once loaded", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Tatooine")).toBeInTheDocument();
    });
    expect(screen.getByText("Endor")).toBeInTheDocument();
    expect(screen.getByText("What are the odds?")).toBeInTheDocument();
  });

  it("uploads empire.json and displays the returned odds", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });

    await waitFor(() => {
      expect(screen.getByText("81%")).toBeInTheDocument();
    });
    expect(screen.getByText(/bounty hunters on 2 occasions/)).toBeInTheDocument();
  });

  it("shows the backend's message when the upload is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/mission")) {
          return jsonResponse({ departure: "Tatooine", arrival: "Endor", autonomy: 6 });
        }
        return jsonResponse({ error: "uploaded file is not valid JSON" }, { status: 400 });
      }),
    );

    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });

    await waitFor(() => {
      expect(screen.getByText("uploaded file is not valid JSON")).toBeInTheDocument();
    });
    expect(document.querySelector("[data-tone]")).toBeNull();
  });

  it("does not refetch the mission when the window regains focus", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine")).toBeInTheDocument());

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await act(async () => {
      await Promise.resolve();
    });

    const missionCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/mission"));
    expect(missionCalls).toHaveLength(1);
  });
});
