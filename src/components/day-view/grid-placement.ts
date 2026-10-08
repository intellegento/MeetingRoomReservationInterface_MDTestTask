// Позиция блока в сетке дня: ряды по 30 минут от начала рабочего дня (F2).
import { DURATION_STEP_MINUTES, WORKDAY_END_MINUTES, WORKDAY_START_MINUTES } from "@/domain/constants";
import { formatTime, parseTime } from "@/domain/time";

export const ROW_MINUTES = DURATION_STEP_MINUTES;
export const ROW_COUNT = (WORKDAY_END_MINUTES - WORKDAY_START_MINUTES) / ROW_MINUTES;

/** Подписи рядов: начало каждого ряда, HH:mm. */
export const ROW_LABELS = Array.from({ length: ROW_COUNT }, (_, i) => formatTime(WORKDAY_START_MINUTES + i * ROW_MINUTES));

export interface GridPlacement {
  /** Первый ряд (с 1), который задевает интервал. */
  rowStart: number;
  /** Линия сетки после последнего задетого ряда (grid-row-end). */
  rowEnd: number;
  /** Минуты от начала первого ряда до начала интервала. */
  insetTop: number;
  /** Минуты от конца интервала до конца последнего ряда. */
  insetBottom: number;
}

export function getGridPlacement(start: string, end: string): GridPlacement {
  return getGridPlacementMinutes(parseTime(start) ?? WORKDAY_START_MINUTES, parseTime(end) ?? WORKDAY_START_MINUTES);
}

export function getGridPlacementMinutes(start: number, end: number): GridPlacement {
  const fromStart = start - WORKDAY_START_MINUTES;
  const toEnd = end - WORKDAY_START_MINUTES;
  const firstRow = Math.floor(fromStart / ROW_MINUTES);
  const lastLine = Math.ceil(toEnd / ROW_MINUTES);
  return {
    rowStart: firstRow + 1,
    rowEnd: lastLine + 1,
    insetTop: fromStart - firstRow * ROW_MINUTES,
    insetBottom: lastLine * ROW_MINUTES - toEnd,
  };
}
