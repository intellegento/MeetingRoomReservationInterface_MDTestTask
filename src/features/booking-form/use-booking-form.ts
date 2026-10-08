// Состояние формы брони (F3–F5, U3, U4). Значения живут в форме и не зависят от кэша списка (Q7);
// все правила — вызовы src/domain, форма только выбирает, где и когда показать ошибку.
"use client";

import { useRef, useState } from "react";
import type { BookingPatch } from "@/api/bookings-api";
import { isValidation, type ApiError } from "@/api/errors";
import type { EndChoice, FormField, FormValues } from "@/components/booking-form/booking-form";
import { ROOM_TIMEZONE } from "@/domain/constants";
import { getEarliestStart } from "@/domain/day";
import { getEndOptions } from "@/domain/end-options";
import { isBookingLocked, MESSAGES, normalizeTitle, validateBooking, validateStart } from "@/domain/rules";
import { getRoomNow } from "@/domain/time";
import type { Booking, BookingInput, RoomNow, ValidationContext, ValidationError } from "@/domain/types";
import { useCreateBooking, useUpdateBooking } from "../bookings/hooks";
import { getNow } from "../clock";

export type FormTarget = { mode: "create"; date: string } | { mode: "edit"; booking: Booking };

const FIELDS: readonly FormField[] = ["start", "end", "title"];
const isFormField = (field: string | undefined): field is FormField => FIELDS.includes(field as FormField);

/** Текст для пустого поля: что поле пустое и потому невалидно, решает domain (INVALID_REQUEST). */
const EMPTY_TEXT: Partial<Record<FormField, string>> = {
  start: "Укажите время начала",
  end: "Выберите время окончания",
};

const UNAVAILABLE_TODAY = "На сегодня бронирование уже недоступно";

interface ClientCheck {
  byField: Partial<Record<FormField, string>>;
  /** Ошибки без поля формы: пересечение, начавшаяся бронь, дата. */
  other: ValidationError[];
}

function checkValues(input: BookingInput, values: FormValues, context: ValidationContext): ClientCheck {
  const result = validateBooking(input, context);
  let errors = result.ok ? [] : result.errors;
  // Без конца validateBooking останавливается на формате; ошибки начала и даты — из validateStart.
  if (input.end === "" && !errors.some((error) => error.field === "start")) {
    const start = validateStart(input.date, input.start, context.now);
    if (!start.ok) errors = [...errors, ...start.errors];
  }

  const check: ClientCheck = { byField: {}, other: [] };
  for (const error of errors) {
    if (!isFormField(error.field)) {
      check.other.push(error);
    } else if (check.byField[error.field] === undefined) {
      const empty = error.code === "INVALID_REQUEST" && values[error.field] === "";
      check.byField[error.field] = (empty ? EMPTY_TEXT[error.field] : undefined) ?? error.message;
    }
  }
  return check;
}

const roomNow = (): RoomNow => getRoomNow(getNow(), ROOM_TIMEZONE);

export interface UseBookingFormOptions {
  target: FormTarget;
  /** Брони дня из списка экрана — только для проверок (Q7): значения формы от них не зависят. */
  bookings: readonly Booking[];
  onSaved: (message: string) => void;
}

