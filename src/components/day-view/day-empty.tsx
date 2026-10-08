// U2: на дату нет броней. «Забронировать» — только если дата не прошла (B6, Q13).
export interface DayEmptyProps {
  canCreate: boolean;
  /** trigger — кнопка, на которую вернётся фокус после закрытия формы. */
  onCreate: (trigger: HTMLElement) => void;
  /** Показан прежний пустой день, пока грузится новая дата: кнопка disabled, id — пояснение. */
  staleNoteId?: string;
}

export function DayEmpty({ canCreate, onCreate, staleNoteId }: DayEmptyProps) {
  return (
    <div className="day-empty">
      <p>На эту дату броней нет</p>
      {canCreate && (
        <button
          type="button"
          disabled={staleNoteId !== undefined}
          aria-describedby={staleNoteId}
          onClick={(event) => onCreate(event.currentTarget)}
        >
          Забронировать
        </button>
      )}
    </div>
  );
}
