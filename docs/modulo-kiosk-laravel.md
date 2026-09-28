# Módulo `KioskManagement` — especificação

Substitui `backend-kiosk-endpoint.md`. A decisão foi criar um módulo
Laravel próprio em vez de remendar o `PaymentController` do app, porque
o totem tem regras de segurança que não deveriam conviver com o fluxo
autenticado do aplicativo.

**Por que não um backend Node separado:** a lógica de dinheiro
(`cashTransaction`, `walletTransaction`, `payable_balance`,
`receivable_balance`, suspensão por limite de caixa) vive no Laravel.
Um segundo escritor no MySQL significaria duas contabilidades
divergindo. E a camada Node já existe: é o `/api/kiosk/*` do Next, que
cuida de sessão, idempotência e orquestração do Get Smart.

**A fronteira:**

| Camada | Responsabilidade |
|---|---|
| Next (`/api/kiosk/*`) | sessão do passageiro, trava de um pedido por totem, idempotência de rede, polling, deeplink do Get Smart |
| `KioskManagement` (Laravel) | convidado, autenticação de dispositivo, captura e conciliação, liberação do despacho |
| `TripManagement` | tudo o que já faz. Não muda. |

---

## 1. Migrations

### 1.1 `kiosks` — os equipamentos

```php
Schema::create('kiosks', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->string('code')->unique();              // KIOSK-PRAIAMAR-01
    $table->string('label');                       // "Shopping Praiamar - Entrada Principal"
    $table->foreignUuid('zone_id')->nullable();
    $table->string('origin_address');
    $table->decimal('origin_lat', 10, 7);
    $table->decimal('origin_lng', 10, 7);
    $table->string('terminal_code')->nullable();   // TERM-PRAIAMAR-01 (Get Smart)
    $table->string('device_token_hash');           // hash, nunca o token
    $table->boolean('is_active')->default(true);
    $table->timestamp('last_seen_at')->nullable(); // heartbeat
    $table->string('app_version')->nullable();
    $table->timestamps();
});
```

O token é guardado como hash. Se um tablet for roubado, revoga só aquele
registro — hoje um token vazado dá acesso de cliente à API inteira.

### 1.2 `kiosk_guests` — passageiro sem conta

```php
Schema::create('kiosk_guests', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->string('guest_code')->unique();        // GUEST-20260908-000123
    $table->foreignUuid('kiosk_id');
    $table->string('name');
    $table->string('phone')->nullable();
    $table->string('document')->nullable();
    // Vinculação futura: se a pessoa criar conta com o mesmo telefone,
    // o histórico de corridas do totem passa a ser dela.
    $table->foreignUuid('user_id')->nullable();
    $table->timestamp('expires_at');               // 30 min
    $table->timestamps();
});
```

Convidado **não** entra na tabela `users`. Criar customer de verdade por
passageiro poluiria a base e bagunçaria métricas de cadastro.

### 1.3 `kiosk_payments` — a captura, com o NSU

```php
Schema::create('kiosk_payments', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->foreignUuid('kiosk_id');
    $table->foreignUuid('trip_request_id')->nullable();
    $table->foreignUuid('kiosk_guest_id');

    $table->enum('method', ['card', 'pix', 'cash']);
    $table->decimal('amount', 12, 2);              // valor do banco, não do cliente
    $table->enum('status', [
        'pending', 'approved', 'declined', 'failed', 'expired', 'refunded',
    ])->default('pending');

    // Conciliação com o extrato da Getnet
    $table->string('acquirer')->nullable();        // getnet
    $table->string('nsu')->nullable()->index();
    $table->string('authorization_code')->nullable();
    $table->string('terminal_code')->nullable();
    $table->json('acquirer_payload')->nullable();  // retorno cru do deeplink

    // PIX
    $table->string('pix_txid')->nullable()->index();

    $table->string('idempotency_key')->unique();
    $table->timestamp('captured_at')->nullable();
    $table->timestamp('refunded_at')->nullable();
    $table->timestamps();
});
```

Tabela separada, não coluna em `trip_requests`, porque uma corrida pode
ter várias tentativas: recusa, retry, depois aprovação. Cada uma é uma
linha, e todas ficam para auditoria.

### 1.4 Liberação do despacho

```php
Schema::table('trip_requests', function (Blueprint $table) {
    $table->boolean('is_dispatch_blocked')->default(false)->index();
});
```