export function useBookingForm({ target, bookings, onSaved }: UseBookingFormOptions) {
  const original = target.mode === "edit" ? target.booking : undefined;
  const date = original?.date ?? (target.mode === "create" ? target.date : "");
  const editingId = original?.id;
  const initial: FormValues = { start: original?.start ?? "", end: original?.end ?? "", title: original?.title ?? "" };

  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  // Сброшенный конец (F3). Запоминается: при вводе времени с клавиатуры начало проходит
  // промежуточные значения (13:0… → 13:03 → 13:30), и конец, снова допустимый, возвращается.
  const [resetEnd, setResetEnd] = useState<string>();
  const [serverErrors, setServerErrors] = useState<Partial<Record<FormField, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [lockedNote, setLockedNote] = useState<string>();
  const submitting = useRef(false);
  const fieldRefs = {
    start: useRef<HTMLInputElement>(null),
    end: useRef<HTMLSelectElement>(null),
    title: useRef<HTMLInputElement>(null),
  };

  const create = useCreateBooking();
  const update = useUpdateBooking();
  const pending = create.isPending || update.isPending;

  const now = roomNow();
  const context = (at: RoomNow): ValidationContext =>
    editingId === undefined ? { bookings, now: at } : { bookings, now: at, editingId };
  const title = normalizeTitle(values.title);
  const input: BookingInput = title === undefined ? { date, start: values.start, end: values.end } : { date, start: values.start, end: values.end, title };

  const earliestStart = getEarliestStart(date, now);
  const unavailableNote = target.mode === "create" && earliestStart === null ? UNAVAILABLE_TODAY : undefined;
  const readOnlyNote = lockedNote ?? (original && isBookingLocked(original, now) ? MESSAGES.BOOKING_LOCKED : undefined);

  const endOptionsFor = (start: string) => (start === "" ? [] : getEndOptions({ date, start }, bookings, now, editingId));
  const endOptions = endOptionsFor(values.start);
  const endChoices: EndChoice[] =
    readOnlyNote !== undefined
      ? [{ value: values.end, label: values.end, disabled: false }]
      : endOptions.map((option) => ({
          value: option.end,
          label: option.available ? option.end : `${option.end} — недоступно: ${option.reason.message}`,
          disabled: !option.available,
        }));
  const noEnds = readOnlyNote === undefined && endOptions.length > 0 && endOptions.every((option) => !option.available);

  const check = checkValues(input, values, context(now));
  const errors: Partial<Record<FormField, string>> = {};
  for (const field of FIELDS) {
    const message = serverErrors[field] ?? (touched[field] || submitted ? check.byField[field] : undefined);
    if (message !== undefined) errors[field] = message;
  }
  const clientMessages = [...FIELDS.flatMap((field) => check.byField[field] ?? []), ...check.other.map((error) => error.message)];
  const summary = submitted && readOnlyNote === undefined ? clientMessages : [];

  const changed =
    original === undefined ||
    values.start !== original.start ||
    values.end !== original.end ||
    title !== normalizeTitle(original.title);

  const onChange = (field: FormField, value: string) => {
    const next = { ...values, [field]: value };
    const clearedErrors = { ...serverErrors, [field]: undefined };
    const wantedEnd = values.end !== "" ? values.end : resetEnd;
    if (field === "start" && wantedEnd !== undefined) {
      const available = endOptionsFor(value).some((option) => option.available && option.end === wantedEnd);
      if (available) {
        next.end = wantedEnd;
        setResetEnd(undefined);
      } else {
        next.end = "";
        clearedErrors.end = undefined;
        setResetEnd(wantedEnd);
      }
    }
    if (field === "end") setResetEnd(undefined);
    setValues(next);
    setServerErrors(clearedErrors);
  };

  const onBlur = (field: FormField) => setTouched((prev) => ({ ...prev, [field]: true }));

  const onServerError = (error: ApiError) => {
    if (error.code === "BOOKING_LOCKED") setLockedNote(error.message);
    else if (isValidation(error) && isFormField(error.field)) setServerErrors((prev) => ({ ...prev, [error.field as FormField]: error.message }));
    else setFormError(error.message);
  };

  const onSubmit = () => {
    // Второй submit до ответа сервера не уходит (U4, T8).
    if (submitting.current || readOnlyNote !== undefined || !changed) return;
    setSubmitted(true);
    setFormError(undefined);

    // Часы клиента на момент отправки (B12): бронь могла начаться, пока форма открыта.
    const atSubmit = checkValues(input, values, context(roomNow()));
    const locked = atSubmit.other.find((error) => error.code === "BOOKING_LOCKED");
    if (locked) {
      setLockedNote(locked.message);
      return;
    }
    const firstInvalid = FIELDS.find((field) => atSubmit.byField[field] !== undefined);
    if (firstInvalid !== undefined || atSubmit.other.length > 0) {
      if (firstInvalid !== undefined) fieldRefs[firstInvalid].current?.focus();
      return;
    }

    submitting.current = true;
    const settle = { onSettled: () => void (submitting.current = false), onError: onServerError };
    if (original === undefined) {
      create.mutate({ input }, { ...settle, onSuccess: () => onSaved("Бронь создана") });
    } else {
      const patch: BookingPatch = {};
      if (values.start !== original.start) patch.start = values.start;
      if (values.end !== original.end) patch.end = values.end;
      if (title !== normalizeTitle(original.title)) patch.title = title ?? "";
      update.mutate({ id: original.id, patch, previousDate: original.date }, { ...settle, onSuccess: () => onSaved("Изменения сохранены") });
    }
  };

  const heading = target.mode === "create" ? "Новая бронь" : readOnlyNote !== undefined ? "Бронь" : "Изменить бронь";

  return {
    heading,
    date,
    unavailableNote,
    readOnlyNote,
    values,
    startMin: earliestStart ?? undefined,
    endChoices,
    noEnds,
    endReset: resetEnd !== undefined,
    errors,
    summary,
    formError,
    pending,
    canSave: changed,
    fieldRefs,
    onChange,
    onBlur,
    onSubmit,
  };
}
