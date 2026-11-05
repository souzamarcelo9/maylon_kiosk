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

/**
 * Lê uma variável obrigatória.
 *
 * Falhar aqui, nomeando o que falta, é melhor que seguir com header
 * vazio e tomar 401 — que manda procurar o problema no servidor
 * quando ele está no .env.
 */
export function requireEnv(nome: 'apiBase' | 'kioskToken'): string {
  const valor = serverConfig[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return valor;
}