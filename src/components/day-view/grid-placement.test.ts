import { describe, expect, it } from "vitest";
import { getGridPlacement } from "./grid-placement";

// Ряды по 30 минут с 09:00: ряд 1 = 09:00, ряд 18 = 17:30. Вывод ожиданий — docs/traces/stage-4.md.
describe("getGridPlacement", () => {
  it.each([
    { start: "09:00", end: "09:30", expected: { rowStart: 1, rowEnd: 2, insetTop: 0, insetBottom: 0 } },
    { start: "09:00", end: "10:00", expected: { rowStart: 1, rowEnd: 3, insetTop: 0, insetBottom: 0 } },
    { start: "10:10", end: "10:40", expected: { rowStart: 3, rowEnd: 5, insetTop: 10, insetBottom: 20 } },
    { start: "13:45", end: "15:15", expected: { rowStart: 10, rowEnd: 14, insetTop: 15, insetBottom: 15 } },
    { start: "17:30", end: "18:00", expected: { rowStart: 18, rowEnd: 19, insetTop: 0, insetBottom: 0 } },
    { start: "09:00", end: "10:10", expected: { rowStart: 1, rowEnd: 4, insetTop: 0, insetBottom: 20 } },
  ])("F2: getGridPlacement($start, $end) → ряды и отступы в минутах", ({ start, end, expected }) => {
    expect(getGridPlacement(start, end)).toEqual(expected);
  });
});
