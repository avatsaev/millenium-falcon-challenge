/** Canonical type guard for narrowing unknown JSON payloads to plain objects. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
