import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CircleOff,
  Crosshair,
  LoaderCircle,
  Rocket,
  Route,
  ShieldCheck,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { ApiError, fetchMission, fetchOdds, type OddsResponse } from "./api";

type Tone = "success" | "warning" | "danger";

/**
 * One row per tone: the literal Tailwind class (interpolated names would never reach the
 * generated stylesheet) and the icon that carries the same meaning as the colour.
 */
const TONE: Record<Tone, { readonly valueClass: string; readonly Icon: LucideIcon }> = {
  success: { valueClass: "text-go", Icon: ShieldCheck },
  warning: { valueClass: "text-gold", Icon: Crosshair },
  danger: { valueClass: "text-alert", Icon: CircleOff },
};

function OddsDisplay({ result }: { readonly result: OddsResponse }): React.JSX.Element {
  const tone: Tone = result.oddsPercent === 100 ? "success" : result.oddsPercent === 0 ? "danger" : "warning";
  const { valueClass, Icon } = TONE[tone];
  return (
    <div className="text-center" data-tone={tone}>
      <p className={`flex items-center justify-center gap-3 ${valueClass}`}>
        <Icon className="size-10" aria-hidden strokeWidth={2.25} />
        <span className="text-6xl font-bold tabular-nums">{result.oddsPercent}%</span>
      </p>
      <p className="mt-2 text-dim">
        {result.reachable
          ? `Best route crosses bounty hunters on ${result.minRiskEncounters} occasion${result.minRiskEncounters === 1 ? "" : "s"}.`
          : "The Millennium Falcon cannot reach the destination before the countdown runs out."}
      </p>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const mission = useQuery({ queryKey: ["mission"], queryFn: fetchMission });
  const odds = useMutation({ mutationFn: fetchOdds });

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) odds.mutate(file);
    },
    [odds],
  );

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-6 pt-16 pb-12">
      <header className="text-center">
        <h1 className="flex items-center justify-center gap-3 text-4xl font-bold tracking-wide">
          <Rocket className="size-9 text-gold" aria-hidden />
          Millennium Falcon
        </h1>
        <p className="mt-1 text-gold italic">What are the odds?</p>
      </header>

      <section className="text-center text-dim">
        {mission.data && (
          <p className="flex items-center justify-center gap-2">
            <Route className="size-4 shrink-0" aria-hidden />
            <span>
              Departing <strong>{mission.data.departure}</strong> for <strong>{mission.data.arrival}</strong>, autonomy{" "}
              <strong>{mission.data.autonomy}</strong> day{mission.data.autonomy === 1 ? "" : "s"}.
            </span>
          </p>
        )}
        {mission.isError && (
          <p className="flex items-start justify-center gap-2 text-alert">
            <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {mission.error instanceof ApiError ? mission.error.message : "Could not reach the onboard computer."}
          </p>
        )}
      </section>

      <section className="flex flex-col items-center gap-4 rounded-xl border border-seam bg-panel/80 p-8">
        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-gold px-6 py-3 font-semibold text-hull transition-colors hover:bg-gold/85 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold"
          htmlFor="empire-file"
        >
          <Upload className="size-5" aria-hidden />
          Upload empire.json
        </label>
        <input
          id="empire-file"
          className="sr-only"
          type="file"
          accept="application/json"
          onChange={handleFileChange}
        />

        {odds.isPending && (
          <p className="flex items-center gap-2 text-dim">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Computing the odds…
          </p>
        )}
        {odds.isError && (
          <p className="flex items-start gap-2 text-alert">
            <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {odds.error instanceof ApiError ? odds.error.message : "Could not compute the odds of success."}
          </p>
        )}
        {odds.isSuccess && <OddsDisplay result={odds.data} />}
      </section>
    </main>
  );
}
