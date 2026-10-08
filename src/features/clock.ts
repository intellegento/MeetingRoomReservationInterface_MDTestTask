// Часы клиента (B9, Q1): единственное место src/features и UI, где читается системное время.
// Только для подсказок; окончательный вердикт — часы сервера. Тесты подменяют «сейчас» здесь.
"use client";

let fixedNow: Date | null = null;

/** Клиентское «сейчас» — момент времени; в пояс комнаты переводит getRoomNow из src/domain. */
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
