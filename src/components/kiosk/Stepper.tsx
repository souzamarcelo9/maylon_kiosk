const STEPS = ['Seus dados', 'Destino', 'Veículo', 'Pagamento'] as const;

/**
 * Em tela larga mostra os rótulos. Em retrato estreito eles quebravam
 * em duas linhas e comiam altura preciosa, então viram bolinhas com o
 * nome só da etapa atual.
 */
export function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Etapas" className="mb-4 sm:mb-6">
      {/* Compacto: telas estreitas */}
      <div className="flex items-center justify-center gap-3 md:hidden">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <span
              key={label}
              aria-hidden="true"
              className={`h-2.5 rounded-full transition-all ${
                i === current
                  ? 'w-8 bg-brand-700'
                  : i < current
                    ? 'w-2.5 bg-brand-500'
                    : 'w-2.5 bg-brand-300/60'
              }`}
            />
          ))}
        </div>
        <span className="t-hint font-medium text-brand-800">
          {STEPS[current]}
        </span>
        <span className="sr-only">
          Etapa {current + 1} de {STEPS.length}
        </span>
      </div>

      {/* Completo: telas largas */}
      <ol className="hidden items-center justify-center gap-3 md:flex">
        {STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={`t-hint rounded-full px-5 py-2 font-medium ${
                  state === 'current'
                    ? 'bg-brand-700 text-white'
                    : state === 'done'
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-white/70 text-muted'
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
    </nav>
  );
}
