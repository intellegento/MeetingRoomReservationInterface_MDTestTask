// Форма брони в модальном диалоге (F3–F5, U4, A2). Только отображение: значения, ошибки и колбэки — через props.
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useRef, type FormEvent, type RefObject } from "react";
import { TITLE_MAX_LENGTH } from "@/domain/constants";

export type FormField = "start" | "end" | "title";

export interface FormValues {
  start: string;
  end: string;
  title: string;
}

export interface EndChoice {
  value: string;
  label: string;
  disabled: boolean;
}

export interface BookingFormProps {
  heading: string;
  date: string;
  /** Сегодня бронирование недоступно: вместо полей — сообщение (B6). */
  unavailableNote?: string;
  /** Только чтение с пояснением (B11). */
  readOnlyNote?: string;
  values: FormValues;
  startMin?: string;
  endChoices: readonly EndChoice[];
  noEnds: boolean;
  endReset: boolean;
  errors: Partial<Record<FormField, string>>;
  /** Сводка ошибок после попытки отправки. */
  summary: readonly string[];
  /** Ошибка без поля над формой. */
  formError?: string;
  pending: boolean;
  canSave: boolean;
  fieldRefs: {
    start: RefObject<HTMLInputElement | null>;
    end: RefObject<HTMLSelectElement | null>;
    title: RefObject<HTMLInputElement | null>;
  };
  onChange: (field: FormField, value: string) => void;
  onBlur: (field: FormField) => void;
  onSubmit: () => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

export function BookingForm(props: BookingFormProps) {
  const { values, errors, pending } = props;
  const id = useId();
  const ids = {
    date: `${id}-date`,
    start: `${id}-start`,
    startHint: `${id}-start-hint`,
    startError: `${id}-start-error`,
    end: `${id}-end`,
    endHint: `${id}-end-hint`,
    endError: `${id}-end-error`,
    title: `${id}-title`,
    titleCounter: `${id}-title-counter`,
    titleError: `${id}-title-error`,
  };
  const readOnly = props.readOnlyNote !== undefined;
  const closeRef = useRef<HTMLButtonElement>(null);
  const locked = readOnly || pending;
  const closeLabel = readOnly || props.unavailableNote !== undefined ? "Закрыть" : "Отмена";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content
          className="dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            // Только чтение и «бронирование недоступно» — фокус на «Закрыть», иначе на «Начало» (A2).
            (readOnly || props.unavailableNote !== undefined ? closeRef : props.fieldRefs.start).current?.focus();
          }}
          onCloseAutoFocus={props.onCloseAutoFocus}
        >
          <Dialog.Title className="dialog__title">{props.heading}</Dialog.Title>

          {props.unavailableNote !== undefined ? (
            <>
              <p className="dialog__note">{props.unavailableNote}</p>
              <div className="dialog__actions">
                <button type="button" ref={closeRef} onClick={props.onClose}>
                  {closeLabel}
                </button>
              </div>
            </>
          ) : (
            <form className="booking-form" noValidate onSubmit={handleSubmit}>
              {props.readOnlyNote !== undefined && <p className="dialog__note">{props.readOnlyNote}</p>}
              {props.formError !== undefined && (
                <p role="alert" className="booking-form__error">
                  {props.formError}
                </p>
              )}
              {props.summary.length > 0 && (
                <div role="alert" className="booking-form__summary">
                  <p>Исправьте ошибки:</p>
                  <ul>
                    {props.summary.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field">
                <label htmlFor={ids.date}>Дата</label>
                <input id={ids.date} type="date" value={props.date} readOnly />
              </div>

              <div className="field">
                <label htmlFor={ids.start}>Начало</label>
                <input
                  id={ids.start}
                  ref={props.fieldRefs.start}
                  type="time"
                  value={values.start}
                  min={props.startMin}
                  readOnly={locked}
                  aria-invalid={errors.start ? true : undefined}
                  aria-describedby={describedBy(props.startMin && ids.startHint, errors.start && ids.startError)}
                  onChange={(event) => props.onChange("start", event.target.value)}
                  onBlur={() => props.onBlur("start")}
                />
                {props.startMin && (
                  <p id={ids.startHint} className="field__hint">
                    Не раньше {props.startMin}
                  </p>
                )}
                {errors.start && (
                  <p id={ids.startError} className="field__error">
                    {errors.start}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor={ids.end}>Окончание</label>
                <select
                  id={ids.end}
                  ref={props.fieldRefs.end}
                  value={values.end}
                  disabled={locked}
                  aria-invalid={errors.end ? true : undefined}
                  aria-describedby={describedBy((props.noEnds || props.endReset) && ids.endHint, errors.end && ids.endError)}
                  onChange={(event) => props.onChange("end", event.target.value)}
                  onBlur={() => props.onBlur("end")}
                >
                  <option value="">Выберите окончание</option>
                  {props.endChoices.map((choice) => (
                    <option key={choice.value} value={choice.value} disabled={choice.disabled}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {(props.noEnds || props.endReset) && (
                  <p id={ids.endHint} className="field__hint">
                    {props.noEnds
                      ? "Нет доступного окончания для этого начала"
                      : "Окончание сброшено: прежнее значение не подходит к новому началу"}
                  </p>
                )}
                {errors.end && (
                  <p id={ids.endError} className="field__error">
                    {errors.end}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor={ids.title}>Название</label>
                <input
                  id={ids.title}
                  ref={props.fieldRefs.title}
                  type="text"
                  value={values.title}
                  maxLength={TITLE_MAX_LENGTH}
                  readOnly={locked}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={describedBy(ids.titleCounter, errors.title && ids.titleError)}
                  onChange={(event) => props.onChange("title", event.target.value)}
                  onBlur={() => props.onBlur("title")}
                />
                <p id={ids.titleCounter} className="field__hint">
                  {values.title.length}/{TITLE_MAX_LENGTH}
                </p>
                {errors.title && (
                  <p id={ids.titleError} className="field__error">
                    {errors.title}
                  </p>
                )}
              </div>

              <div className="dialog__actions">
                {!readOnly && (
                  <button type="submit" disabled={pending || !props.canSave}>
                    {pending ? "Сохраняем…" : "Сохранить"}
                  </button>
                )}
                <button type="button" ref={closeRef} onClick={props.onClose}>
                  {closeLabel}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
