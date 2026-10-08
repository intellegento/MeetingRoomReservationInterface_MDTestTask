import type { Interval } from "./types";

/** Пересечение полуоткрытых интервалов: строго a.start < b.end && b.start < a.end (B5). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
