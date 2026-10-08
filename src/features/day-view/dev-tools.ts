// Dev-панель клиента (Q8): флаг и заголовки mock API. Сервер учитывает их только при ENABLE_DEV_TOOLS=true.
import type { RequestOptions } from "@/api/bookings-api";

/** Флаг включает только строка «true» (как Q24 для сервера). */
export const devToolsEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";

export interface DevToolsState {
  /** Одноразовый: снимается после ближайшего сохранения. */
  forceConflict: boolean;
  slowNetwork: boolean;
}

/** Задержка «Медленной сети», мс (U4). */
const SLOW_NETWORK_DELAY_MS = "2000";

/** Заголовки запроса: сохранение — оба переключателя, удаление — только задержка. */
export function devRequest(state: DevToolsState, action: "save" | "delete"): RequestOptions | undefined {
  const headers: Record<string, string> = {};
  if (action === "save" && state.forceConflict) headers["X-Mock-Force-Conflict"] = "1";
  if (state.slowNetwork) headers["X-Mock-Delay"] = SLOW_NETWORK_DELAY_MS;
  return Object.keys(headers).length > 0 ? { headers } : undefined;
}
