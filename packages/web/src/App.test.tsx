import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createQueryClient } from "./api/query";

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

function universeResponse(): Response {
  return jsonResponse({
    departure: "Tatooine",
    arrival: "Endor",
    autonomy: 6,
    planets: ["Tatooine", "Endor", "Dagobah", "Hoth"],
    routes: [
      { origin: "Dagobah", destination: "Endor", travelTime: 4 },
      { origin: "Dagobah", destination: "Hoth", travelTime: 1 },
      { origin: "Dagobah", destination: "Tatooine", travelTime: 6 },
      { origin: "Endor", destination: "Hoth", travelTime: 1 },
      { origin: "Hoth", destination: "Tatooine", travelTime: 6 },
    ],
  });
}

/** Stubs `fetch` with the shared universe payload above and a caller-supplied `/api/odds` response. */
function stubFetch(oddsResponse: () => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/universe")) return universeResponse();
      if (url.includes("/api/odds")) return oddsResponse();
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/universe")) {
          return jsonResponse({
            departure: "Tatooine",
            arrival: "Endor",
            autonomy: 6,
            planets: ["Tatooine", "Endor", "Dagobah", "Hoth"],
            routes: [
              { origin: "Dagobah", destination: "Endor", travelTime: 4 },
              { origin: "Dagobah", destination: "Hoth", travelTime: 1 },
              { origin: "Dagobah", destination: "Tatooine", travelTime: 6 },
              { origin: "Endor", destination: "Hoth", travelTime: 1 },
              { origin: "Hoth", destination: "Tatooine", travelTime: 6 },
            ],
          });
        }
        if (url.includes("/api/odds")) {
          return jsonResponse({
            odds: 0.81,
            oddsPercent: 81,
            reachable: true,
            minRiskEncounters: 2,
            arrivalDay: 8,
            countdown: 8,
            bountyHunters: [
              { planet: "Hoth", day: 6 },
              { planet: "Hoth", day: 7 },
              { planet: "Hoth", day: 8 },
            ],
            itinerary: [
              { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
              { day: 6, planet: "Hoth", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: true },
              { day: 7, planet: "Hoth", action: "refuel", from: null, fuelAfter: 6, huntersPresent: true },
              { day: 8, planet: "Endor", action: "jump", from: "Hoth", fuelAfter: 5, huntersPresent: false },
            ],
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  it("renders the mission info once loaded", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Tatooine", { selector: "strong" })).toBeInTheDocument();
    });
    expect(screen.getByText("Endor", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("What are the odds?")).toBeInTheDocument();
  });

  it("uploads empire.json and displays the returned odds", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine", { selector: "strong" })).toBeInTheDocument());

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
        if (url.includes("/api/universe")) {
          return jsonResponse({
            departure: "Tatooine",
            arrival: "Endor",
            autonomy: 6,
            planets: ["Tatooine", "Endor", "Dagobah", "Hoth"],
            routes: [
              { origin: "Dagobah", destination: "Endor", travelTime: 4 },
              { origin: "Dagobah", destination: "Hoth", travelTime: 1 },
              { origin: "Dagobah", destination: "Tatooine", travelTime: 6 },
              { origin: "Endor", destination: "Hoth", travelTime: 1 },
              { origin: "Hoth", destination: "Tatooine", travelTime: 6 },
            ],
          });
        }
        return jsonResponse({ error: "uploaded file is not valid JSON" }, { status: 400 });
      }),
    );

    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine", { selector: "strong" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });

    await waitFor(() => {
      expect(screen.getByText("uploaded file is not valid JSON")).toBeInTheDocument();
    });
    expect(document.querySelector("[data-tone]")).toBeNull();
  });

  it("does not refetch the mission when the window regains focus", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("Tatooine", { selector: "strong" })).toBeInTheDocument());

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await act(async () => {
      await Promise.resolve();
    });

    const missionCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/universe"));
    expect(missionCalls).toHaveLength(1);
  });

  it("draws the universe before any upload", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("star-map")).toBeInTheDocument());

    const planetNodes = document.querySelectorAll("[data-role]");
    expect(planetNodes).toHaveLength(4);

    const routeNodes = document.querySelectorAll("[data-route]");
    expect(routeNodes).toHaveLength(5);
    for (const route of routeNodes) expect(route).toHaveAttribute("data-travel-time");

    expect(document.querySelector('[data-planet="Tatooine"][data-role]')).toHaveAttribute("data-role", "departure");
    expect(document.querySelector('[data-planet="Endor"][data-role]')).toHaveAttribute("data-role", "arrival");
    expect(screen.getByTestId("falcon")).toHaveAttribute("data-planet", "Tatooine");
  });

  it("highlights the canonical plan and the hunter planet on the map after uploading", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("star-map")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });
    await waitFor(() => expect(screen.getByText("81%")).toBeInTheDocument());

    expect(document.querySelector('[data-route="Hoth|Tatooine"]')).toHaveAttribute("data-on-plan", "true");
    expect(document.querySelector('[data-route="Endor|Hoth"]')).toHaveAttribute("data-on-plan", "true");
    expect(document.querySelector('[data-route="Dagobah|Tatooine"]')).toHaveAttribute("data-on-plan", "false");

    const hoth = document.querySelector('[data-planet="Hoth"][data-role]');
    expect(hoth).toHaveAttribute("data-hunters", "true");
    expect(hoth?.textContent).toContain("d6, d7, d8");
    for (const name of ["Tatooine", "Dagobah", "Endor"]) {
      expect(document.querySelector(`[data-planet="${name}"][data-role]`)).toHaveAttribute("data-hunters", "false");
    }

    const steps = within(screen.getByTestId("plan")).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveAttribute("data-action", "start");
    expect(steps[0]).toHaveAttribute("data-step-day", "0");
    expect(steps[0]!.textContent).toBe("Day 0 — parked on Tatooine, tank full.");
    expect(steps[1]).toHaveAttribute("data-action", "jump");
    expect(steps[1]!.textContent).toBe("Day 6 — travel from Tatooine to Hoth.");
    expect(steps[2]).toHaveAttribute("data-action", "refuel");
    expect(steps[2]!.textContent).toBe("Day 7 — refuel on Hoth.");
    expect(steps[3]).toHaveAttribute("data-action", "jump");
    expect(steps[3]!.textContent).toBe("Day 8 — travel from Hoth to Endor.");
    for (const step of steps) expect(step.textContent ?? "").not.toMatch(/%|captured/i);
  });

  it("shows no highlighted route or plan list when the mission is unreachable, but still marks hunter planets", async () => {
    stubFetch(() =>
      jsonResponse({
        odds: 0,
        oddsPercent: 0,
        reachable: false,
        minRiskEncounters: null,
        arrivalDay: null,
        countdown: 7,
        bountyHunters: [{ planet: "Hoth", day: 6 }],
        itinerary: null,
      }),
    );

    renderApp();
    await waitFor(() => expect(screen.getByTestId("star-map")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });
    await waitFor(() => expect(screen.getByText("0%")).toBeInTheDocument());

    expect(document.querySelectorAll('[data-on-plan="true"]')).toHaveLength(0);
    expect(screen.queryByTestId("plan")).not.toBeInTheDocument();
    expect(document.querySelector('[data-planet="Hoth"][data-role]')).toHaveAttribute("data-hunters", "true");
  });

  it("lists an off-map sighting instead of drawing a phantom planet", async () => {
    stubFetch(() =>
      jsonResponse({
        odds: 0.81,
        oddsPercent: 81,
        reachable: true,
        minRiskEncounters: 1,
        arrivalDay: 8,
        countdown: 8,
        bountyHunters: [{ planet: "Alderaan", day: 3 }],
        itinerary: [
          { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
          { day: 8, planet: "Endor", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: false },
        ],
      }),
    );

    renderApp();
    await waitFor(() => expect(screen.getByTestId("star-map")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });
    await waitFor(() => expect(screen.getByTestId("off-map-sightings")).toBeInTheDocument());

    expect(document.querySelector('[data-planet="Alderaan"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("off-map-sightings").textContent).toContain("Alderaan");
  });

  it("shows an error in place of the map when the universe fails to load, without blocking the odds flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/universe")) return jsonResponse({ error: "onboard computer offline" }, { status: 500 });
        if (url.includes("/api/odds")) {
          return jsonResponse({
            odds: 0.81,
            oddsPercent: 81,
            reachable: true,
            minRiskEncounters: 2,
            arrivalDay: 8,
            countdown: 8,
            bountyHunters: [],
            itinerary: null,
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderApp();
    await waitFor(() => expect(screen.getByTestId("universe-error")).toBeInTheDocument());
    expect(screen.queryByTestId("star-map")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Upload empire.json"), { target: { files: [empireFile()] } });
    await waitFor(() => expect(screen.getByText("81%")).toBeInTheDocument());
  });
});
