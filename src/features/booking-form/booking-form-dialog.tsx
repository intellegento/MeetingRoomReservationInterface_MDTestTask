// Диалог формы брони: состояние формы (use-booking-form) + презентационный компонент.
"use client";

import type { RequestOptions } from "@/api/bookings-api";
import { BookingForm } from "@/components/booking-form/booking-form";
import type { Booking } from "@/domain/types";
import { useBookingForm, type FormTarget } from "./use-booking-form";

export interface BookingFormDialogProps {
  target: FormTarget;
  bookings: readonly Booking[];
  onClose: () => void;
  /** Успешное сохранение: сообщение для aria-live. */
  onSaved: (message: string) => void;
  /** Возврат фокуса на кнопку, открывшую форму (A2). */
  onCloseAutoFocus: (event: Event) => void;
  /** Параметры запроса сохранения (dev-панель, Q8). */
  takeRequest?: () => RequestOptions | undefined;
}

export function BookingFormDialog({ target, bookings, onClose, onSaved, onCloseAutoFocus, takeRequest }: BookingFormDialogProps) {
  const form = useBookingForm({ target, bookings, onSaved, takeRequest });
  return <BookingForm {...form} onClose={onClose} onCloseAutoFocus={onCloseAutoFocus} />;
}
