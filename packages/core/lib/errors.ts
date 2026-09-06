/** Base error carrying a stable `code` for programmatic handling and an optional `cause`. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Thrown by `api/fetch.ts` when a request fails or returns a non-2xx status. */
export class FetchError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'FETCH_ERROR', cause)
    this.name = 'FetchError'
  }
}
