import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import pino, { type LoggerOptions as PinoOptions, type TransportTargetOptions as PinoTransportOptions } from 'pino'
import pretty from 'pino-pretty'
import { getCurrentConfig } from './config/index.js'

export function createLogger(options?: Partial<PinoOptions>) {
  // Get logger configuration (with fallback values)
  const config = getCurrentConfig()
  const loggerConfig = config?.logger || {
    level: 'info',
    service: 'pothos-todo',
    version: '1.0.0',
    dir: '.out/logs',
    files: {
      debug: 'debug.log',
      error: 'errors.log',
    },
    console: {
      enabled: true,
    },
  }

  // Ensure log directory exists
  if (loggerConfig.dir && !existsSync(loggerConfig.dir)) {
    mkdirSync(loggerConfig.dir, { recursive: true })
  }

  // Determine if we need pretty printing (development)
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const shouldPrettyPrint = isDevelopment && loggerConfig.console?.enabled

  // Base logger options
  const baseOptions: PinoOptions = {
    level: loggerConfig.level,
    base: {
      service: loggerConfig.service,
      version: loggerConfig.version,
      pid: process.pid,
      hostname: undefined, // Remove hostname for privacy
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      error: pino.stdSerializers.err,
    },
    ...options,
  }

  // Create transport for file logging or pretty printing
  let transport
  if (shouldPrettyPrint) {
    transport = pretty({
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      hideObject: false,
      customPrettifiers: {
        time: (timestamp: string | object) => `🕐 ${timestamp as string}`,
        level: (logLevel: string | object) => {
          const levelEmojis: Record<string, string> = {
            trace: '🔍',
            debug: '🐛',
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            fatal: '💀',
          }
          return `${levelEmojis[logLevel as string] || '📝'} ${(logLevel as string).toUpperCase()}`
        },
      },
    })
  } else if (loggerConfig.dir && loggerConfig.files) {
    // File transport for production
    const targets: PinoTransportOptions[] = [
      {
        target: 'pino/file',
        level: loggerConfig.level,
        options: {
          destination: join(loggerConfig.dir, loggerConfig.files.debug),
          mkdir: true,
        },
      },
      {
        target: 'pino/file',
        level: 'error',
        options: {
          destination: join(loggerConfig.dir, loggerConfig.files.error),
          mkdir: true,
        },
      },
    ]

    transport = pino.transport({
      targets,
    })
  }

  return pino(baseOptions, transport)
}

export const logger = createLogger();