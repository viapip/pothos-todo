import { inspect } from 'node:util'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

import {
  type LoggerOptions,
  createLogger as createWinstonLogger,
  format as f,
  transports as t,
} from 'winston'

import { getCurrentConfig } from './config/index.js'

export function createLogger(options?: LoggerOptions) {
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
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'blue',
        debug: 'gray',
      },
    },
  }

  // Ensure log directory exists
  if (loggerConfig.dir && !existsSync(loggerConfig.dir)) {
    mkdirSync(loggerConfig.dir, { recursive: true })
  }

  // Build transports array
  const transports: any[] = []

  // Console transport (conditional)
  if (loggerConfig.console?.enabled) {
    transports.push(
      new t.Console({
        level: loggerConfig.level,
        format: f.combine(
          f.colorize({
            level: true,
            message: false,
            colors: loggerConfig.console?.colors || {
              error: 'red',
              warn: 'yellow',
              info: 'blue',
              debug: 'gray',
            },
          }),
          f.printf((log: any) => {
            const bagde = `. ${log.level}${log.label && `:${log.label}`}`
            const name =
              log.service && log.version && `\\ ${log.service}@${log.version}`
            const time = log.timestamp && `> ${log.timestamp.split('T')[1]}`
            const message =
              typeof log.message === 'string' &&
              log.message.length > 0 &&
              `\\ ${log.message}`
            const stack =
              log.stack &&
              typeof log.message === 'string' &&
              log.message.length > 0 &&
              log.stack.slice(log.stack.indexOf('\n') + 1)
            const data =
              log.data &&
              typeof log.data === 'object' &&
              Object.keys(log.data).length > 0 &&
              inspect(log.data, {
                breakLength: 80,
                compact: true,
                colors: true,
                showHidden: true,
                sorted: true,
              })

            return [bagde, name, time, message, stack, data].reduce(
              (acc, line) => (line ? `${acc}\n${line}` : acc),
              '',
            )
          }),
        ),
      })
    )
  }

  // File transports
  if (loggerConfig.dir && loggerConfig.files) {
    transports.push(
      new t.File({
        level: loggerConfig.level,
        filename: join(loggerConfig.dir, loggerConfig.files.debug),
        format: f.json(),
      }),
      new t.File({
        level: 'error',
        filename: join(loggerConfig.dir, loggerConfig.files.error),
        format: f.json(),
      })
    )
  }

  return createWinstonLogger({
    defaultMeta: {
      service: loggerConfig.service,
      version: loggerConfig.version,
    },

    exitOnError: false,
    handleRejections: true,

    format: f.combine(
      f.timestamp(),
      f.errors({
        stack: true,
        inspect: false,
      }),
      f.metadata({
        key: 'data',
        fillExcept: [
          'stack',
          'version',
          'message',
          'label',
          'level',
          'timestamp',
        ],
      }),
    ),

    transports,

    ...options,
  })
}

export const logger = createLogger();