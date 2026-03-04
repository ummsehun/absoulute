import type { AppError, ErrorCode } from "../../types/contracts";

export function makeAppError(
  code: ErrorCode,
  message: string,
  recoverable = true,
  details?: Record<string, unknown>,
): AppError {
  return {
    code,
    message,
    recoverable,
    details,
  };
}

export function unknownToAppError(error: unknown): AppError {
  if (isAppErrorLike(error)) {
    return error;
  }

  return makeAppError("E_IO", "Unknown error", false, {
    raw: String(error),
  });
}

function isAppErrorLike(value: unknown): value is AppError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<AppError>;
  return (
    typeof maybe.code === "string" &&
    typeof maybe.message === "string" &&
    typeof maybe.recoverable === "boolean"
  );
}
