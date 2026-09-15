# Feature — Frontend (C3PO)

> Part of: [../overview.md](../overview.md)
> Dependencies: [backend-api.md](backend-api.md)

## Purpose

Single-page app where the user uploads `empire.json` and sees the Falcon's odds of success as a
percentage (0%, x%, or 100%), per the README's exact display contract.

## Public contract

| Component / module | Inputs | Outputs |
|---------------------|--------|---------|
| `fetchMission(): Promise<MissionInfo>` (`src/api.ts`) | none | `{ departure, arrival, autonomy }` from `GET /api/mission` |
| `fetchOdds(file: File): Promise<OddsResponse>` (`src/api.ts`) | an `empire.json` `File` | `{ odds, oddsPercent, reachable, minRiskEncounters }` from `POST /api/odds` (multipart) |
| `createQueryClient(): QueryClient` (`src/query.ts`) | none | the app's single retry/stale policy; used by `main.tsx` and by tests so both run the shipped configuration |
| `<App />` (`src/App.tsx`) | none (requires a `QueryClientProvider` ancestor) | renders mission banner, file upload control, odds result panel |

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
| Mission banner | `Route` | departure -> arrival route summary |
| Upload control | `Upload` | choose an `empire.json` |
| Loading status | `LoaderCircle` + `animate-spin` | odds request in flight |
| Any error text | `TriangleAlert` | mission fetch or upload failed |
| Odds tone `success` | `ShieldCheck` | 100% — no bounty-hunter exposure |
| Odds tone `warning` | `Crosshair` | 0 < x < 100 — hunters on the best route |
| Odds tone `danger` | `CircleOff` | 0% — unreachable before the countdown |

## Behavior & algorithms

```
mission = useQuery({ queryKey: ["mission"], queryFn: fetchMission })
  # rendered as "Departing <departure> for <arrival>, autonomy <n> days."
  # staleTime Infinity + refetchOnWindowFocus false: the server's millennium-falcon.json cannot
  # change without a restart, so the mission is fetched exactly once per page load
  # on error: show mission.error's ApiError message, else a generic fallback

odds = useMutation({ mutationFn: fetchOdds })   # never retried: no silent re-upload

on file input change (user selects empire.json):
  odds.mutate(file)     # isPending -> spinner, isError -> message, isSuccess -> odds panel

render odds panel (only when odds.isSuccess):
  tone = oddsPercent == 100 ? "success" : oddsPercent == 0 ? "danger" : "warning"
  show "{oddsPercent}%" with data-tone={tone}, the tone's literal utility class and its icon
    (success -> text-go + ShieldCheck, warning -> text-gold + Crosshair,
     danger -> text-alert + CircleOff; looked up in one Record<Tone, {valueClass, Icon}> so
     Tailwind's scanner sees each full class name)
  show caption: reachable
    ? "Best route crosses bounty hunters on {minRiskEncounters} occasion(s)."
    : "The Millennium Falcon cannot reach the destination before the countdown runs out."
```

## Data & persistence touchpoints

No client-side persistence. Server state lives in TanStack Query's in-memory cache (no persister, no
`localStorage`), so everything is discarded on reload.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| `GET /api/mission` fails (network/API down) | mission banner omitted, `mission.error`'s message shown instead; transport failures get one retry, an `ApiError` gets none |
| Uploaded file is not valid JSON / fails validation | API returns `400`; UI shows the API's `error` message via `ApiError`, and the mutation is not retried |
| No file selected (dialog cancelled) | no-op — `handleFileChange` never calls `odds.mutate` when `files[0]` is undefined |
| `minRiskEncounters === 1` vs `> 1` | caption pluralizes "occasion" vs "occasions" correctly |

## Dependencies on other specs

- [backend-api.md](backend-api.md) — consumes `GET /api/mission` and `POST /api/odds` exactly as
  specified there; any endpoint contract change must update both specs together.

## Acceptance criteria

- [x] On load, the mission banner shows the departure/arrival/autonomy from the live API.
- [x] Uploading example1's `empire.json` renders `0%` with the "danger" tone and unreachable caption.
- [x] Uploading example2's `empire.json` renders `81%` with the "warning" tone and "2 occasions" caption.
- [x] Uploading example4's `empire.json` renders `100%` with the "success" tone and "0 occasions" caption.
- [x] The mission is requested exactly once per page load — not re-requested on window focus or after
      an upload.

(Already implemented and verified — `packages/web/src/App.test.tsx` (4 tests, mocked fetch) plus a full
real-browser run through a live Vite dev server + live Fastify API + real file-input upload for all
three tone states. Re-verified after the Tailwind 4 / TypeScript 7 / `lucide-react` / TanStack Query
migration: uploads of example1/2/4 rendered `0%` `rgb(239,100,97)` + `CircleOff`, `81%`
`rgb(201,162,39)` + `Crosshair`, `100%` `rgb(76,175,130)` + `ShieldCheck` — each icon `40x40`,
`aria-hidden="true"`, inheriting the tone colour — with the expected `data-tone`, captions, and an
unchanged `Upload empire.json` accessible name. A malformed upload rendered the API's error text beside
`TriangleAlert`. `performance.getEntriesByType("resource")` in that same run counted 1 `GET
/api/mission` across StrictMode's double mount, synthetic focus/visibilitychange events and three
uploads, against 3 `POST /api/odds` — mutations are deliberately uncached.)

## TODO(verify)

- [ ] Loading state is a spinning `LoaderCircle` beside "Computing the odds…" and the idle state is
      still bare — acceptable for the technical-test scope; flag if a fuller design pass is wanted.
