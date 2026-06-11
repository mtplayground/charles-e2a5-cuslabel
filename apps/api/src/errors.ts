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

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
