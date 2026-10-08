// Сетка дня на CSS Grid: ряды по 30 минут, брони блоками на своих рядах, прошлое затемнено (F2, B6, B11).
import type { CSSProperties } from "react";
import { WORKDAY_START_MINUTES } from "@/domain/constants";
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
}

export const LOCKED_NOTE = "Бронь уже началась — изменить нельзя";

/** Ряды сетки и отступы внутри них в процентах высоты блока. */
function placementStyle({ rowStart, rowEnd, insetTop, insetBottom }: GridPlacement): CSSProperties {
  const span = (rowEnd - rowStart) * ROW_MINUTES;
  return {
    gridRow: `${rowStart} / ${rowEnd}`,
    ["--inset-top" as string]: `calc(${insetTop / span} * 100%)`,
    ["--inset-bottom" as string]: `calc(${insetBottom / span} * 100%)`,
  };
}

export function DayGrid({ items, pastUntil, onSelect }: DayGridProps) {
  const gridStyle = { ["--rows" as string]: ROW_COUNT } as CSSProperties;
  return (
    <div className="day-grid" style={gridStyle}>
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
                onClick={(event) => onSelect(booking, event.currentTarget)}
              >
                <span className="booking__time">{time}</span>
                <span className="booking__title">{title}</span>
                {locked && <span className="booking__note">{LOCKED_NOTE}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
