// Главные часы сервера (B9, Q1): единственное место src/server, где читается системное время.
// Тесты подменяют «сейчас» только через этот файл.

let fixedNow: Date | null = null;

/** Серверное «сейчас» — момент времени; в пояс комнаты переводит getRoomNow из src/domain. */
export function getNow(): Date {
  return fixedNow === null ? new Date() : new Date(fixedNow.getTime());
}

/** Только для тестов: зафиксировать «сейчас». */
export function setNowForTests(instant: Date): void {
  fixedNow = instant;
}

/** Только для тестов: вернуть системные часы. */
export function resetNowForTests(): void {
  fixedNow = null;
}
