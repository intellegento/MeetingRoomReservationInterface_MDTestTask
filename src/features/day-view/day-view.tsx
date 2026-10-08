// Экран дня: дата из URL, брони, состояния U1–U3, только чтение для прошлого, форма брони, удаление,
// dev-панель (F1–F6, B6, B8, B11, Q8).
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isNotFound } from "@/api/errors";
import { DateNav } from "@/components/day-view/date-nav";
import { DayEmpty } from "@/components/day-view/day-empty";
import { DayError } from "@/components/day-view/day-error";
import { DayGrid } from "@/components/day-view/day-grid";
import { DayLoading } from "@/components/day-view/day-loading";
import { DeleteBookingDialog } from "@/components/delete-dialog/delete-booking-dialog";
import { DevPanel } from "@/components/dev-panel/dev-panel";
import { ROOM_TIMEZONE } from "@/domain/constants";
import { getPastUntil, isPastDate } from "@/domain/day";
import { isBookingLocked } from "@/domain/rules";
import { getRoomNow, isValidDate } from "@/domain/time";
import type { Booking } from "@/domain/types";
import { BookingFormDialog } from "../booking-form/booking-form-dialog";
import type { FormTarget } from "../booking-form/use-booking-form";
import { useDayBookings, useDeleteBooking } from "../bookings/hooks";
import { presentApiError, type PresentedError } from "../bookings/present-api-error";
import { getNow } from "../clock";
import { devRequest, devToolsEnabled, type DevToolsState } from "./dev-tools";

export type DateChangeMode = "push" | "replace";

/** Пояснение к кнопкам, пока виден список прежней даты (J3, 8c). */
const STALE_NOTE = "Брони выбранной даты загружаются — действия недоступны";

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
  const staleNoteId = useId();
  // Пока виден список прежней даты (keepPreviousData), действия с ним и создание недоступны.
  const stale = query.isPlaceholderData;
  const createNotes = [pastDate ? pastNoteId : undefined, stale ? staleNoteId : undefined].filter(Boolean).join(" ");

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
    // Кнопка-источник могла исчезнуть («Забронировать» после создания) или бронь удалена — тогда «Новая бронь».
    const trigger = triggerRef.current;
    (trigger?.isConnected ? trigger : createRef.current)?.focus();
  };

  // Dev-панель (Q8): заголовки mock API для сохранения и удаления.
  const [devTools, setDevTools] = useState<DevToolsState>({ forceConflict: false, slowNetwork: false });
  const takeSaveRequest = () => {
    const request = devRequest(devTools, "save");
    if (devTools.forceConflict) setDevTools((prev) => ({ ...prev, forceConflict: false }));
    return request;
  };

  // Удаление (F6): подтверждение, pending, повтор; 404 — мягкий успех.
  const [deleting, setDeleting] = useState<{ booking: Booking; error?: PresentedError } | null>(null);
  const remove = useDeleteBooking();
  const openDelete = (booking: Booking, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setAnnouncement("");
    setDeleting({ booking });
  };
  const finishDelete = (message: string) => {
    // Кнопки удалённой брони больше нет — фокус на «Новая бронь» (A2).
    triggerRef.current = null;
    setDeleting(null);
    setAnnouncement(message);
  };
  const confirmDelete = () => {
    if (deleting === null || remove.isPending) return;
    const { booking } = deleting;
    remove.mutate(
      { id: booking.id, date: booking.date, request: devRequest(devTools, "delete") },
      {
        onSuccess: () => finishDelete("Бронь удалена"),
        onError: (error) =>
          isNotFound(error) ? finishDelete("Бронь уже удалена") : setDeleting({ booking, error: presentApiError(error) }),
      },
    );
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
          disabled={pastDate || stale}
          aria-describedby={createNotes || undefined}
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
      {stale && (
        <p id={staleNoteId} className="visually-hidden">
          {STALE_NOTE}
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
          <DayEmpty canCreate={!pastDate} onCreate={openCreate} staleNoteId={stale ? staleNoteId : undefined} />
        ) : (
          <DayGrid
            items={query.data.map((booking) => ({ booking, locked: isBookingLocked(booking, now) }))}
            pastUntil={getPastUntil(date, now)}
            onSelect={openBooking}
            onDelete={openDelete}
            staleNoteId={stale ? staleNoteId : undefined}
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
          takeRequest={takeSaveRequest}
        />
      )}
      {deleting && (
        <DeleteBookingDialog
          label={deleting.booking.title === undefined ? `${deleting.booking.start}–${deleting.booking.end}` : `${deleting.booking.start}–${deleting.booking.end} «${deleting.booking.title}»`}
          pending={remove.isPending}
          error={deleting.error}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          onCloseAutoFocus={returnFocus}
        />
      )}
      {devToolsEnabled() && (
        <DevPanel
          forceConflict={devTools.forceConflict}
          slowNetwork={devTools.slowNetwork}
          onForceConflictChange={(forceConflict) => setDevTools((prev) => ({ ...prev, forceConflict }))}
          onSlowNetworkChange={(slowNetwork) => setDevTools((prev) => ({ ...prev, slowNetwork }))}
        />
      )}
    </div>
  );
}
