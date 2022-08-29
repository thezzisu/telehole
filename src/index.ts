import { randomBytes } from 'crypto'
import { Telegraf } from 'telegraf'
import { Message } from 'typegram'
import { decodeCbQuery, encodeCbQuery } from './cbquery.js'
import { HoleSession, UserSession, UserSessionState } from './db.js'
import { enter, handlePrivateMessage, userInit } from './handler.js'
import { fatal, info, warn } from './logger.js'
import { RequireAuthorized } from './middlewares.js'

const BOT_TOKEN = process.env.HOLE_BOT_TOKEN!
if (!BOT_TOKEN) fatal('HOLE_BOT_TOKEN is not set')
const CHANNEL = process.env.HOLE_CHANNEL!
if (!CHANNEL) fatal('HOLE_CHANNEL is not set')

const authorizeToken = randomBytes(32).toString('hex')
info(`Authorize token: ${authorizeToken}`)

const bot = new Telegraf(BOT_TOKEN)

const me = await bot.telegram.getMe()

const channelInfo = await bot.telegram.getChat('@' + CHANNEL)

export const channelId = channelInfo.id
if (channelInfo.type !== 'channel') {
  throw new Error('Channel is not a channel')
}
export const channelName = channelInfo.username
if (!channelName) {
  throw new Error('Channel has no username')
}
export const discussionId = channelInfo.linked_chat_id!
if (!discussionId) {
  throw new Error('Channel is not linked to a discussion')
}
const discussionInfo = await bot.telegram.getChat(discussionId)
if (discussionInfo.type !== 'supergroup') {
  throw new Error('Discussion is not a supergroup')
}
info(
  `Operate on:\n${channelInfo.title}(${channelId})\n${discussionInfo.title}(${discussionId})`
)

bot.start(async (ctx) => {
  switch (ctx.chat.type) {
    case 'private':
      const payload = ctx.message.text.split(' ')[1]
      switch (payload) {
        case 'noinit':
          return
        default:
          await userInit(ctx.message.from.id, ctx.chat.id)
          return ctx.replyWithMarkdownV2('Welcome to **TeleHole Bot**')
      }
    default:
      return ctx.reply('TeleHole Bot currently only works in private chats')
  }
})
bot.command('cancel', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  await enter(ctx.message.from.id, UserSessionState.IDLE)
  ctx.replyWithMarkdown(`Operation canceled.`)
})
bot.command('post', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  await enter(ctx.message.from.id, UserSessionState.POST)
  ctx.reply(`Your next message will be posted.`)
})
bot.command('reply', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  await enter(ctx.message.from.id, UserSessionState.REPLY_0)
  ctx.reply(`Please enter the message ID that you want to reply.`)
})

bot.command('authorize', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  const token = ctx.message.text.split(' ')[1]
  if (token !== authorizeToken) return
  await UserSession.updateOne(
    { userId: ctx.message.from.id },
    { $set: { authorized: true } }
  )
})

bot.command('debug', RequireAuthorized, async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  const session = await UserSession.findOne({ userId: ctx.message.from.id })
  ctx.replyWithMarkdownV2(
    '```\n' + JSON.stringify(session, null, '  ') + '\n```\n'
  )
})

bot.help((ctx) =>
  ctx.replyWithMarkdownV2(`**TeleHole Bot Help**
Please join [the channel](https://t.me/${channelName}) first\\.
\`\`\`
Usage:

/post   - Post a new hole
/reply  - Reply to a hole/reply
/cancel - Cancel the current operation
\`\`\`
`)
)

await bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

await bot.telegram.setMyCommands([
  { command: 'post', description: 'Post a new hole' },
  { command: 'reply', description: 'Reply to a hole' },
  { command: 'cancel', description: 'Cancel a operation' },
  { command: 'help', description: 'Help me' }
])

bot.on('message', async (ctx, next) => {
  if (ctx.senderChat?.id !== channelId) return next()
  const msg = ctx.message as Message.CommonMessage
  if (!msg.is_automatic_forward) return next()
  const channelMsgId = msg.forward_from_message_id
  if (!channelMsgId) {
    warn(`Message ${msg.message_id} is not forwarded`)
    return
  }
  // This message is a forwarded message from the channel
  await HoleSession.updateOne(
    { channelMsgId },
    { $set: { msgId: msg.message_id } },
    { upsert: true }
  )
  info(`Created hole for ${msg.message_id}`)
  await bot.telegram.sendMessage(
    discussionId,
    `Hole ID is \`${msg.message_id}\`, use this ID to reply\\.`,
    {
      reply_to_message_id: msg.message_id,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Reply',
              callback_data: encodeCbQuery({
                type: 'reply',
                replyMsgId: msg.message_id,
                replyTarget: 0
              })
            }
          ]
        ]
      }
    }
  )
})

bot.on('message', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next()
  return handlePrivateMessage(ctx, ctx.message.from.id, ctx.message)
})

bot.on('callback_query', async (ctx) => {
  if (!ctx.callbackQuery.data) return
  const data = decodeCbQuery(ctx.callbackQuery.data)
  switch (data.type) {
    case 'notify':
      return ctx.answerCbQuery(data.text)
    case 'reply':
      const resp = await UserSession.findOneAndUpdate(
        { userId: ctx.callbackQuery.from.id },
        {
          $set: {
            state: UserSessionState.REPLY_1,
            replyMsgId: data.replyMsgId,
            replyTarget: data.replyTarget
          }
        },
        { returnDocument: 'after' }
      )
      if (resp.value) {
        await ctx.telegram.sendMessage(
          resp.value.chatId,
          `You are replying to hole \`${data.replyMsgId}\` Please press start then enter your reply:`,
          { parse_mode: 'MarkdownV2' }
        )
      }
      return ctx.answerCbQuery('Goto bot and reply', {
        url: `https://t.me/${me.username}?start=noinit`
      })
  }
})

info('Bot is online')
