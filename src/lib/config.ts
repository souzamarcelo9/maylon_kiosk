/**
 * Configuração do totem.
 *
 * Tudo que é NEXT_PUBLIC_* vem do provisionamento do tablet e identifica
 * ESTE equipamento. Um build serve todos os totens; muda só o .env.
 */
export const kioskConfig = {
  id: process.env.NEXT_PUBLIC_KIOSK_ID ?? 'KIOSK-DEV-01',
  label: process.env.NEXT_PUBLIC_KIOSK_LABEL ?? 'Totem de demonstração',
  origin: {
    label:
      process.env.NEXT_PUBLIC_KIOSK_ORIGIN_LABEL ??
      'Av. 9 de Abril, 2500 - Centro, Cubatão',
    lat: Number(process.env.NEXT_PUBLIC_KIOSK_ORIGIN_LAT ?? -23.8955),
    lng: Number(process.env.NEXT_PUBLIC_KIOSK_ORIGIN_LNG ?? -46.4256),
  },
  trackingBase:
    process.env.NEXT_PUBLIC_TRACKING_BASE ?? 'https://maylon.com.br/t',
} as const;

/** Só no servidor. Nunca importe isto de um componente client. */
export const serverConfig = {
  apiBase: process.env.MAYLON_API_BASE ?? '',
  apiToken: process.env.MAYLON_API_TOKEN ?? '',
  paymentDriver: (process.env.MAYLON_PAYMENT_DRIVER ?? 'mock') as
    | 'mock'
    | 'getnet_app2app',
  terminalId: process.env.MAYLON_TERMINAL_ID ?? 'TERM-DEV-01',
};

/** Volta para a tela inicial depois disto de inatividade. */
export const IDLE_TIMEOUT_MS = 90_000;
/** Aviso "ainda está aí?" antes de resetar. */
export const IDLE_WARNING_MS = 20_000;
