'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/kiosk/Card';
import { Button } from '@/components/kiosk/Button';
import { Field } from '@/components/kiosk/Field';
import { Logo } from '@/components/kiosk/Logo';
import { Stepper } from '@/components/kiosk/Stepper';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { kioskConfig } from '@/lib/config';

/** Tela 2 — cria o passageiro convidado (GUEST-...). */
export default function DadosPage() {
  const router = useRouter();
  const { patch } = useKioskSession();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const next: Record<string, string> = {};
    if (name.trim().split(/\s+/).length < 2) {
      next.name = 'Informe nome e sobrenome';
    }
    if (phone && onlyDigits(phone).length < 10) {
      next.phone = 'Telefone incompleto';
    }
    if (document && !isValidCpf(document)) {
      next.document = 'CPF inválido';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/kiosk/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone ? onlyDigits(phone) : undefined,
          document: document ? onlyDigits(document) : undefined,
          kioskId: kioskConfig.id,
        }),
      });

      if (!res.ok) {
        setErrors({ form: 'Não foi possível continuar. Tente novamente.' });
        return;
      }

      const { guest } = await res.json();
      patch({ guest, origin: { ...kioskConfig.origin } });
      router.push('/kiosk/destino');
    } catch {
      setErrors({ form: 'Sem conexão. Chame um atendente.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:px-8">
      <div className="w-full max-w-3xl py-2">
        <Stepper current={0} />

        <Card className="pad-card">
          <Logo className="hide-short mx-auto mb-[3vmin] h-[clamp(40px,7vmin,72px)] w-auto" />

          <h1 className="t-title font-bold">Seus dados</h1>
          <p className="t-hint mt-1 text-muted">
            Usamos só para identificar sua corrida.
          </p>

          <div className="mt-[3vmin] space-y-[2.5vmin]">
            <Field
              label="Nome completo"
              required
              placeholder="João Silva"
              autoComplete="off"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />

            <Field
              label="Telefone"
              type="tel"
              inputMode="numeric"
              placeholder="(13) 99123-4567"
              hint="Para receber o código da corrida por SMS"
              value={phone}
              error={errors.phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              adornment={<PhoneIcon />}
            />

            <Field
              label="CPF"
              inputMode="numeric"
              placeholder="123.456.789-00"
              hint="Só se quiser nota fiscal"
              value={document}
              error={errors.document}
              onChange={(e) => setDocument(maskCpf(e.target.value))}
            />
          </div>

          {errors.form && (
            <p role="alert" className="t-hint mt-4 text-danger">
              {errors.form}
            </p>
          )}

          <Button
            className="mt-[3.5vmin]"
            onClick={handleSubmit}
            disabled={submitting || name.trim().length < 3}
          >
            {submitting ? 'Aguarde…' : 'Continuar'}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    </svg>
  );
}

const onlyDigits = (v: string) => v.replace(/\D/g, '');

function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) {
      sum += Number(cpf[i]) * (slice + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
