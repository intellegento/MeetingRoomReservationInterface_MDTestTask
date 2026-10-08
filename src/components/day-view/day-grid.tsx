// Сетка дня на CSS Grid: ряды по 30 минут, брони блоками на своих рядах, прошлое затемнено (F2, B6, B11).
import { useId, type CSSProperties } from "react";
import { WORKDAY_START_MINUTES } from "@/domain/constants";
import { MESSAGES } from "@/domain/rules";
import type { Booking } from "@/domain/types";
import { getGridPlacement, getGridPlacementMinutes, ROW_COUNT, ROW_LABELS, ROW_MINUTES, type GridPlacement } from "./grid-placement";

export interface DayGridItem {
  booking: Booking;
  /** Бронь началась или прошла: только чтение (B11, Q4). */
  locked: boolean;
}

export interface DayGridProps {
  items: readonly DayGridItem[];
  /** Минута, до которой день прошёл (getPastUntil из domain). */
  pastUntil: number;
  /** Будущая бронь — правка, начавшаяся — просмотр; trigger — для возврата фокуса. */
  onSelect: (booking: Booking, trigger: HTMLElement) => void;
  /** «Удалить» — только у будущих броней (Q4); trigger — для возврата фокуса. */
  onDelete: (booking: Booking, trigger: HTMLElement) => void;
  /** Показаны брони прежней даты, пока грузится новая (J3): кнопки броней disabled с пояснением. */
  stale?: boolean;
}

export const STALE_NOTE = "Брони выбранной даты загружаются — действия недоступны";

/** Ряды сетки и отступы внутри них в процентах высоты блока. */
function placementStyle({ rowStart, rowEnd, insetTop, insetBottom }: GridPlacement): CSSProperties {
  const span = (rowEnd - rowStart) * ROW_MINUTES;
  return {
    gridRow: `${rowStart} / ${rowEnd}`,
    ["--inset-top" as string]: `calc(${insetTop / span} * 100%)`,
    ["--inset-bottom" as string]: `calc(${insetBottom / span} * 100%)`,
  };
}

export function DayGrid({ items, pastUntil, onSelect, onDelete, stale = false }: DayGridProps) {
  const gridStyle = { ["--rows" as string]: ROW_COUNT } as CSSProperties;
  const staleNoteId = useId();
  const staleProps = stale ? { disabled: true, "aria-describedby": staleNoteId } : {};
  return (
    <div className="day-grid" style={gridStyle}>
      {stale && (
        <p id={staleNoteId} className="visually-hidden">
          {STALE_NOTE}
        </p>
      )}
      {ROW_LABELS.map((label, i) => (
        <div key={label} className="day-grid__label" style={{ gridRow: `${i + 1}` }}>
          {label}
        </div>
      ))}
      {pastUntil > WORKDAY_START_MINUTES && (
        <div className="day-grid__cell day-grid__past" style={placementStyle(getGridPlacementMinutes(WORKDAY_START_MINUTES, pastUntil))}>
          <div className="day-grid__fill">Прошедшее время</div>
        </div>
      )}
      <ol className="day-grid__bookings" aria-label="Брони">
        {items.map(({ booking, locked }) => {
          const time = `${booking.start}–${booking.end}`;
          const title = booking.title ?? "Без названия";
          return (
            <li key={booking.id} className="day-grid__cell" style={placementStyle(getGridPlacement(booking.start, booking.end))}>
              <button
                type="button"
                className={locked ? "day-grid__fill booking booking--locked" : "day-grid__fill booking"}
                aria-label={`${locked ? "Посмотреть" : "Изменить"} бронь ${time}, ${title}`}
                {...staleProps}
                onClick={(event) => onSelect(booking, event.currentTarget)}
              >
                <span className="booking__time">{time}</span>
                <span className="booking__title">{title}</span>
                {locked && <span className="booking__note">{MESSAGES.BOOKING_LOCKED}</span>}
              </button>
              {!locked && (
                <button
                  type="button"
                  className="booking__delete"
                  aria-label={`Удалить бронь ${time}, ${title}`}
                  {...staleProps}
                  onClick={(event) => onDelete(booking, event.currentTarget)}
                >
                  Удалить
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
