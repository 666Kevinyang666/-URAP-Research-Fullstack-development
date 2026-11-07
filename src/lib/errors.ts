// Errors that API route handlers (withSession in @/lib/api) turn into a status code.

/** 409: the request conflicts with the current state (e.g. editing a complete task). */
export class ConflictError extends Error {}

/** 422: the answer is too short to mark the task complete (see minAnswerCharsToComplete). */
export class AnswerTooShortError extends Error {}
