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

export class FetchError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'FETCH_ERROR', cause)
    this.name = 'FetchError'
  }
}
