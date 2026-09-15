/** Raised when a millennium-falcon.json / empire.json / routes database fails validation. */
export class InvalidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigError";
  }
}
