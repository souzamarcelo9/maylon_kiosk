# Maylon Kiosk

Fluxo de autoatendimento em Next.js. Tela cheia no tablet, pagamento no
Get Smart ao lado, backend PHP/MySQL existente por trás.

## Rodar

```bash
cp .env.example .env.local   # ajuste MAYLON_API_BASE e o KIOSK_ID
npm install
npm run dev                  # http://localhost:3000/kiosk
```

Com `MAYLON_PAYMENT_DRIVER=mock` (padrão) o pagamento aprova em 3s. Não
precisa da Getnet para percorrer o fluxo inteiro.

**Truque de teste:** valor terminado em 13 centavos é recusado. Use isso
para exercitar a tela de recusa sem estourar limite de cartão.

## Telas

| Rota | Protótipo |
|---|---|
| `/kiosk` | 1 — Iniciar viagem, mão piscando |
| `/kiosk/dados` | 2 — Nome, telefone, CPF |
| `/kiosk/destino` | 3 — Origem fixa + destino |
| `/kiosk/veiculo` | 4 — Categorias, tarifa, forma de pagamento |
| `/kiosk/pagamento/pix` | 5 — QR Code |
| `/kiosk/pagamento/cartao` | 6 — Espelho da maquininha |
| `/kiosk/buscando` | 7 — Radar + anúncio |
| `/kiosk/corrida/[code]` | 8 — Motorista encontrado |
| `/t/[code]` | Acompanhamento no celular (fora do quiosque) |

## Onde você precisa mexer

Os pontos marcados com `AJUSTE:` no código:

- `src/lib/legacy-api.ts` — endpoints e nomes de campo do seu PHP. É o
  único arquivo que conhece o formato do legado.
- `src/app/api/kiosk/places/route.ts` — autocomplete real de endereços.
- `src/lib/payments/index.ts` — `generatePixPayload`, hoje mock.
- `src/lib/payments/store.ts` — em memória. Troque por Redis ou MySQL
  antes de rodar com mais de uma instância.

## Integração do Get Smart

O app do terminal faz duas chamadas:

```
POST /api/kiosk/terminals/{terminalId}/claim?kioskId={kioskId}
  → 204 nada a fazer
  → 200 { payment } → dispare getnet://pagamento/v2/payment

POST /api/kiosk/payments/{id}/result
  { "status": "approved", "acquirerNsu": "...", "acquirerAuthCode": "..." }
```

O segundo é o ponto crítico. Grave o resultado em disco antes de enviar
e insista até receber 200. Se o cartão aprovou e esta chamada se perdeu,
o passageiro pagou e não tem corrida.

## Modo quiosque no tablet

```bash
chromium --kiosk --incognito --noerrdialogs \
  --disable-pinch --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  http://localhost:3000/kiosk
```

Em Android, use screen pinning ou um navegador de quiosque com Device
Owner. O reset por inatividade (90s) já está no código, mas ele não
substitui a trava do sistema operacional.

## Marca

Assets em `/public/brand`, gerados a partir do `logo.jpeg`:

| Arquivo | Uso |
|---|---|
| `maylon-lockup.png` | Logo completo, fundo transparente. Telas 1 e 2. |
| `maylon-lockup-white.png` | Mesmo logo em branco, para fundo escuro. |
| `maylon-mark.svg` | Só o pino, vetor. Cabeçalhos e tamanhos pequenos. |
| `icon-512.png`, `apple-icon.png`, `favicon-32.png` | Ícones, gerados do vetor. |

O `maylon-mark.svg` é uma **reconstrução** feita a partir do JPEG, com as
proporções medidas do arquivo original. Está fiel, mas não é o vetor do
designer. Quando conseguir o `.svg` ou `.ai` oficial, substitua o arquivo
e o `MaylonMark` em `src/components/kiosk/Logo.tsx`.

### Cor

A marca é **#31a684**, medida direto do arquivo. Contra branco ela dá
3,04:1 de contraste — passa em texto grande, reprova em texto corrido.
Num totem lido em pé e de longe isso não serve, então a interface usa
`brand-700` (#1e6450, 7:1) e `brand-800`, que são a mesma cor escurecida.
O verde da marca aparece no logo e em detalhes.

### Fonte

`next/font` baixa a Inter no build e auto-hospeda. **O build precisa de
acesso a fonts.googleapis.com.** Se o seu CI for offline, troque por
`next/font/local` com o arquivo `.woff2` no repositório.

### Fundo

`orla.webp` (75 KB), `orla-1280.webp` e `orla-portrait.webp`, gerados de
`praia.jpeg`. Dois tratamentos aplicados no arquivo:

- **Ciano puxado para o verde da marca.** A foto original é ciano (~185°)
  e a marca é verde (163°). Sem o ajuste, o logo briga com o fundo.
- **Base clareada em 32%.** O asfalto original é quase preto — nenhum
  texto escuro sobrevive ali. Clarear no arquivo garante o contraste
  mesmo se o navegador ignorar a camada de véu do CSS.

O `Backdrop` aplica um véu branco em degradê: leve no céu, forte na base.
Medido, o pior ponto da composição dá 4,5:1 contra `brand-900` — o piso
da WCAG AA. `BackdropSwitch` usa véu forte nas telas que já têm cartão
branco grande, e véu leve nas telas 1 e 3.

Para trocar a foto: substitua os `.webp` mantendo os nomes. Se a nova
imagem tiver áreas escuras, refaça o clareamento ou os textos sobre ela
vão reprovar em contraste.

## Se o build falhar com "Cannot find native binding"

A mensagem vem embrulhada como erro de `next/font`, mas o stack aponta
para `@tailwindcss/oxide`. O Tailwind 4 tem núcleo em Rust, distribuído
como binário nativo por plataforma via `optionalDependencies`, e o npm
tem um bug conhecido que às vezes pula esses pacotes.

```bash
rm -rf node_modules package-lock.json
npm install
```

Se persistir, confirme a plataforma e instale o binário na mão:

```bash
node -p "process.platform + '-' + process.arch"   # ex: linux-x64
ldd --version | head -1                            # glibc (gnu) ou musl
npm i -D @tailwindcss/oxide-linux-x64-gnu          # ajuste ao resultado
```

Node precisa ser 20+ — o Tailwind 4 não roda em 18.

`pnpm` e `yarn` não têm esse bug. Se for recorrente no seu CI, migrar o
gerenciador resolve de vez.
