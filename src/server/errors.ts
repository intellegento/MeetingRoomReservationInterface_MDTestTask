// Единый формат ошибки (Q11): { error: { code, message, field?, details?, conflictWith? } }.
import type { Booking, BookingField, ValidationErrorCode } from "@/domain/types";

export type ApiErrorCode = ValidationErrorCode | "NOT_FOUND";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  field?: BookingField;
  details?: unknown;
  conflictWith?: Booking;
}

/** 400 — битый запрос, 404 — нет брони, 409 — только пересечение, 422 — остальные правила. */
function statusOf(code: ApiErrorCode): number {
  if (code === "INVALID_REQUEST") return 400;
  if (code === "NOT_FOUND") return 404;
  if (code === "OVERLAP") return 409;
  return 422;
}

export function errorResponse(error: ApiError): Response {
  return Response.json({ error }, { status: statusOf(error.code) });
}

export function invalidRequest(message: string, field?: BookingField, details?: unknown): Response {
  return errorResponse({ code: "INVALID_REQUEST", message, field, details });
}

export const notFound = () => errorResponse({ code: "NOT_FOUND", message: "Бронь не найдена — возможно, её уже удалили" });
