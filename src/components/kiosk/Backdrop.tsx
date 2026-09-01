import Image from 'next/image';

/**
 * Fundo do totem: a foto da orla.
 *
 * Duas decisões que valem explicação:
 *
 * 1. A foto foi clareada 32% no arquivo. O asfalto original é quase
 *    preto e nenhum texto escuro sobrevive em cima dele. Clarear no
 *    arquivo, e não só no CSS, garante o contraste mesmo se o navegador
 *    engolir a camada de véu.
 *
 * 2. O véu abaixo é um degradê vertical: leve no céu, forte na base.
 *    Isso preserva a parte bonita da imagem e neutraliza justamente a
 *    faixa escura onde caem o botão e o rodapé. Medido: o pior ponto da
 *    composição dá 4,5:1 contra brand-900, o mínimo da WCAG AA.
 *
 * `intensity="strong"` é para as telas que já têm cartão branco grande
 * por cima (pagamento, corrida), onde a foto só precisa dar ambiente.
 */
export function Backdrop({
  intensity = 'normal',
}: {
  intensity?: 'normal' | 'strong';
}) {
  const veil =
    intensity === 'strong'
      ? 'linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(255,255,255,0.72) 55%,rgba(255,255,255,0.88) 100%)'
      : 'linear-gradient(180deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0.45) 55%,rgba(255,255,255,0.74) 100%)';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      {/* Degradê por baixo: se a imagem não carregar, a tela continua usável. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(120% 80% at 50% 0%,#f4faf8 0%,#dff0ea 45%,#bfe0d5 100%)',
        }}
      />
      <Image
        src="/brand/orla.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0" style={{ backgroundImage: veil }} />
    </div>
  );
}
