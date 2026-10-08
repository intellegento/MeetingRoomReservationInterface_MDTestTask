// Экран дня: дата из URL, брони, состояния U1–U3, только чтение для прошлого (F1, F2, B6, B11).
"use client";

import { useEffect, useId } from "react";
import { DateNav } from "@/components/day-view/date-nav";
import { DayEmpty } from "@/components/day-view/day-empty";
import { DayError } from "@/components/day-view/day-error";
import { DayGrid } from "@/components/day-view/day-grid";
import { DayLoading } from "@/components/day-view/day-loading";
import { ROOM_TIMEZONE } from "@/domain/constants";
import { getPastUntil, isPastDate } from "@/domain/day";
import { isBookingLocked } from "@/domain/rules";
import { getRoomNow, isValidDate } from "@/domain/time";
import { useDayBookings } from "../bookings/hooks";
import { getNow } from "../clock";

export type DateChangeMode = "push" | "replace";

export interface DayViewProps {
  /** Значение ?date из URL; null — параметра нет. */
  dateParam: string | null;
  onDateChange: (date: string, mode: DateChangeMode) => void;
}

// Форма и диалоги — этапы 5–6: пока заглушки без логики.
const notImplemented = () => {};

export function DayView({ dateParam, onDateChange }: DayViewProps) {
  const now = getRoomNow(getNow(), ROOM_TIMEZONE);
  const paramIsValid = dateParam !== null && isValidDate(dateParam);
  const date = paramIsValid ? dateParam : now.date;

  // Невалидная дата в URL заменяется сегодняшней без новой записи в истории.
  useEffect(() => {
    if (dateParam !== null && !paramIsValid) onDateChange(now.date, "replace");
  }, [dateParam, paramIsValid, now.date, onDateChange]);

  const query = useDayBookings(date);
  const pastDate = isPastDate(date, now);
  const pastNoteId = useId();

  const showSkeleton = query.data === undefined && !query.isError;
  const showIndicator = query.isFetching && !showSkeleton;

  return (
    <div className="day-view">
      <div className="day-view__toolbar">
        <DateNav date={date} today={now.date} onChange={(next) => onDateChange(next, "push")} />
        <button
          type="button"
          className="day-view__create"
          disabled={pastDate}
          aria-describedby={pastDate ? pastNoteId : undefined}
          onClick={notImplemented}
        >
          Новая бронь
        </button>
      </div>
      {pastDate && (
        <p id={pastNoteId} className="day-view__past-note">
          Прошедшая дата, бронирование недоступно
        </p>
      )}
      <section className="day-view__schedule" aria-label="Расписание дня" aria-busy={query.isFetching}>
        {showIndicator && (
          <p role="status" className="day-view__fetching">
            Загрузка…
          </p>
        )}
        {query.isError ? (
          <DayError onRetry={() => void query.refetch()} />
        ) : showSkeleton ? (
          <DayLoading />
        ) : query.data.length === 0 ? (
          <DayEmpty canCreate={!pastDate} onCreate={notImplemented} />
        ) : (
          <DayGrid
            items={query.data.map((booking) => ({ booking, locked: isBookingLocked(booking, now) }))}
            pastUntil={getPastUntil(date, now)}
            onSelect={notImplemented}
          />
        )}
      </section>
    </div>
  );
}
