// Тексты ошибок API для UI (U3, B8, Q7, Q11): единственное место, где они формулируются.
// Форма и диалог удаления получают готовые строки; policy-check запрещает их повтор в других файлах src.
import { ApiError } from "@/api/errors";
import type { FormField } from "@/components/booking-form/booking-form";
import type { Booking } from "@/domain/types";

export interface PresentedError {
  title: string;
  description?: string;
  /** Пометки полей формы: 422 с полем, конфликт 409. */
  fieldErrors: Partial<Record<FormField, string>>;
}

const FORM_FIELDS: readonly string[] = ["start", "end", "title"] satisfies FormField[];
const isFormField = (field: string | undefined): field is FormField => FORM_FIELDS.includes(field ?? "");

const RETRY = "Повторите попытку";
const SERVER_STATUS_MIN = 500;

/** «10:00–11:00 «Планёрка»» или «10:00–11:00» без названия. */
const describeBooking = (booking: Booking) =>
  booking.title === undefined ? `${booking.start}–${booking.end}` : `${booking.start}–${booking.end} «${booking.title}»`;

function presentConflict(conflictWith: Booking | undefined): PresentedError {
  const title =
    conflictWith === undefined
      ? "Это время только что заняли. Выберите другой интервал"
      : `Это время только что заняли: ${describeBooking(conflictWith)}. Выберите другой интервал`;
  const mark = conflictWith === undefined ? "Интервал занят" : `Пересекается с бронью ${describeBooking(conflictWith)}`;
  return { title, description: "Список броней обновлён", fieldErrors: { start: mark, end: mark } };
}

export function presentApiError(error: unknown): PresentedError {
  if (!(error instanceof ApiError)) return { title: "Что-то пошло не так", description: RETRY, fieldErrors: {} };
  // Коды, а не guards из src/api: guard `error is ApiError` в ветке «нет» сужает ApiError до never.
  if (error.code === "OVERLAP") return presentConflict(error.conflictWith);
  if (error.code === "NOT_FOUND") {
    return {
      title: "Бронь была удалена",
      description: "Введённые данные сохранены — их можно сохранить как новую бронь",
      fieldErrors: {},
    };
  }
  if (error.code === "NETWORK") return { title: "Нет связи с сервером", description: "Проверьте подключение и повторите", fieldErrors: {} };
  if (error.status >= SERVER_STATUS_MIN) return { title: "Ошибка сервера", description: RETRY, fieldErrors: {} };
  if (error.code === "PARSE") return { title: "Сервер вернул неожиданный ответ", description: RETRY, fieldErrors: {} };
  // 422: текст правила domain, который вернул сервер (Q11).
  if (error.status === 422) {
    return { title: error.message, fieldErrors: isFormField(error.field) ? { [error.field]: error.message } : {} };
  }
  // 400 и прочие коды: запрос не принят — общий баннер (Q11).
  return { title: "Сервер не принял запрос", description: "Проверьте введённые значения и повторите", fieldErrors: {} };
}

/** Ошибку можно повторить тем же запросом: 5xx и сеть (U3, D4). */
export const isRetryable = (error: unknown): boolean =>
  error instanceof ApiError && (error.code === "NETWORK" || error.status >= SERVER_STATUS_MIN);
