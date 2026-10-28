import 'server-only';

export const serverConfig = {
  apiBase: process.env.MAYLON_API_BASE,
  kioskToken: process.env.MAYLON_KIOSK_TOKEN,
  paymentDriver: process.env.MAYLON_PAYMENT_DRIVER as
    | 'mock'
    | 'getnet_app2app',
  terminalId: process.env.MAYLON_TERMINAL_ID,
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
};