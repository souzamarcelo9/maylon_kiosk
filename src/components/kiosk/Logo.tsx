import Image from 'next/image';

/**
 * Logo da Maylon.
 *
 * `lockup` usa a arte original (PNG com fundo removido) — é o desenho
 * de verdade, com a tipografia serifada da marca.
 * `mark` usa o vetor reconstruído, para tamanhos pequenos e favicon,
 * onde o bitmap borra.
 *
 * Quando o designer mandar o .svg oficial, troque os dois arquivos em
 * /public/brand e nada aqui precisa mudar.
 */

interface Props {
  variant?: 'lockup' | 'mark';
  tone?: 'brand' | 'white';
  className?: string;
  /** Altura em px. Largura sai proporcional. */
  height?: number;
  priority?: boolean;
}

export function Logo({
  variant = 'lockup',
  tone = 'brand',
  className = '',
  height = 72,
  priority = false,
}: Props) {
  if (variant === 'mark') {
    return (
      <MaylonMark
        className={className}
        style={{ height, width: 'auto' }}
      />
    );
  }

  const src =
    tone === 'white'
      ? '/brand/maylon-lockup-white.png'
      : '/brand/maylon-lockup.png';

  return (
    <Image
      src={src}
      alt="Maylon"
      width={706}
      height={177}
      priority={priority}
      className={className}
      style={{ height, width: 'auto' }}
    />
  );
}

/** Vetor da marca. Herda a cor via `currentColor`. */
export function MaylonMark({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 133 164"
      fill="none"
      className={className}
      style={style}
      role="img"
      aria-label="Maylon"
    >
      <path
        d="M109.7 100A55 55 0 1 0 20.3 100"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M42 89V51l22.5 33L87 55v34"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinejoin="miter"
      />
      <path
        d="M30.5 126a45 45 0 0 1 69 0"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M47 139a22 22 0 0 1 36 0"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <circle cx="86" cy="48" r="16" fill="var(--logo-knockout, #fff)" />
      <path
        d="M86 35a12 12 0 0 0-12 12c0 8.7 12 17.5 12 17.5S98 55.7 98 47a12 12 0 0 0-12-12Z"
        fill="currentColor"
      />
      <circle cx="86" cy="45.5" r="4.6" fill="var(--logo-knockout, #fff)" />
      <path
        d="M65 143a8 8 0 0 1 8 8c0 5.8-8 12-8 12s-8-6.2-8-12a8 8 0 0 1 8-8Z"
        fill="currentColor"
      />
    </svg>
  );
}
