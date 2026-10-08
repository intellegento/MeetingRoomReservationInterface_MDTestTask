// Подтверждение удаления брони (F6, A2) в Radix AlertDialog: фокус по умолчанию на «Отмена».
// Только отображение: исход запроса и тексты ошибок — через props.
"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

export interface DeleteBookingDialogProps {
  /** «14:00–15:00 «Демо»». */
  label: string;
  pending: boolean;
  /** Ошибка удаления (role="alert"); после неё подтверждение становится «Повторить». */
  error?: { title: string; description?: string };
  onConfirm: () => void;
  onCancel: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function DeleteBookingDialog({ label, pending, error, onConfirm, onCancel, onCloseAutoFocus }: DeleteBookingDialogProps) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => (open || pending ? undefined : onCancel())}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog__overlay" />
        <AlertDialog.Content className="dialog dialog--narrow" onCloseAutoFocus={onCloseAutoFocus}>
          <AlertDialog.Title className="dialog__title">Удалить бронь?</AlertDialog.Title>
          <AlertDialog.Description className="dialog__note">Бронь {label} будет удалена</AlertDialog.Description>
          {error !== undefined && (
            <div role="alert" className="booking-form__error">
              <p className="booking-form__error-title">{error.title}</p>
              {error.description !== undefined && <p>{error.description}</p>}
            </div>
          )}
          <div className="dialog__actions">
            <button type="button" className="button--danger" disabled={pending} onClick={onConfirm}>
              {pending ? "Удаляем…" : error !== undefined ? "Повторить" : "Удалить"}
            </button>
            <AlertDialog.Cancel disabled={pending}>Отмена</AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
