# Этап 9. README и сдача

## 9a: подготовка к деплою

### Команда заказчика

> Этап 9 по docs/plan.md, таймбокс 20 мин. Прочитай AGENTS.md, docs/security.md,
> docs/checklists/pre-delivery.md, docs/traces/review.md и README-notes.md. date,
> запиши старт в time-log.
>
> Подготовь проект к деплою на Vercel без токенов и секретов: npm run build без
> предупреждений; у env значения по умолчанию; проверь, что NEXT_PUBLIC_ENABLE_DEV_TOOLS
> и ENABLE_DEV_TOOLS для демо включены только если я так решу (предложи значения и
> объясни, что видит проверяющий: для демонстрации B8 они нужны, на Vercel задаются
> в интерфейсе). Напиши в README только раздел «Деплой»: переменные окружения (без
> секретов, их нет), ограничение in-memory store на serverless (состояние может
> сбрасываться между инстансами; seed детерминирован после J2). Коммит
> "stage 9a: deploy prep (gate green)", push. СТОП.

`README-notes.md` лежит в `docs/traces/`, не в корне — прочитан оттуда.

### План

- Цель: сборка без предупреждений, значения env по умолчанию, раздел README «Деплой». Код не меняется.
- ID: D3 (демо), Q8 (флаги dev-панели), Q9 (in-memory), J2 (seed).
- Файлы: `README.md` (только раздел «Деплой»), этот трейс, `INDEX.md`, `time-log.md`.
- Тестов нет (поведение не меняется). Проверка — `npm run build` без флагов и с флагами, `npm run gate`.

### Проверки

**Env (grep `process.env` в `src`, `next.config.ts`):** у каждой переменной значение по умолчанию в коде.

| Переменная | Файл | Без значения |
|------------|------|--------------|
| `NEXT_PUBLIC_ENABLE_DEV_TOOLS` | `src/features/day-view/dev-tools.ts:5` | `=== "true"` → выключено |
| `ENABLE_DEV_TOOLS` | `src/server/dev-tools.ts:11` | `=== "true"` → выключено |
| `DISABLE_MOCK_DELAY` | `src/server/dev-tools.ts:26` | задержка 300–800 мс |
| `NEXT_PUBLIC_API_URL` | `src/api/http-bookings-api.ts:40` | `"/api"` |
| `ALLOWED_DEV_ORIGINS` | `next.config.ts:6` | пусто, `allowedDevOrigins` не задаётся |

Флаги dev-панели **выключены по умолчанию** и включаются только явным `true` в окружении. В репозитории их значений нет
(`.env.example` — пустые плейсхолдеры, `.env*` в `.gitignore`), `vercel.json` нет. Значит, на демо они будут включены
только если заказчик задаст их в интерфейсе Vercel. `.env*` (кроме `.env.example`) не читались.

**`npm run build` без переменных** — без предупреждений, строки `Environments:` нет (env-файлы не загружены):

```
▲ Next.js 16.4.0 (Turbopack)
✓ Running next.config.ts took 12ms
  Creating an optimized production build ...
✓ Compiled successfully in 157ms
  Running TypeScript ...
  Finished TypeScript in 773ms ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/3) ...
✓ Generating static pages using 6 workers (3/3) in 207ms
  Finalizing page optimization ...
```

**`NEXT_PUBLIC_ENABLE_DEV_TOOLS=true ENABLE_DEV_TOOLS=true npm run build`** — `grep -i -E "warn|error"` пуст, exit 0.

### Предложение по флагам на демо (решает заказчик)

`NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` и `ENABLE_DEV_TOOLS=true`, остальные не задавать. Без них B8 на демо
воспроизводится только двумя вкладками, а на serverless это ненадёжно (разные инстансы). Только один клиентский флаг —
панель без эффекта, так не настраивать. Что видит проверяющий в каждом варианте — README, «Деплой».
`NEXT_PUBLIC_*` встраивается при сборке: после изменения — Redeploy.

### Сделано

- `README.md`: раздел «Деплой» — настройки Vercel, таблица переменных, что видит проверяющий, ограничение
  in-memory на serverless (сброс, расхождение между инстансами, детерминированный seed после J2, риск B8).
  Остальной README не менялся (заготовка).

### Gate

```
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 568 (passed 568, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 250 (passed 250, failed 0)
ok   next build
```

### Отклонения

- `README-notes.md` в команде указан без пути — файл найден в `docs/traces/`.
- Деплой не выполнялся (security.md: на стороне человека). Ссылки на демо в README нет.
