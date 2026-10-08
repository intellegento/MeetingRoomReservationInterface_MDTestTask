// Страница дня: ?date=YYYY-MM-DD связывается с экраном DayView (F1). next/navigation — только здесь.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { AppProviders } from "@/features/app-providers";
import { DayView, type DateChangeMode } from "@/features/day-view/day-view";

function RoutedDayView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const onDateChange = useCallback(
    (date: string, mode: DateChangeMode) => {
      const url = `?date=${encodeURIComponent(date)}`;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router],
  );
  return <DayView dateParam={searchParams.get("date")} onDateChange={onDateChange} />;
}

export default function HomePage() {
  return (
    <AppProviders>
      <main className="page">
        <h1>Бронирование переговорной</h1>
        <Suspense fallback={null}>
          <RoutedDayView />
        </Suspense>
      </main>
    </AppProviders>
  );
}
