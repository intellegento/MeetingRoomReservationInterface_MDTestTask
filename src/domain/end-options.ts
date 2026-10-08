// Варианты конца для select (B10, F3).
import { DURATION_STEP_MINUTES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, WORKDAY_END_MINUTES } from "./constants";
import { validateBooking } from "./rules";
import { formatTime, parseTime } from "./time";
import type { Booking, RoomNow } from "./types";

export interface EndOptionsSlot {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start: string;
}

/**
 * Допустимые значения конца "HH:mm" по возрастанию: start + 30/60/90/120, для каждого
 * validateBooking проходит (≤ 18:00, не пересекает другие брони, старт не в прошлом).
 * Собственная бронь (editingId) не ограничивает (B7).
 */
export function getAvailableEnds(
  slot: EndOptionsSlot,
  bookings: readonly Booking[],
  now: RoomNow,
  editingId?: string,
): string[] {
  const start = parseTime(slot.start);
  if (start === null) return [];

  const ends: string[] = [];
  for (let duration = MIN_DURATION_MINUTES; duration <= MAX_DURATION_MINUTES; duration += DURATION_STEP_MINUTES) {
    if (start + duration > WORKDAY_END_MINUTES) break;
    const end = formatTime(start + duration);
    const context = editingId === undefined ? { bookings, now } : { bookings, now, editingId };
    if (validateBooking({ date: slot.date, start: slot.start, end }, context).ok) ends.push(end);
  }
  return ends;
}
