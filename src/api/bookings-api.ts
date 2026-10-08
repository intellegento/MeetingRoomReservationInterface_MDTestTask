// Контракт клиента (S2): UI знает только этот интерфейс. Другой бэкенд с тем же
// HTTP-контрактом — другой baseUrl; другой транспорт — другая реализация.
import type { Booking, BookingInput } from "@/domain/types";

export interface RequestOptions {
  signal?: AbortSignal;
  /** Дополнительные заголовки запроса (dev-панель: X-Mock-Force-Conflict, X-Mock-Delay — Q8). */
  headers?: Readonly<Record<string, string>>;
}

/** PATCH частичный (Q12): title "" стирает название. */
export type BookingPatch = Partial<BookingInput>;

export interface BookingsApi {
  /** GET /bookings?date= — брони дня по возрастанию start. */
  list(date: string, signal?: AbortSignal): Promise<Booking[]>;
  /** POST /bookings → 201 Booking. */
  create(input: BookingInput, options?: RequestOptions): Promise<Booking>;
  /** PATCH /bookings/:id → 200 Booking. */
  update(id: string, patch: BookingPatch, options?: RequestOptions): Promise<Booking>;
  /** DELETE /bookings/:id → 204. */
  remove(id: string, options?: RequestOptions): Promise<void>;
}
