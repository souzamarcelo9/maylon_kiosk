'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  adornment?: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  adornment,
  id,
  className = '',
  ...rest
}: Props) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="t-label mb-2 block font-medium text-ink"
      >
        {label}
        {!rest.required && (
          <span className="t-hint ml-2 font-normal text-muted">opcional</span>
        )}
      </label>

      <div className="relative">
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-err` : undefined}
          className={`field-h t-body w-full rounded-2xl border-2 bg-white px-5 outline-none transition placeholder:text-muted/60 ${
            error
              ? 'border-danger'
              : 'border-line focus:border-brand-600'
          } ${adornment ? 'pr-16' : ''}`}
          {...rest}
        />
        {adornment && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-brand-700">
            {adornment}
          </div>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-err`} className="t-hint mt-2 text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="t-hint mt-2 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
