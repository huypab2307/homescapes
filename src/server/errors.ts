export class SessionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}
