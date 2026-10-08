// In-memory store на globalThis с seed (Q9, Q16, D3): переживает перезагрузку модулей в dev.
import { ROOM_TIMEZONE } from "@/domain/constants";
import { getRoomNow, parseTime } from "@/domain/time";
import type { Booking, BookingInput } from "@/domain/types";
import { getNow } from "./clock";
import { createSeed } from "./seed";

const STORE_KEY = Symbol.for("meeting-room.bookings-store");

/** null — store ещё не заполнен: seed при первом обращении. */
type StoreHolder = typeof globalThis & { [STORE_KEY]?: Map<string, Booking> | null };

const holder = globalThis as StoreHolder;

export const newBookingId = (): string => crypto.randomUUID();

const withId = (id: string, input: BookingInput): Booking =>
  input.title === undefined
    ? { id, date: input.date, start: input.start, end: input.end }
    : { id, date: input.date, start: input.start, end: input.end, title: input.title };

function bookings(): Map<string, Booking> {
  let map = holder[STORE_KEY];
  if (!map) {
    map = new Map();
    for (const input of createSeed(getRoomNow(getNow(), ROOM_TIMEZONE).date)) {
      const booking = withId(newBookingId(), input);
      map.set(booking.id, booking);
    }
    holder[STORE_KEY] = map;
  }
  return map;
}

const startMinutes = (booking: Booking) => parseTime(booking.start) ?? 0;

export const listAll = (): Booking[] => [...bookings().values()];

export const listByDate = (date: string): Booking[] =>
  listAll()
    .filter((b) => b.date === date)
    .sort((a, b) => startMinutes(a) - startMinutes(b));

export const findBooking = (id: string): Booking | undefined => bookings().get(id);

export function saveBooking(id: string, input: BookingInput): Booking {
  const booking = withId(id, input);
  bookings().set(id, booking);
  return booking;
}

export const removeBooking = (id: string): void => {
  bookings().delete(id);
};

/**
 * Только для тестов: заменить содержимое store. Без аргумента store очищается
 * и при следующем обращении заполняется seed-бронями от «сегодня» по поясу комнаты.
 */
export function resetStore(list?: readonly Booking[]): void {
  holder[STORE_KEY] = list === undefined ? null : new Map(list.map((b) => [b.id, { ...b }]));
}
