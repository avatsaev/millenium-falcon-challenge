export interface MissionInfo {
  readonly departure: string;
  readonly arrival: string;
  readonly autonomy: number;
}

export interface OddsResponse {
  readonly odds: number;
  readonly oddsPercent: number;
  readonly reachable: boolean;
  readonly minRiskEncounters: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class ApiError extends Error {}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload["error"] === "string" ? payload["error"] : `request failed with status ${response.status}`;
    throw new ApiError(message);
  }
  // The backend's response contract is validated server-side; trusted same-origin API, not
  // third-party input, so the payload is cast to its known shape here.
  return payload as T;
}

export async function fetchMission(): Promise<MissionInfo> {
  const response = await fetch("/api/mission");
  return parseJsonOrThrow<MissionInfo>(response);
}

export async function fetchOdds(empireFile: File): Promise<OddsResponse> {
  const formData = new FormData();
  formData.append("file", empireFile, empireFile.name);
  const response = await fetch("/api/odds", { method: "POST", body: formData });
  return parseJsonOrThrow<OddsResponse>(response);
}
