// Seed-брони (Q16): даты считаются от «сегодня» в поясе комнаты.
import { addDays } from "@/domain/time";
import type { BookingInput } from "@/domain/types";

export function createSeed(today: string): BookingInput[] {
  const tomorrow = addDays(today, 1);
  return [
    { date: today, start: "09:30", end: "10:30", title: "Планёрка" },
    { date: today, start: "14:00", end: "15:00", title: "Созвон с клиентом" },
    { date: tomorrow, start: "10:00", end: "11:00", title: "Ретро" },
    { date: tomorrow, start: "11:00", end: "12:00" },
    { date: tomorrow, start: "15:30", end: "17:00", title: "Демо" },
  ];
}
