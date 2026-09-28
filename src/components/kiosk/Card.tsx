import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] bg-white/95 shadow-[0_24px_60px_-20px_rgba(7,61,59,0.35)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}
