// Dev-инструменты mock API (Q8, B8, U4): работают только при ENABLE_DEV_TOOLS=true на сервере.

/** Верхний предел X-Mock-Delay, мс. */
export const MOCK_DELAY_MAX_MS = 10_000;

/** Задержка ответа по умолчанию, мс: случайная в [min, max]. Отключается DISABLE_MOCK_DELAY=true. */
export const DEFAULT_DELAY_MIN_MS = 300;
export const DEFAULT_DELAY_MAX_MS = 800;

/** Флаг включает только строка «true» (Q24). Читается на каждый запрос. */
const devToolsEnabled = () => process.env.ENABLE_DEV_TOOLS === "true";

/** X-Mock-Force-Conflict: 1 при включённом флаге (B8). */
export const isForcedConflict = (request: Request): boolean =>
  devToolsEnabled() && request.headers.get("X-Mock-Force-Conflict") === "1";

/** X-Mock-Delay: целое ≥ 0, не больше MOCK_DELAY_MAX_MS; иначе null (Q22). */
function requestedDelay(request: Request): number | null {
  if (!devToolsEnabled()) return null;
  const raw = request.headers.get("X-Mock-Delay");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Math.min(Number(raw), MOCK_DELAY_MAX_MS);
}

function defaultDelay(): number {
  if (process.env.DISABLE_MOCK_DELAY === "true") return 0;
  return DEFAULT_DELAY_MIN_MS + Math.floor(Math.random() * (DEFAULT_DELAY_MAX_MS - DEFAULT_DELAY_MIN_MS + 1));
}

/** Задержка перед обработкой запроса (U1, U4). */
export async function applyDelay(request: Request): Promise<void> {
  const ms = requestedDelay(request) ?? defaultDelay();
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}
