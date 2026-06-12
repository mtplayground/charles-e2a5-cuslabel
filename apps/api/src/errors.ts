import { ZodError } from "zod";

export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequestFromZod(error: ZodError): HttpError {
  return new HttpError(400, "Invalid request.", error.flatten());
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function malformedJson(): HttpError {
  return new HttpError(400, "Malformed JSON request body.");
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 400 &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}
