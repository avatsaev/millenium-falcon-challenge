# Feature — Frontend (C3PO)

> Part of: [../overview.md](../overview.md)
> Dependencies: [backend-api.md](backend-api.md), [universe-map.md](universe-map.md)

## Purpose

Single-page app where the user uploads `empire.json` and sees the Falcon's odds of success as a
percentage (0%, x%, or 100%), per the README's exact display contract.

This spec owns the **page, the API client, the upload control and the odds/tone display contract** —
all of it unchanged by the universe map, which is an additive panel specified in
[universe-map.md](universe-map.md).

## Public contract

| Component / module | Inputs | Outputs |
|---------------------|--------|---------|
| `fetchUniverse(): Promise<Universe>` (`src/api/client.ts`) | none | `{ departure, arrival, autonomy, planets, routes }` from `GET /api/universe` |
| `fetchOdds(file: File): Promise<OddsResponse>` (`src/api/client.ts`) | an `empire.json` `File` | `{ odds, oddsPercent, reachable, minRiskEncounters, arrivalDay, countdown, bountyHunters, itinerary }` from `POST /api/odds` (multipart) |
| `createQueryClient(): QueryClient` (`src/api/query.ts`) | none | the app's single retry/stale policy; used by `main.tsx` and by tests so both run the shipped configuration |
| `<App />` (`src/App.tsx`) | none (requires a `QueryClientProvider` ancestor) | header, mission line, upload control and odds panel exactly as before, in the same order and position, on a widened content column, followed by the universe map panel |

`fetchMission` and `MissionInfo` are **deleted** along with `GET /api/mission`; the mission fields now
arrive inside `Universe`. No alias is kept.

Visual contract (must match README §Front-end exactly):
- `0%` — destination unreachable in time.
- `x%` (0 < x < 100) — reachable but bounty-hunter exposure present.
- `100%` — reachable with zero bounty-hunter exposure.

Styling contract: Tailwind CSS 4 utilities only — no per-component stylesheet. Palette and font are
declared as `@theme` tokens in `src/styles.css` (`--color-gold`, `--color-go`, `--color-alert`,
`--color-dim`, `--color-panel`, `--color-seam`, `--color-hull`, `--color-void`), which Tailwind turns
into `text-*`/`bg-*`/`border-*` utilities. The odds panel exposes `data-tone="success|warning|danger"`
so the tone is assertable without matching on class strings.

Icon contract: icons come from `lucide-react`, imported by name so unused icons are tree-shaken.
They are sized/coloured by Tailwind utilities and all carry `aria-hidden` — every icon restates
information the adjacent text already conveys, so none is required for the accessible name (the
upload control's accessible name stays exactly `Upload empire.json`).

| Slot | Icon | Meaning |
|------|------|---------|
| Page heading | `Rocket` | the Falcon itself (decorative) |
| Mission block | `Route` | departure -> arrival route summary |
| Upload control | `Upload` | choose an `empire.json` |
| Loading status | `LoaderCircle` + `animate-spin` | odds request in flight |
| Any error text | `TriangleAlert` | universe fetch or upload failed |
| Odds tone `success` | `ShieldCheck` | 100% — no bounty-hunter exposure |
| Odds tone `warning` | `Crosshair` | 0 < x < 100 — hunters on the best route |
| Odds tone `danger` | `CircleOff` | 0% — unreachable before the countdown |
| Falcon marker (map) | `Rocket` | the ship's position on day 0 |
| Arrival planet (map) | `Target` | the planet the Death Star is counting down on |
| Watched planet (map / schedule) | `Crosshair` | bounty hunters are scheduled on this planet |

## Behavior & algorithms

```
universe = useQuery({ queryKey: ["universe"], queryFn: fetchUniverse })
  # staleTime Infinity + refetchOnWindowFocus false: the server's millennium-falcon.json and routes
  # table cannot change without a restart, so the universe is fetched exactly once per page load
  # on error: show universe.error's ApiError message, else a generic fallback
  # the map panel derives its own geometry: StarMap useMemos layoutUniverse(planets, routes, { padding: 90 })

odds = useMutation({ mutationFn: fetchOdds })   # never retried: no silent re-upload

on file input change (user selects empire.json):
  odds.mutate(file)     # isPending -> spinner, isError -> message, isSuccess -> map panel populates

render odds headline (only when odds.isSuccess):
  tone = oddsPercent == 100 ? "success" : oddsPercent == 0 ? "danger" : "warning"
  show "{oddsPercent}%" with data-tone={tone}, the tone's literal utility class and its icon
    (success -> text-go + ShieldCheck, warning -> text-gold + Crosshair,
     danger -> text-alert + CircleOff; looked up in one Record<Tone, {valueClass, Icon}> so
     Tailwind's scanner sees each full class name)
  show caption: reachable
    ? "Best route crosses bounty hunters on {minRiskEncounters} occasion(s)."
    : "The Millennium Falcon cannot reach the destination before the countdown runs out."
```

Map geometry, the map panel and the details list are specified in
[universe-map.md](universe-map.md). This feature introduces **no component state**: the page stays a
pure function of the two query results.

## Data & persistence touchpoints

No client-side persistence. Server state lives in TanStack Query's in-memory cache (no persister, no
`localStorage`), so everything is discarded on reload.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| `GET /api/universe` fails (network/API down) | map and rail show `universe.error`'s message instead of geometry; the upload control stays usable; transport failures get one retry, an `ApiError` gets none |
| Uploaded file is not valid JSON / fails validation | API returns `400`; UI shows the API's `error` message via `ApiError`, and the mutation is not retried |
| No file selected (dialog cancelled) | no-op — `handleFileChange` never calls `odds.mutate` when `files[0]` is undefined |
| `minRiskEncounters === 1` vs `> 1` | caption pluralizes "occasion" vs "occasions" correctly |

## Dependencies on other specs

- [backend-api.md](backend-api.md) — consumes `GET /api/universe` and `POST /api/odds` exactly as
  specified there; any endpoint contract change must update both specs together.
- [universe-map.md](universe-map.md) — the map panel appended below the odds panel.

## Acceptance criteria

- [x] Uploading example1's `empire.json` renders `0%` with the "danger" tone and unreachable caption.
- [x] Uploading example2's `empire.json` renders `81%` with the "warning" tone and "2 occasions" caption.
- [x] Uploading example4's `empire.json` renders `100%` with the "success" tone and "0 occasions" caption.
- [x] On load, the mission block shows the departure/arrival/autonomy from `GET /api/universe`.
- [x] The universe is requested exactly once per page load — not re-requested on window focus or after
      an upload.
- [x] The upload control's accessible name is still exactly `Upload empire.json`, and the file input is
      still `sr-only` (focusable) rather than `display: none`.
- [x] No reference to `fetchMission` / `/api/mission` remains anywhere in `packages/web`.

(The odds panel's existing assertions in `App.test.tsx` are the contract for the three tone criteria:
position, `data-tone`, colour, icon and caption. Map assertions are added alongside them; none of them
may be rewritten to accommodate the map.)

## Resolved

- [x] The idle (pre-upload) state shows the universe map with the Falcon on the departure planet. The
      content column is `max-w-6xl`, so the SVG renders 758×470 CSS px next to the fixed `18rem` rail and
      the in-SVG sizes are set for that downscale (`universe-map.md` § Shell layout). The odds readout
      keeps its position, tone, icon, caption and prominence: `text-6xl` (60 CSS px) against the 36 px
      page heading, the largest other text on the page.
