// Типы domain. Даты — строки YYYY-MM-DD, время — строки HH:mm (контракт ТЗ).

export interface Booking {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  title?: string;
}

/** Данные брони без id: тело POST или склеенный результат PATCH (B7). */
export type BookingInput = Omit<Booking, "id">;

/** «Сейчас» в поясе комнаты с точностью до минуты (B9, B12). */
export interface RoomNow {
  /** YYYY-MM-DD */
  date: string;
  /** Минуты от полуночи, секунды отброшены: floor(now, минута). */
  minutes: number;
}

/** Полуоткрытый интервал [start, end) в минутах от полуночи (B5). */
export interface Interval {
  start: number;
  end: number;
}

export type BookingField = "date" | "start" | "end" | "title";

/**
 * Коды ошибок (docs/requirements.md, «Общие условия»). Порядок перечисления —
 * порядок проверок: B11 → формат → B1 → B2 → B3 → B4 → B10 → B6 → B12 → title → B5.
 */
export type ValidationErrorCode =
  | "BOOKING_LOCKED" // B11: правка начавшейся или прошедшей брони
  | "INVALID_REQUEST" // формат даты/времени (400)
  | "OUTSIDE_WORKING_HOURS" // B1
  | "START_NOT_BEFORE_END" // B2
  | "DURATION_TOO_SHORT" // B3
  | "DURATION_TOO_LONG" // B4
  | "DURATION_STEP" // B10 (Q2)
  | "DATE_IN_PAST" // B6: дата раньше сегодняшней по поясу комнаты (field: "date")
  | "START_IN_PAST" // B6, B12: сегодня, старт раньше текущей минуты floor(now) (field: "start")
  | "TITLE_TOO_LONG" // F4 (Q6)
  | "OVERLAP"; // B5 (409)

export interface ValidationError {
  code: ValidationErrorCode;
  /** Поле, у которого UI показывает ошибку. Нет — ошибка над формой. */
  field?: BookingField;
  /** Сообщение для пользователя на русском (Q17). */
  message: string;
  /** Для OVERLAP: бронь, с которой пересечение. */
  conflictWith?: Booking;
}

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export interface ValidationContext {
  /** Брони (любых дат): пересечения ищутся только на дате input. */
  bookings: readonly Booking[];
  now: RoomNow;
  /** id редактируемой брони: она не конфликтует сама с собой (B7) и проверяется на B11. */
  editingId?: string;
}
