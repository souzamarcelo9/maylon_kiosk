'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: Props) {
  const base =
    'touch-target inline-flex w-full items-center justify-center gap-3 rounded-2xl px-8 text-2xl font-semibold transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45';

  const variants = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    outline:
      'border-2 border-brand-700 bg-white text-brand-700 hover:bg-brand-50',
    ghost: 'text-brand-700 hover:bg-brand-50',
  } as const;

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
