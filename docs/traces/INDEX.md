# Трейсы — навигация

| Этап | Трейс | Коммит | Суть |
|------|-------|--------|------|
| 0 | [stage-0.md](stage-0.md) | `stage 0: bootstrap`, `stage 0: context and requirements` | Понимание ТЗ, требования, решения, контекст агента, план, ревью документов |
| 1 | [stage-1.md](stage-1.md) | `stage 1: domain (gate green)` | Каркас Next.js + TS strict, gate (2 пояса), lint-правила и policy-check, domain B1–B7, B9–B12 (187 тестов), мутации |
| 2 | [stage-2.md](stage-2.md) | `stage 2: mock api (gate green)` | Mock API на Route Handlers: GET/POST/PATCH/DELETE, store на globalThis с seed, единый формат ошибок 400/404/409/422, dev-заголовки `X-Mock-Force-Conflict`/`X-Mock-Delay`, 146 api-тестов (всего 333), мутации M1–M4 |
| 3 | [stage-3.md](stage-3.md) | `stage 3: api client and hooks (gate green)` | `BookingsApi` + HTTP-клиент (`ApiError`, NETWORK/PARSE, таймаут, отмена), хуки TanStack Query через контекст, инвалидация после успеха и 409, гонка дат; 36 тестов (всего 395), мутации M0–M4, INC-3, INC-4 |

- Инциденты: [incidents.md](incidents.md)
- Переписка с AI: `chats/` (появится на этапе 9)
