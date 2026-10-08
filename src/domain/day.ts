// Прошедшее время дня (B6, B9): «сейчас» только параметром.
import { WORKDAY_END_MINUTES, WORKDAY_START_MINUTES } from "./constants";
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
