// U3: список не загрузился (5xx, сеть, неожиданный ответ) — сообщение и повтор запроса.
export interface DayErrorProps {
  onRetry: () => void;
}

export function DayError({ onRetry }: DayErrorProps) {
  return (
    <div className="day-error">
      <p role="alert">Не удалось загрузить брони</p>
      <button type="button" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}
