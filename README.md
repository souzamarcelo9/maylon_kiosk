# Maylon Kiosk

Fluxo de autoatendimento em Next.js. Tela cheia no tablet, pagamento no
Get Smart ao lado, backend PHP/MySQL existente por trás.

## Rodar

```bash
cp .env.example .env.local   # ajuste MAYLON_API_BASE e o KIOSK_ID
npm install
npm run dev                  # http://localhost:3000 → redireciona para /kiosk
```

A raiz `/` redireciona para `/kiosk` (307, configurado em `next.config.ts`).
No tablet, aponte o navegador direto para `/kiosk` e evite o salto.

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

## Integração com o backend Maylon

Base: `https://auth.maylon.com.br`
Auth: **`X-Kiosk-Token`** — o token do dispositivo, gerado por
`php artisan kiosk:create`.

O totem não usa mais Bearer de cliente. A diferença importa: um Bearer
extraído do tablet dava acesso a listar corridas de terceiros, alterar
perfil e mexer em carteira. O token de totem abre só o módulo
`KioskManagement`, e revogar é desativar uma linha em `kiosks`.

Rotas consumidas, todas em `src/lib/legacy-api.ts`:

| Rota | Uso |
|---|---|
| `GET /api/kiosk/config` | identidade, origem fixa e zona do totem |
| `POST /api/kiosk/guests` | passageiro convidado |
| `GET /api/kiosk/places` | busca de destino |
| `GET /api/kiosk/places/{id}` | resolve a coordenada |
| `GET /api/kiosk/vehicle-categories` | nome e imagem das categorias |
| `POST /api/kiosk/estimate` | preços, mesma base do app |
| `POST /api/kiosk/trips` | cria a corrida, bloqueada para despacho |
| `GET /api/kiosk/trips/{id}` | motorista, veículo, status |
| `POST /api/kiosk/payments` | abre a cobrança |
| `GET /api/kiosk/payments/{id}` | status (PIX consulta o provedor) |
| `POST /api/kiosk/payments/{id}/capture` | resultado do Get Smart, com NSU |
| `POST /api/kiosk/payments/{id}/refund` | estorno |

### Três coisas que o módulo resolveu

**O valor não vem mais do cliente.** O totem manda `expected_amount`
apenas como conferência; o módulo lê da corrida no banco e recusa com
422 se divergir.

**A ordem parou de ser um problema.** O PIX exige `trip_id`, então a
corrida nasce antes do pagamento — mas com `is_dispatch_blocked = true`.
Nenhum motorista a enxerga até a captura.

**A idempotência é do banco**, por índice unique em `idempotency_key`.
Antes vivia em memória no Next e se perdia a cada restart.

### A origem nunca vem do tablet

`GET /api/kiosk/config` devolve a origem cadastrada, e `estimate` e
`trips` a usam do lado do servidor. Além de evitar erro de GPS dentro de
prédio, fecha a porta para manipular tarifa enviando origem distante.

### Pagamento: leia docs/modulo-kiosk-laravel.md

O `PaymentController` do app não serve para totem: `cash` suspende
motoristas por limite de caixa, a rota estoura se a corrida não tem
motorista, e não existe campo para o NSU da Getnet.

Os contornos estão implementados no totem, mas a correção é um módulo
`KioskManagement` no Laravel, com convidado, autenticação por
dispositivo, captura com NSU e liberação do despacho. O documento tem as
migrations e o comportamento esperado de cada rota.

### Pontos a confirmar no PHP

1. **`/api/v1/pix/generate` valida o `amount`?** O app manda o valor pelo
   cliente e a rota não usa `Authorization`. Se o PHP confiar nesse número
   em vez de reler a corrida, dá para pagar R$ 0,01 numa corrida de R$ 100.
   Num totem, com a URL exposta, isso é o risco mais sério do projeto.
2. **Assinatura de `/api/customer/ride/payment`.** O corpo em
   `markTripPaid` é inferência.
3. **Resposta crua de `get-zone-id`.** O adaptador aceita `{data:{zone_id}}`
   e `{zone_id}`, mas convém confirmar.
4. **Valores válidos de `payment_method`** em
   `/api/customer/config/get-payment-methods`.
5. **Resposta de `/api/customer/ride/arrival-time`.** O nome do campo de
   minutos é lido de forma defensiva (`arrival_time`, `duration`, `eta`,
   `time`); confirme qual é o certo.

### O veículo não tem cor

A classe `Vehicle` do backend tem `model`, `licence_plate_number`,
`licence_expire_date`, `vin_number`, `transmission`, `fuel_type`,
`ownership`, `documents` e `is_active`. Nenhum campo de cor.

O protótipo mostrava "Prata" e isso não tem de onde vir. A tela 8 passou
a mostrar a categoria e a capacidade de passageiros no lugar. Se cor for
importante para identificar o carro na fila do shopping — e é — vale
adicionar a coluna no cadastro de veículo.
