// U1: первая загрузка дня — skeleton сетки и индикатор для экранных читалок.
export function DayLoading() {
  return (
    <div className="day-loading">
      <p role="status">Загрузка…</p>
      <div className="day-loading__skeleton" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="day-loading__bar" />
        ))}
      </div>
    </div>
  );
}
