import chalk from 'chalk'
import { inspect } from 'util'

function toStr(whatever: unknown) {
  return typeof whatever === 'string'
    ? whatever
    : whatever instanceof Error
    ? whatever.stack ?? `${whatever}`
    : inspect(whatever, undefined, null)
}

function pad(str: string) {
  return str.split('\n').join(`\n => `)
}

function normalize(message: unknown) {
  return ' ' + pad(toStr(message))
}

export function info(message: unknown) {
  console.log(chalk.blue(`[+]` + normalize(message)))
}

export function warn(message: unknown) {
  console.log(chalk.yellow(`[!]` + normalize(message)))
}

export function error(message: unknown) {
  console.log(chalk.red(`[-]` + normalize(message)))
}

export function fatal(message: unknown) {
  console.log(chalk.bgRedBright.whiteBright(`[/]` + normalize(message)))
  process.exit(1)
}

export function debug(message: unknown) {
  if (process.env.HOLE_DEBUG) {
    console.log(chalk.gray(`[#]` + normalize(message)))
  }
}
