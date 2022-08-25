import chalk from 'chalk'
import { inspect } from 'util'

function toStr(whatever: unknown) {
  return typeof whatever === 'string'
    ? whatever
    : inspect(whatever, undefined, null)
}

function pad(str: string) {
  return str.split('\n').join(`\n => `)
}

function normalize(message: unknown) {
  return ' ' + pad(toStr(message))
}

export function info(message: unknown) {
  console.log(chalk.blue(`[+]`) + normalize(message))
}

export function warn(message: unknown) {
  console.log(chalk.yellow(`[!]`) + normalize(message))
}

export function error(message: unknown) {
  console.log(chalk.red(`[-]`) + normalize(message))
}
