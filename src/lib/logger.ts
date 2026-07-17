import pino from "pino";

/**
 * LOG_LEVEL é lido diretamente (não via src/lib/env.ts): tem um default seguro
 * e não deve travar a aplicação caso ausente ou mal configurado.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
