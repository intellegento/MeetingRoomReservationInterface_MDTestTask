// Выбор даты: «Назад», «Сегодня», «Вперёд» и поле «Дата» (F1). Дата — из props, смена — колбэком.
import { addDays, isValidDate } from "@/domain/time";

export interface DateNavProps {
  date: string;
  today: string;
  onChange: (date: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** YYYY-MM-DD → «четверг, 8 октября 2026 г.» без пояса процесса (календарная дата в UTC). */
const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));

export function DateNav({ date, today, onChange }: DateNavProps) {
  return (
    <nav className="date-nav" aria-label="Выбор даты">
      <div className="date-nav__buttons">
        <button type="button" onClick={() => onChange(addDays(date, -1))}>
          Назад
        </button>
        <button type="button" onClick={() => onChange(today)}>
          Сегодня
        </button>
        <button type="button" onClick={() => onChange(addDays(date, 1))}>
          Вперёд
        </button>
      </div>
      <label className="date-nav__field">
        Дата
        <input
          type="date"
          value={date}
          onChange={(event) => {
            // Пустое или неполное значение не меняет дату (решение 3, этап 4).
            if (isValidDate(event.target.value)) onChange(event.target.value);
          }}
        />
      </label>
      <time className="date-nav__current" dateTime={date}>
        {formatDate(date)}
      </time>
    </nav>
  );
}
