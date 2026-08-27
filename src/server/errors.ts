export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Okänt fel";
}
