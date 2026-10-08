// Валидация брони: B1–B7, B10–B12, title. Порядок проверок — docs/requirements.md, «Общие условия».
import {
  DURATION_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  TITLE_MAX_LENGTH,
  WORKDAY_END_MINUTES,
  WORKDAY_START_MINUTES,
} from "./constants";
import { overlaps } from "./overlap";
import { formatTime, isValidDate, parseTime } from "./time";
import type {
  Booking,
  BookingInput,
  RoomNow,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from "./types";

const WORKDAY = `${formatTime(WORKDAY_START_MINUTES)}–${formatTime(WORKDAY_END_MINUTES)}`;

/** Сообщения об ошибках правил (Q17): сервер берёт их отсюда же. */
export const MESSAGES = {
  BOOKING_LOCKED: "Бронь уже началась или прошла — изменить её нельзя",
  INVALID_DATE: "Дата должна быть в формате ГГГГ-ММ-ДД",
  INVALID_TIME: "Время должно быть в формате ЧЧ:ММ",
  OUTSIDE_WORKING_HOURS: `Бронь должна быть в пределах рабочего дня ${WORKDAY}`,
  START_NOT_BEFORE_END: "Окончание должно быть позже начала",
  DURATION_TOO_SHORT: `Минимальная длительность — ${MIN_DURATION_MINUTES} минут`,
  DURATION_TOO_LONG: `Максимальная длительность — ${MAX_DURATION_MINUTES / 60} часа`,
  DURATION_STEP: `Длительность должна быть кратна ${DURATION_STEP_MINUTES} минутам`,
  DATE_IN_PAST: "Нельзя бронировать на прошедшую дату",
  START_IN_PAST: "Это время уже прошло — выберите более позднее начало",
  TITLE_TOO_LONG: `Название не длиннее ${TITLE_MAX_LENGTH} символов`,
  OVERLAP: "Это время уже занято другой бронью",
} as const;

/** title (Q6): обрезка пробелов по краям, пустая строка — отсутствие названия. */
export function normalizeTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  return trimmed ? trimmed : undefined;
}

/** Две брони пересекаются: одна дата и пересечение полуоткрытых интервалов (B5). */
export function bookingsOverlap(a: BookingInput, b: BookingInput): boolean {
  if (a.date !== b.date) return false;
  const start = parseTime(a.start);
  const end = parseTime(a.end);
  return start !== null && end !== null && overlapsBooking({ start, end }, b);
}

/** Бронь начавшаяся или прошедшая: её дата раньше сегодняшней или start ≤ floor(now) (B11). */
export function isBookingLocked(booking: Booking, now: RoomNow): boolean {
  if (booking.date !== now.date) return booking.date < now.date;
  const start = parseTime(booking.start);
  return start === null || start <= now.minutes;
}

export function validateBooking(input: BookingInput, context: ValidationContext): ValidationResult {
  const { bookings, now, editingId } = context;

  // B11: начавшуюся бронь нельзя менять — остальное не проверяем.
  const original = editingId === undefined ? undefined : bookings.find((b) => b.id === editingId);
  if (original && isBookingLocked(original, now)) {
    return { ok: false, errors: [{ code: "BOOKING_LOCKED", message: MESSAGES.BOOKING_LOCKED }] };
  }

  // Формат (400): без корректных значений правила не проверить.
  const start = parseTime(input.start);
  const end = parseTime(input.end);
  const formatErrors: ValidationError[] = [];
  if (!isValidDate(input.date)) formatErrors.push({ code: "INVALID_REQUEST", field: "date", message: MESSAGES.INVALID_DATE });
  if (start === null) formatErrors.push({ code: "INVALID_REQUEST", field: "start", message: MESSAGES.INVALID_TIME });
  if (end === null) formatErrors.push({ code: "INVALID_REQUEST", field: "end", message: MESSAGES.INVALID_TIME });
  if (start === null || end === null || formatErrors.length > 0) return { ok: false, errors: formatErrors };

  const errors: ValidationError[] = [];
  const outside = (minutes: number) => minutes < WORKDAY_START_MINUTES || minutes > WORKDAY_END_MINUTES;

  // B1
  if (outside(start)) errors.push({ code: "OUTSIDE_WORKING_HOURS", field: "start", message: MESSAGES.OUTSIDE_WORKING_HOURS });
  else if (outside(end)) errors.push({ code: "OUTSIDE_WORKING_HOURS", field: "end", message: MESSAGES.OUTSIDE_WORKING_HOURS });

  // B2, затем B3, B4, B10 — только для корректного интервала.
  const duration = end - start;
  if (duration <= 0) {
    errors.push({ code: "START_NOT_BEFORE_END", field: "end", message: MESSAGES.START_NOT_BEFORE_END });
  } else {
    if (duration < MIN_DURATION_MINUTES) errors.push({ code: "DURATION_TOO_SHORT", field: "end", message: MESSAGES.DURATION_TOO_SHORT });
    if (duration > MAX_DURATION_MINUTES) errors.push({ code: "DURATION_TOO_LONG", field: "end", message: MESSAGES.DURATION_TOO_LONG });
    if (duration % DURATION_STEP_MINUTES !== 0) errors.push({ code: "DURATION_STEP", field: "end", message: MESSAGES.DURATION_STEP });
  }

  // B6, B12: YYYY-MM-DD после проверки формата сравнивается как строка фиксированной ширины.
  if (input.date < now.date) errors.push({ code: "DATE_IN_PAST", field: "date", message: MESSAGES.DATE_IN_PAST });
  else if (input.date === now.date && start < now.minutes) errors.push({ code: "START_IN_PAST", field: "start", message: MESSAGES.START_IN_PAST });

  // F4 (Q6): длина после обрезки пробелов.
  if (input.title !== undefined && input.title.trim().length > TITLE_MAX_LENGTH) {
    errors.push({ code: "TITLE_TOO_LONG", field: "title", message: MESSAGES.TITLE_TOO_LONG });
  }

  // B5, B7: пересечение с другими бронями той же даты; редактируемая бронь не мешает сама себе.
  if (duration > 0) {
    const conflict = bookings.find(
      (b) => b.date === input.date && b.id !== editingId && overlapsBooking({ start, end }, b),
    );
    if (conflict) errors.push({ code: "OVERLAP", message: MESSAGES.OVERLAP, conflictWith: conflict });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function overlapsBooking(interval: { start: number; end: number }, booking: BookingInput): boolean {
  const start = parseTime(booking.start);
  const end = parseTime(booking.end);
  return start !== null && end !== null && overlaps(interval, { start, end });
}
