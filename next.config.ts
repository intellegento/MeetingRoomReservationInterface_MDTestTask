import type { NextConfig } from "next";

// Хосты, которым dev-сервер отдаёт свои ресурсы (/_next/*, HMR), кроме localhost: телефон в локальной сети.
// ALLOWED_DEV_ORIGINS="192.168.0.10,192.168.0.11" — точные хосты через запятую, без шаблонов.
// Next применяет allowedDevOrigins только в dev; без переменной поведение не меняется (stage-7.md, «7b»).
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const patterns = allowedDevOrigins.filter((host) => host.includes("*"));
if (patterns.length > 0) {
  throw new Error(`ALLOWED_DEV_ORIGINS: только точные хосты, без шаблонов: ${patterns.join(", ")}`);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(allowedDevOrigins.length > 0 && { allowedDevOrigins }),
};

export default nextConfig;
