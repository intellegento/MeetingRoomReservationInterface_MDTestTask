// U2: на дату нет броней. «Забронировать» — только если дата не прошла (B6, Q13).
export interface DayEmptyProps {
  canCreate: boolean;
  onCreate: () => void;
}

export function DayEmpty({ canCreate, onCreate }: DayEmptyProps) {
  return (
    <div className="day-empty">
      <p>На эту дату броней нет</p>
      {canCreate && (
        <button type="button" onClick={onCreate}>
          Забронировать
        </button>
      )}
    </div>
  );
}
