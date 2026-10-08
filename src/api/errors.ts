// Ошибки сетевого слоя (U3, Q11). Тело ошибки сервера:
// { error: { code, message, field?, details?, conflictWith? } }.
import type { Booking, BookingField, ValidationErrorCode } from "@/domain/types";

/**
 * Коды сервера + коды клиента: NETWORK — сеть недоступна или таймаут,
 * PARSE — тело ответа не JSON или не в формате Q11.
 */
export type ApiErrorCode = ValidationErrorCode | "NOT_FOUND" | "NETWORK" | "PARSE";

export interface ApiErrorInit {
  /** HTTP-статус; 0 — ответа не было (NETWORK). */
  status: number;
  code: ApiErrorCode;
  message: string;
  field?: BookingField;
  details?: unknown;
  conflictWith?: Booking;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly field?: BookingField;
  readonly details?: unknown;
  readonly conflictWith?: Booking;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.field = init.field;
    this.details = init.details;
    this.conflictWith = init.conflictWith;
  }
}

/** 409: интервал занят (B5, B8). */
export function isConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "OVERLAP";
}

/** 422: нарушение бизнес-правил (Q11). */
export function isValidation(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 422 && error.code !== "PARSE";
}

/** 404: брони нет (F5, F6, Q7). */
export function isNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "NOT_FOUND";
}

/** Ответа не было: офлайн, сбой сети, таймаут. */
export function isNetwork(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "NETWORK";
}
