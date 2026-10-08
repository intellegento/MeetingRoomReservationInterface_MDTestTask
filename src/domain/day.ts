// Прошедшее время дня (B6, B9): «сейчас» только параметром.
import { MIN_DURATION_MINUTES, WORKDAY_END_MINUTES, WORKDAY_START_MINUTES } from "./constants";
import { formatTime } from "./time";
import type { RoomNow } from "./types";

/** Дата раньше сегодняшней в поясе комнаты (B6, Q13). Даты YYYY-MM-DD сравниваются как строки. */
export function isPastDate(date: string, now: RoomNow): boolean {
  return date < now.date;
}

/**
 * Минута, до которой день прошёл, в пределах рабочего дня (B6): прошедшая дата — до конца дня,
 * будущая — ничего, сегодня — floor(now), обрезанный границами рабочего дня.
 */
export function getPastUntil(date: string, now: RoomNow): number {
  if (isPastDate(date, now)) return WORKDAY_END_MINUTES;
  if (date > now.date) return WORKDAY_START_MINUTES;
  return Math.min(Math.max(now.minutes, WORKDAY_START_MINUTES), WORKDAY_END_MINUTES);
}

/**
 * Самое раннее допустимое начало на дату без учёта броней (B1, B3, B6, B12): будущая дата — начало
 * рабочего дня, сегодня — floor(now), но не раньше начала дня. null — до конца дня не остаётся
 * минимальной длительности или дата прошла.
 */
export function getEarliestStart(date: string, now: RoomNow): string | null {
  if (isPastDate(date, now)) return null;
  const earliest = date === now.date ? Math.max(now.minutes, WORKDAY_START_MINUTES) : WORKDAY_START_MINUTES;
  return earliest + MIN_DURATION_MINUTES > WORKDAY_END_MINUTES ? null : formatTime(earliest);
}