O totem cria a corrida com `is_dispatch_blocked = true` e o pagamento a
libera. **O serviço de despacho precisa filtrar por esse campo.** Sem
isso, motorista é acionado antes de alguém pagar.

Preferi um booleano a um novo valor em `current_status` para não mexer na
máquina de estados que o app e o painel já consomem.

---

## 2. Rotas

Prefixo `/api/kiosk`, middleware próprio `auth.kiosk` + throttle.

```php
Route::prefix('api/kiosk')->middleware(['auth.kiosk', 'throttle:kiosk'])
    ->group(function () {
        Route::post('guests',            [GuestController::class, 'store']);
        Route::post('trips',             [KioskTripController::class, 'store']);
        Route::post('payments',          [KioskPaymentController::class, 'store']);
        Route::get ('payments/{id}',     [KioskPaymentController::class, 'show']);
        Route::post('payments/{id}/capture', [KioskPaymentController::class, 'capture']);
        Route::post('payments/{id}/refund',  [KioskPaymentController::class, 'refund']);
        Route::post('heartbeat',         [KioskController::class, 'heartbeat']);
    });
```

### `auth.kiosk`

Header `X-Kiosk-Token`, comparado com `device_token_hash`. Resolve o
`kiosk` no request, atualiza `last_seen_at`, rejeita inativo.

Isso substitui o Bearer de cliente que o totem usa hoje. O ganho é
grande: um token de totem não pode listar corridas de outra pessoa,
alterar perfil, nem mexer em carteira.

### `throttle:kiosk`

Um totem atende uma pessoa por vez. Algo como 30 requisições por minuto
por dispositivo já é folgado, e fecha a porta para script.

---

## 3. Comportamento que importa

### `POST payments` — a captura

1. **O `amount` do cliente é ignorado para cobrança.** Recalcula de
   `discount_actual_fare` da corrida. Se o valor recebido divergir,
   devolve 422 — serve só de conferência.
2. `idempotency_key` com `unique`: retry de rede devolve a mesma linha em
   vez de cobrar duas vezes. A garantia vira do banco, não do código.
3. Uma captura `pending` ou `approved` por totem. Segunda tentativa → 409.

### `POST payments/{id}/capture` — o Get Smart confirma

Recebe `nsu`, `authorization_code`, `acquirer_payload`. Aí sim:

1. Grava a referência.
2. `payment_status = PAID`, `paid_fare` do banco.
3. `is_dispatch_blocked = false` — a corrida entra para os motoristas.
4. **Não chama `cashTransaction`.** O valor entra como recebimento da
   plataforma; a comissão do motorista vira recebível normal.
5. Push só se `$trip->driver` existir.
6. Idempotente: mesma `nsu` devolve 200 sem reprocessar.

O item 4 é o que evita o problema mais grave do fluxo atual. Pagar
corrida de totem como `cash` credita dinheiro em mão do motorista, que
não recebeu nada, e isso acaba disparando a suspensão por
`max_amount_to_hold_cash`. Silencioso e cumulativo.

### `POST payments/{id}/refund`

PIX resolve sozinho pela rota existente. Cartão presencial exige estorno
na Getnet — marca `refunded_at` e sinaliza que é manual, para não
prometer ao passageiro algo que o sistema não fez.

---

## 4. O PIX continua em aberto

`/api/v1/pix/generate` não exige `Authorization` e recebe o `amount` do
cliente. A pergunta segue a mesma: **o controller usa esse número ou
relê o valor da corrida pelo `trip_id`?**

Se usar o recebido, qualquer pessoa com um `trip_id` gera um PIX de um
centavo para uma corrida de cem reais. Ao trazer o PIX para dentro do
módulo, isso se corrige de graça: o valor sai sempre do banco.

---

## 5. Ordem sugerida

1. Migrations e `auth.kiosk`. Destrava tudo o mais.
2. `POST guests` e `POST trips` com `is_dispatch_blocked`, mais o filtro
   no serviço de despacho.
3. `payments` e `capture`, com a coluna de NSU.
4. PIX movido para dentro do módulo.
5. `heartbeat` e tela de operação da frota.

Os passos 1 a 3 já permitem cobrar de verdade. O 4 é o de maior risco
de segurança. O 5 é operação.

No totem, cada etapa entra trocando `MAYLON_PAYMENT_CONFIRM_MODE` e as
URLs em `src/lib/legacy-api.ts` — a interface não muda.
