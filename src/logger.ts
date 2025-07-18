import { inspect } from 'node:util'

import {
  type LoggerOptions,
  createLogger as createWinstonLogger,
  format as f,
  transports as t,
} from 'winston'

export function createLogger(options?: LoggerOptions) {
  return createWinstonLogger({
    defaultMeta: {
      service: 'pothos-todo',
      version: '1.0.0',
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

    transports: [
      new t.Console({
        level: 'debug',
        format: f.combine(
          f.colorize({
            level: true,
            message: false,

            colors: {
              error: 'red',
              warn: 'yellow',
              info: 'blue',
              debug: 'gray',
            },
          }),
          f.printf((log) => {
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
              log.message.length > 0 &&
              log.stack.slice(log.stack.indexOf('\n') + 1)
            const data =
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
      }),
      new t.File({
        level: 'debug',
        filename: '.out/logs/debug.log',
        format: f.json(),
      }),
      new t.File({
        level: 'error',
        filename: '.out/logs/errors.log',
        format: f.json(),
      }),
    ],

    ...options,
  })
}

export const logger = createLogger();