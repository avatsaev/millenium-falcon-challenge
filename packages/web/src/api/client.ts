import { isRecord } from "./guards";
import type { OddsResponse, Universe } from "./types";

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

export async function fetchUniverse(): Promise<Universe> {
  const response = await fetch("/api/universe");
  return parseJsonOrThrow<Universe>(response);
}

export async function fetchOdds(empireFile: File): Promise<OddsResponse> {
  const formData = new FormData();
  formData.append("file", empireFile, empireFile.name);
  const response = await fetch("/api/odds", { method: "POST", body: formData });
  return parseJsonOrThrow<OddsResponse>(response);
}
