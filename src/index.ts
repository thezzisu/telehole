import { Telegraf } from 'telegraf'
import { Message, CommonMessageBundle } from 'typegram'
import { error, info, warn } from './logger.js'
import {
  HoleSession,
  MemoryStorage,
  SessionState,
  UserSession
} from './session.js'

async function start(token: string, channel: string) {
  const userStorage = new MemoryStorage<number, UserSession>()
  const holeStorage = new MemoryStorage<number, HoleSession>()

  const bot = new Telegraf(token)
  const channelInfo = await bot.telegram.getChat(channel)
  const channelId = channelInfo.id
  if (channelInfo.type !== 'channel') {
    throw new Error('Channel is not a channel')
  }
  const _discussionId = channelInfo.linked_chat_id
  if (!_discussionId) {
    throw new Error('Channel is not linked to a discussion')
  }
  const discussionId = _discussionId
  const discussionInfo = await bot.telegram.getChat(discussionId)
  if (discussionInfo.type !== 'supergroup') {
    throw new Error('Discussion is not a supergroup')
  }
  info(`Operate on ${channelInfo.title}/${discussionInfo.title}`)

  bot.start((ctx) => {
    switch (ctx.chat.type) {
      case 'private':
        ctx.reply('Welcome to TeleHole Bot')
        break
      default:
        ctx.reply('TeleHole Bot currently only works in private chats')
    }
  })
  bot.command('cancel', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next()
    const session = await UserSession.get(userStorage, ctx.chat.id)
    await session.enter(SessionState.IDLE)
    ctx.replyWithMarkdown(`Operation canceled.`)
  })
  bot.command('post', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next()
    const session = await UserSession.get(userStorage, ctx.chat.id)
    await session.enter(SessionState.POST)
    ctx.replyWithMarkdown(
      `Enter post mode, your **next message** will be posted.`
    )
  })
  bot.command('reply', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next()
    const session = await UserSession.get(userStorage, ctx.chat.id)
    await session.enter(SessionState.PREPARE_REPLY)
    ctx.replyWithMarkdown(
      `Enter reply mode, your **next message** will be posted.`
    )
  })
  bot.command('debug', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next()
    const session = await UserSession.get(userStorage, ctx.chat.id)
    ctx.replyWithMarkdownV2(
      '```\n' + JSON.stringify(session, null, '  ') + '\n```\n'
    )
  })
  bot.help((ctx) => ctx.reply('If you are smart enough, you can use me'))

  await bot.launch()
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  await bot.telegram.setMyCommands([
    { command: 'post', description: 'Post a new hole' },
    { command: 'reply', description: 'Reply to a hole' },
    { command: 'cancel', description: 'Cancel a operation' }
  ])

  bot.on('channel_post', (ctx) => {
    console.log(ctx.message)
  })

  bot.on('message', async (ctx, next) => {
    if (ctx.senderChat?.id !== channelId) return next()
    const msg = ctx.message as Message.CommonMessage
    if (!msg.is_automatic_forward) return next()
    // This message is a forwarded message from the channel
    await bot.telegram.sendMessage(
      discussionId,
      `Hole ID is \`${msg.message_id}\`, use this ID to reply\\.`,
      {
        reply_to_message_id: msg.message_id,
        parse_mode: 'MarkdownV2'
      }
    )
  })

  async function forward(
    message: Message,
    dest: number,
    target?: number,
    name?: string
  ) {
    if ('text' in message) {
      return bot.telegram.sendMessage(dest, message.text, {
        reply_to_message_id: target,
        reply_markup: name
          ? {
              inline_keyboard: [
                [{ text: `From: ${name}`, callback_data: `some_data` }]
              ]
            }
          : undefined
      })
    } else if ('sticker' in message) {
      return bot.telegram.sendSticker(dest, message.sticker.file_id, {
        reply_to_message_id: target
      })
    }
    throw new Error('Unsupported message type')
  }

  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next()
    try {
      const session = await UserSession.get(userStorage, ctx.chat.id)
      const msg = ctx.message as CommonMessageBundle
      switch (session.state) {
        case SessionState.IDLE:
          return next()

        case SessionState.POST:
          await forward(msg, channelId)
          await session.enter(SessionState.IDLE)
          return ctx.reply(`OK`)

        case SessionState.PREPARE_REPLY:
          if (!('text' in msg)) throw new Error('Message is not a text')
          const msgId = parseInt(msg.text)
          if (isNaN(msgId)) throw new Error('Message is not a number')
          session.target = msgId
          await session.enter(SessionState.REPLY)
          return ctx.reply(`OK`)

        case SessionState.REPLY:
          try {
            const hole = await HoleSession.get(holeStorage, session.target)
            if (!(ctx.chat.id in hole.mapping)) {
              hole.mapping[ctx.chat.id] = Object.keys(hole.mapping).length
              await hole.save()
            }
            const ord = hole.mapping[ctx.chat.id]
            const name = ord ? `No. ${ord}` : `Hole creator`
            await forward(msg, discussionId, session.target, name)
            ctx.reply(`OK`)
          } catch (err) {
            ctx.reply(`${err}`)
          }
          await session.enter(SessionState.IDLE)
          return
        default:
          return ctx.reply('Not supported')
      }
    } catch (err) {
      return ctx.reply(`${err}`)
    }
  })

  await bot.telegram.sendMessage(channelId, 'Hole Bot is online')
  info('Bot is online')
}

const BOT_TOKEN = process.env.HOLE_BOT_TOKEN
const CHANNEL = process.env.HOLE_CHANNEL
if (!BOT_TOKEN || !CHANNEL) process.exit(1)

start(BOT_TOKEN, CHANNEL).catch((err) => {
  error(err.stack)
  process.exit(-1)
})
