/**
 * Configuração do totem.
 *
 * A maior parte agora vem do backend, em GET /api/kiosk/config. O tablet
 * carrega só o token: trocar um totem de porta virou uma linha no banco
 * em vez de reprovisionar o equipamento.
 */
export const kioskConfig = {
  /** Fallback até o /config responder. */
  id: process.env.NEXT_PUBLIC_KIOSK_ID ?? 'KIOSK-DEV-01',
  label: process.env.NEXT_PUBLIC_KIOSK_LABEL ?? 'Totem Maylon',
  trackingBase:
    process.env.NEXT_PUBLIC_TRACKING_BASE ?? 'https://maylon.com.br/t',
} as const;

/** Só no servidor. Nunca importe isto de um componente client. */
export const serverConfig = {
  apiBase: process.env.MAYLON_API_BASE ?? '',
  /**
   * Token do dispositivo, gerado por `php artisan kiosk:create`.
   *
   * Substitui o Bearer de cliente que o totem usava. A diferença é
   * grande: este token só abre as rotas de /api/kiosk, e revogar é
   * desativar uma linha em `kiosks`. Um Bearer de cliente vazado do
   * tablet lê corridas de terceiros e mexe em carteira.
   */
  kioskToken: process.env.MAYLON_KIOSK_TOKEN ?? '',
  paymentDriver: (process.env.MAYLON_PAYMENT_DRIVER ?? 'mock') as
    | 'mock'
    | 'getnet_app2app',
  terminalId: process.env.MAYLON_TERMINAL_ID ?? 'TERM-DEV-01',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
};

/** Volta para a tela inicial depois disto de inatividade. */
export const IDLE_TIMEOUT_MS = 90_000;
/** Aviso "ainda está aí?" antes de resetar. */
export const IDLE_WARNING_MS = 20_000;
