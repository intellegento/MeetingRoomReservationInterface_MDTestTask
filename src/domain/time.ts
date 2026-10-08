// Время и даты: «сейчас» только параметром, без системных часов и без toISOString (B9, T1, T5).
import type { RoomNow } from "./types";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** "HH:mm" → минуты от полуночи; null, если формат неверный (строго две цифры, 00:00–23:59). */
export function parseTime(value: string): number | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Минуты от полуночи → "HH:mm". */
export function formatTime(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12) return null;
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  if (day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

/** Строгий YYYY-MM-DD с существующей календарной датой. */
export function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** Календарная арифметика над YYYY-MM-DD без перевода через пояс процесса. */
export function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  if (!parsed) throw new Error(`addDays: неверная дата «${date}»`);
  // Только UTC-методы: пояс процесса не участвует.
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * MS_PER_DAY);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Момент времени → «сейчас» в поясе timeZone (через Intl), секунды отброшены (B9, B12). */
export function getRoomNow(instant: Date, timeZone: string): RoomNow {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
