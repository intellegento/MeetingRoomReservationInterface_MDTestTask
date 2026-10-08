// HTTP-реализация BookingsApi. Единственное место, где вызывается fetch (S1).
import type { Booking, BookingField } from "@/domain/types";
import type { BookingsApi, RequestOptions } from "./bookings-api";
import { ApiError, type ApiErrorCode } from "./errors";

/** Предел ожидания ответа, мс. Больше MOCK_DELAY_MAX_MS сервера (10 000, Q22). */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface HttpBookingsApiConfig {
  /** По умолчанию NEXT_PUBLIC_API_URL, иначе "/api". */
  baseUrl?: string;
  timeoutMs?: number;
  /** Подмена fetch (тесты). По умолчанию глобальный fetch. */
  fetch?: typeof fetch;
}

const NETWORK_MESSAGE = "Нет связи с сервером. Проверьте подключение и повторите";
const PARSE_MESSAGE = "Сервер вернул неожиданный ответ. Повторите позже";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Тело ошибки Q11: { error: { code, message, field?, details?, conflictWith? } }. */
function errorFromBody(status: number, body: unknown): ApiError {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string") {
    return new ApiError({ status, code: "PARSE", message: PARSE_MESSAGE });
  }
  return new ApiError({
    status,
    code: error.code as ApiErrorCode,
    message: error.message,
    field: error.field as BookingField | undefined,
    details: error.details,
    conflictWith: error.conflictWith as Booking | undefined,
  });
}

export function createHttpBookingsApi(config: HttpBookingsApiConfig = {}): BookingsApi {
  const baseUrl = config.baseUrl ?? (process.env.NEXT_PUBLIC_API_URL || "/api");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    const headers: Record<string, string> = { ...options.headers };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      // Отмена снаружи — не ошибка для UI: пробрасываем AbortError (D2).
      if (options.signal?.aborted) throw error;
      throw new ApiError({ status: 0, code: "NETWORK", message: NETWORK_MESSAGE });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ApiError({ status: response.status, code: "PARSE", message: PARSE_MESSAGE });
    }
    if (!response.ok) throw errorFromBody(response.status, parsed);
    return parsed as T;
  }

  return {
    list: (date, signal) =>
      request<Booking[]>("GET", `/bookings?date=${encodeURIComponent(date)}`, undefined, { signal }),
    create: (input, options) => request<Booking>("POST", "/bookings", input, options),
    update: (id, patch, options) => request<Booking>("PATCH", `/bookings/${encodeURIComponent(id)}`, patch, options),
    remove: (id, options) => request<void>("DELETE", `/bookings/${encodeURIComponent(id)}`, undefined, options),
  };
}

export const httpBookingsApi: BookingsApi = createHttpBookingsApi();
