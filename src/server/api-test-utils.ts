// Помощники api-тестов: обработчики вызываются напрямую, Request → Response (docs/testing.md).
import type { Booking } from "@/domain/types";
import { handleCreateBooking, handleDeleteBooking, handleGetBookings, handleUpdateBooking } from "./handlers";

const BASE = "http://localhost/api/bookings";

type Headers = Record<string, string>;

/** Тело запроса: объект сериализуется в JSON, строка уходит как есть (битый JSON). */
const jsonInit = (method: string, body: unknown, headers: Headers): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

export const getBookings = (date?: string, headers: Headers = {}) =>
  handleGetBookings(new Request(date === undefined ? BASE : `${BASE}?date=${encodeURIComponent(date)}`, { headers }));

export const postBooking = (body: unknown, headers: Headers = {}) =>
  handleCreateBooking(new Request(BASE, jsonInit("POST", body, headers)));

export const patchBooking = (id: string, body: unknown, headers: Headers = {}) =>
  handleUpdateBooking(new Request(`${BASE}/${id}`, jsonInit("PATCH", body, headers)), id);

export const deleteBooking = (id: string, headers: Headers = {}) =>
  handleDeleteBooking(new Request(`${BASE}/${id}`, { method: "DELETE", headers }), id);

/** Единый формат тела ошибки (Q11). */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    details?: unknown;
    conflictWith?: Booking;
  };
}

export const readError = async (response: Response) => ((await response.json()) as ErrorBody).error;

export const readBooking = async (response: Response) => (await response.json()) as Booking;

/** Список броней на дату через GET (статус 200 проверяет вызывающий тест там, где это важно). */
export const listOn = async (date: string) => (await (await getBookings(date)).json()) as Booking[];
