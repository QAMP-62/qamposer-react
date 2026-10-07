/** Error from a hardware provider; `status` is the HTTP status when there is one */
export class HardwareRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HardwareRequestError';
    this.status = status;
  }

  /** The session is missing or expired: the user must connect again */
  get needsReconnect(): boolean {
    return this.status === 401;
  }
}
