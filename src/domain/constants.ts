// Константы бизнес-правил (docs/requirements.md). Время — в минутах от полуночи.

/** Пояс комнаты: «сегодня» и «сейчас» считаются только в нём (B9, Q1). */
export const ROOM_TIMEZONE = "Asia/Bishkek";

/** Рабочий день 09:00–18:00 (B1). */
export const WORKDAY_START_MINUTES = 9 * 60;
export const WORKDAY_END_MINUTES = 18 * 60;

/** Длительность 30–120 минут с шагом 30 (B3, B4, B10). */
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 120;
export const DURATION_STEP_MINUTES = 30;

/** Название после обрезки пробелов — не длиннее 100 символов (F4, Q6). */
export const TITLE_MAX_LENGTH = 100;
