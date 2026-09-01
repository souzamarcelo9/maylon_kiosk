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
        className="mb-2 block text-xl font-medium text-ink"
      >
        {label}
        {!rest.required && (
          <span className="ml-2 text-lg font-normal text-muted">opcional</span>
        )}
      </label>

      <div className="relative">
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-err` : undefined}
          className={`h-[76px] w-full rounded-2xl border-2 bg-white px-6 text-2xl outline-none transition placeholder:text-muted/60 ${
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
        <p id={`${inputId}-err`} className="mt-2 text-lg text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-lg text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
