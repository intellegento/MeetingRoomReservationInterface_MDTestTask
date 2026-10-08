// Dev-панель (Q8): переключатели заголовков mock API для демонстрации B8 и U4.
// Рендерится только при NEXT_PUBLIC_ENABLE_DEV_TOOLS=true (решает src/features).
export interface DevPanelProps {
  forceConflict: boolean;
  slowNetwork: boolean;
  onForceConflictChange: (value: boolean) => void;
  onSlowNetworkChange: (value: boolean) => void;
}

export function DevPanel(props: DevPanelProps) {
  return (
    <section className="dev-panel" aria-label="Инструменты разработчика">
      <label>
        <input
          type="checkbox"
          checked={props.forceConflict}
          onChange={(event) => props.onForceConflictChange(event.target.checked)}
        />
        Симулировать конфликт при следующем сохранении
      </label>
      <label>
        <input type="checkbox" checked={props.slowNetwork} onChange={(event) => props.onSlowNetworkChange(event.target.checked)} />
        Медленная сеть
      </label>
    </section>
  );
}
