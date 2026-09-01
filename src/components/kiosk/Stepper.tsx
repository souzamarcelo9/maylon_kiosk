const STEPS = ['Seus dados', 'Destino', 'Veículo', 'Pagamento'] as const;

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center justify-center gap-3" aria-label="Etapas">
      {STEPS.map((label, i) => {
        const state =
          i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              aria-current={state === 'current' ? 'step' : undefined}
              className={`rounded-full px-5 py-2 text-lg font-medium ${
                state === 'current'
                  ? 'bg-brand-700 text-white'
                  : state === 'done'
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-white/60 text-muted'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px w-6 bg-brand-300" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
