// Типы jest-axe для ui-тестов a11y (этап 7, A2): пакет без своих типов, @types/jest-axe тянет @types/jest.
// Объявлено только то, что используют тесты: функция axe и нарушения в её результате.
declare module "jest-axe" {
  export interface AxeViolation {
    id: string;
    help: string;
    nodes: { target: unknown[]; failureSummary?: string }[];
  }
  export interface AxeResults {
    violations: AxeViolation[];
  }
  export interface AxeRunOptions {
    rules?: Record<string, { enabled: boolean }>;
  }
  export function axe(html: Element | string, options?: AxeRunOptions): Promise<AxeResults>;
}
