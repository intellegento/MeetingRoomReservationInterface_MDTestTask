// Экран дня: дата из URL, брони, состояния U1–U3, только чтение для прошлого, форма брони (F1–F5, B6, B11).
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DateNav } from "@/components/day-view/date-nav";
import { DayEmpty } from "@/components/day-view/day-empty";
import { DayError } from "@/components/day-view/day-error";
import { DayGrid } from "@/components/day-view/day-grid";
import { DayLoading } from "@/components/day-view/day-loading";
import { ROOM_TIMEZONE } from "@/domain/constants";
import { getPastUntil, isPastDate } from "@/domain/day";
import { isBookingLocked } from "@/domain/rules";
import { getRoomNow, isValidDate } from "@/domain/time";
import type { Booking } from "@/domain/types";
import { BookingFormDialog } from "../booking-form/booking-form-dialog";
import type { FormTarget } from "../booking-form/use-booking-form";
import { useDayBookings } from "../bookings/hooks";
import { getNow } from "../clock";

export type DateChangeMode = "push" | "replace";

export interface DayViewProps {
  /** Значение ?date из URL; null — параметра нет. */
  dateParam: string | null;
  onDateChange: (date: string, mode: DateChangeMode) => void;
}

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

  // Форма брони (этап 5): что открыто, какая кнопка открыла (для возврата фокуса), объявление успеха.
  const [form, setForm] = useState<{ target: FormTarget; key: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const openForm = (target: FormTarget, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setAnnouncement("");
    setForm((prev) => ({ target, key: (prev?.key ?? 0) + 1 }));
  };
  const openCreate = (trigger: HTMLElement) => openForm({ mode: "create", date }, trigger);
  const openBooking = (booking: Booking, trigger: HTMLElement) => openForm({ mode: "edit", booking }, trigger);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    // Кнопка-источник могла исчезнуть («Забронировать» после создания) — тогда «Новая бронь».
    const trigger = triggerRef.current;
    (trigger?.isConnected ? trigger : createRef.current)?.focus();
  };

  const showSkeleton = query.data === undefined && !query.isError;
  const showIndicator = query.isFetching && !showSkeleton;

  return (
    <div className="day-view">
      <div className="day-view__toolbar">
        <DateNav date={date} today={now.date} onChange={(next) => onDateChange(next, "push")} />
        <button
          type="button"
          className="day-view__create"
          ref={createRef}
          disabled={pastDate}
          aria-describedby={pastDate ? pastNoteId : undefined}
          onClick={(event) => openCreate(event.currentTarget)}
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
          <DayEmpty canCreate={!pastDate} onCreate={openCreate} />
        ) : (
          <DayGrid
            items={query.data.map((booking) => ({ booking, locked: isBookingLocked(booking, now) }))}
            pastUntil={getPastUntil(date, now)}
            onSelect={openBooking}
          />
        )}
      </section>
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      {form && (
        <BookingFormDialog
          key={form.key}
          target={form.target}
          bookings={query.data ?? []}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            setAnnouncement(message);
          }}
          onCloseAutoFocus={returnFocus}
        />
      )}
    </div>
  );
}
