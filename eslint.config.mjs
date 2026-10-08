// Lint-правила AGENTS.md и границ слоёв (docs/architecture.md, docs/testing.md,
// «Автоматические проверки правил AGENTS.md»). Только встроенные правила ESLint
// и typescript-eslint, без своих плагинов.
//
// Важно: настройка одного правила в более позднем блоке заменяет настройку из
// раннего блока для тех же файлов. Поэтому для no-restricted-syntax и
// no-restricted-imports у каждой группы файлов свой полный список.
import tseslint from "typescript-eslint";

// Файлы-часы: только здесь разрешены Date.now() и new Date() без аргумента (B9).
const CLOCK_FILES = ["src/server/clock.ts", "src/features/clock.ts"];
const TEST_FILES = ["src/**/*.test.ts", "src/**/*.test.tsx"];

const NOW_MESSAGE =
  "«Сейчас» берётся только из файлов-часов (src/server/clock.ts, src/features/clock.ts) и передаётся параметром (B9, AGENTS.md).";

const RESTRICTED_NOW = [
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: NOW_MESSAGE },
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: NOW_MESSAGE },
  { selector: "CallExpression[callee.type='Identifier'][callee.name='Date']", message: NOW_MESSAGE },
];

const TIME_LITERAL_MESSAGE =
  "Границы рабочего дня — бизнес-правило: берите константы из src/domain, а не литерал времени (S1).";

const RESTRICTED_TIME_LITERALS = [
  { selector: "Literal[value=/^0?9:00$|^18:00$/]", message: TIME_LITERAL_MESSAGE },
  { selector: "TemplateElement[value.raw=/^0?9:00$|^18:00$/]", message: TIME_LITERAL_MESSAGE },
];

// Слои: импорт через алиас @/<слой> или относительным путём ../<слой>.
const layer = (name, message) => ({
  regex: `^(@/|(\\.\\./)+)${name}(/|$)`,
  message,
});

const FROM_DOMAIN = "src/domain — чистые функции, без зависимостей от других слоёв.";
const ONLY_ROUTE_HANDLERS = "src/server импортируют только src/app/api/** (S1).";
const NO_API_IN_COMPONENTS = "Компоненты не ходят в сеть: только через хуки src/features (AGENTS.md, S1).";
const NO_FRAMEWORK = (where) => ({
  name: "react",
  message: `${where} не зависит от React.`,
});

const restrictedImports = (patterns, paths = []) => ["error", { patterns, paths }];

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**", ".gate/**"],
  },
  {
    linterOptions: {
      // Неиспользуемый eslint-disable — ошибка: исключения не копятся.
      reportUnusedDisableDirectives: "error",
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,mjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
    },
  },

  // --- «Сейчас», литералы времени, fetch -----------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...RESTRICTED_NOW, ...RESTRICTED_TIME_LITERALS],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "fetch вызывается только в src/api (S1)." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: "fetch вызывается только в src/api (S1)." },
        { object: "globalThis", property: "fetch", message: "fetch вызывается только в src/api (S1)." },
      ],
    },
  },
  {
    // В domain и тестах литералы времени разрешены, «сейчас» — нет.
    files: ["src/domain/**/*.{ts,tsx}", ...TEST_FILES],
    rules: { "no-restricted-syntax": ["error", ...RESTRICTED_NOW] },
  },
  {
    files: CLOCK_FILES,
    rules: { "no-restricted-syntax": ["error", ...RESTRICTED_TIME_LITERALS] },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },

  // --- Границы слоёв (docs/architecture.md) --------------------------------
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(
        [
          layer("api", FROM_DOMAIN),
          layer("server", FROM_DOMAIN),
          layer("features", FROM_DOMAIN),
          layer("components", FROM_DOMAIN),
          layer("app", FROM_DOMAIN),
          { regex: "^(react|react-dom|next)(/|$)", message: "src/domain не зависит от React и Next.js." },
        ],
      ),
    },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(
        [
          layer("server", "src/api и src/server не знают друг о друге: общий контракт — HTTP и типы domain (S2)."),
          layer("features", "src/api не зависит от UI."),
          layer("components", "src/api не зависит от UI."),
          layer("app", "src/api не зависит от UI."),
        ],
        [NO_FRAMEWORK("src/api")],
      ),
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(
        [
          layer("api", "src/api и src/server не знают друг о друге (S2)."),
          layer("features", "src/server не зависит от UI."),
          layer("components", "src/server не зависит от UI."),
          layer("app", "src/server не зависит от UI."),
        ],
        [NO_FRAMEWORK("src/server")],
      ),
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports([
        layer("server", ONLY_ROUTE_HANDLERS),
        layer("app", "src/features не импортирует страницы."),
      ]),
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports([
        layer("api", NO_API_IN_COMPONENTS),
        layer("server", NO_API_IN_COMPONENTS),
        layer("features", "Компоненты получают данные и колбэки через props."),
        layer("app", "Компоненты не импортируют страницы."),
      ]),
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-imports": restrictedImports([
        layer("api", "Страницы работают с сетью через хуки src/features."),
        layer("server", ONLY_ROUTE_HANDLERS),
      ]),
    },
  },
  {
    files: ["src/app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports([
        layer("api", "Route handlers — тонкие обёртки над src/server."),
        layer("features", "Route handlers — тонкие обёртки над src/server."),
        layer("components", "Route handlers — тонкие обёртки над src/server."),
      ]),
    },
  },
);
