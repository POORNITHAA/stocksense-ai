import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message =
    err instanceof Error && err.message
      ? err.message
      : 'An unexpected server error occurred.';

  if (status >= 500) {
    console.error('[Server Error]', err);
  }

  res.status(status).json({
    error: status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : message,
  });
}
