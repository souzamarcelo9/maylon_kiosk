'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/kiosk/Card';
import { Button } from '@/components/kiosk/Button';
import { Stepper } from '@/components/kiosk/Stepper';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { kioskConfig } from '@/lib/config';
import type { Place } from '@/lib/types';

/**
 * Tela 3 — origem já vem preenchida, o passageiro só digita o destino.
 *
 * A origem usa a localização fixa do totem, não GPS. Dentro de shopping
 * ou hospital o GPS erra centenas de metros e manda o motorista para a
 * porta errada. O endereço cadastrado é sempre mais confiável.
 */
export default function DestinoPage() {
  const router = useRouter();
  const { session, hydrated, patch } = useKioskSession();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const origin = session.origin ?? kioskConfig.origin;

  useEffect(() => {
    if (hydrated && !session.guest) router.replace('/kiosk');
  }, [hydrated, session.guest, router]);

  // Autocomplete com debounce.
  // AJUSTE: troque por /api/kiosk/places ligado ao seu provedor de mapas.
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/kiosk/places?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) setSuggestions((await res.json()).places ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  async function handleNext() {
    if (!selected || !session.guest) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/kiosk/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: selected,
          guestId: session.guest.guestId,
        }),
      });

      if (!res.ok) {
        setError('Não conseguimos calcular a rota. Tente outro destino.');
        return;
      }

      const { quote } = await res.json();
      patch({ destination: selected, quote });
      router.push('/kiosk/veiculo');
    } catch {
      setError('Sem conexão. Chame um atendente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-12 py-10">
      <div className="w-full max-w-4xl">
        <Stepper current={1} />

        <Card className="p-14">
          <div className="flex items-center gap-5">
            <PinIcon />
            <div>
              <h1 className="text-4xl font-bold text-brand-800">Para onde vamos?</h1>
              <p className="mt-1 text-2xl text-muted">
                A saída já está marcada. Digite só o destino.
              </p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-[auto_1fr] gap-x-6">
            <div className="flex flex-col items-center pt-11">
              <TargetIcon />
              <span className="my-2 w-px flex-1 border-l-2 border-dashed border-brand-300" />
              <NavIcon />
            </div>

            <div className="space-y-8">
              <div>
                <span className="mb-2 block text-xl font-medium">De</span>
                <div className="flex h-[76px] items-center rounded-2xl border-2 border-line bg-brand-50 px-6 text-2xl text-brand-800">
                  {origin.label}
                </div>
              </div>

              <div>
                <label
                  htmlFor="destino"
                  className="mb-2 block text-xl font-medium"
                >
                  Para
                </label>
                <input
                  id="destino"
                  autoComplete="off"
                  placeholder="Digite o endereço, hotel ou shopping"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                  }}
                  className="h-[76px] w-full rounded-2xl border-2 border-line bg-white px-6 text-2xl outline-none transition placeholder:text-muted/60 focus:border-brand-600"
                />

                {suggestions.length > 0 && !selected && (
                  <ul className="mt-3 max-h-[320px] overflow-y-auto rounded-2xl border-2 border-line bg-white">
                    {suggestions.map((place) => (
                      <li key={`${place.label}-${place.lat}`}>
                        <button
                          onClick={() => {
                            setSelected(place);
                            setQuery(place.label);
                            setSuggestions([]);
                          }}
                          className="w-full border-b border-line px-6 py-6 text-left text-2xl last:border-0 hover:bg-brand-50"
                        >
                          {place.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-8 text-xl text-danger">
              {error}
            </p>
          )}

          <Button
            className="mt-12"
            onClick={handleNext}
            disabled={!selected || loading}
          >
            {loading ? 'Calculando…' : 'Ver preços'}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-14 w-14 text-brand-700" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}
function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12 20 5l-7 16-2-7-7-2Z" strokeLinejoin="round" />
    </svg>
  );
}
