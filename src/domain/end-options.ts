// Варианты конца для select (B10, F3).
import { DURATION_STEP_MINUTES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from "./constants";
import { validateBooking } from "./rules";
import { formatTime, parseTime } from "./time";
import type { Booking, RoomNow, ValidationError } from "./types";

export interface EndOptionsSlot {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start: string;
}

/** Кандидат конца для select: доступен или недоступен с причиной — первой ошибкой validateBooking. */
export type EndOption = { end: string; available: true } | { end: string; available: false; reason: ValidationError };

/**
 * Кандидаты start + 30/60/90/120 по возрастанию с причиной недоступности (B10, F3): кандидат доступен,
 * если validateBooking проходит (≤ 18:00, не пересекает другие брони, старт не в прошлом).
 * Собственная бронь (editingId) не ограничивает (B7). Неверный формат начала — кандидатов нет.
 */
export function getEndOptions(
  slot: EndOptionsSlot,
  bookings: readonly Booking[],
  now: RoomNow,
  editingId?: string,
): EndOption[] {
  const start = parseTime(slot.start);
  if (start === null) return [];

  const context = editingId === undefined ? { bookings, now } : { bookings, now, editingId };
  const options: EndOption[] = [];
  for (let duration = MIN_DURATION_MINUTES; duration <= MAX_DURATION_MINUTES; duration += DURATION_STEP_MINUTES) {
    const end = formatTime(start + duration);
    const result = validateBooking({ date: slot.date, start: slot.start, end }, context);
    options.push(result.ok ? { end, available: true } : { end, available: false, reason: result.errors[0]! });
  }
  return options;
}

/** Допустимые значения конца "HH:mm" по возрастанию — доступные кандидаты getEndOptions. */
export function getAvailableEnds(
  slot: EndOptionsSlot,
  bookings: readonly Booking[],
  now: RoomNow,
  editingId?: string,
): string[] {
  return getEndOptions(slot, bookings, now, editingId)
    .filter((option) => option.available)
    .map((option) => option.end);
}
