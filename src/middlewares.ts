import { Context } from 'telegraf'
import { Update } from 'typegram'
import { UserSession } from './db.js'

export const RequireAuthorized = async (
  ctx: Context<Update.MessageUpdate>,
  next: () => Promise<void>
) => {
  const session = await UserSession.findOne({ userId: ctx.message.from.id })
  if (session && session.authorized) return next()
}
