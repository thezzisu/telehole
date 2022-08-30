import { Context } from 'telegraf'
import { Message, InlineKeyboardMarkup } from 'typegram'
import { encodeCbQuery } from './cbquery.js'
import {
  HoleSession,
  IUserSession,
  UserSession,
  UserSessionState
} from './db.js'
import { channelId, channelName, discussionId } from './index.js'
import { debug, warn } from './logger.js'
import { getName } from './names.js'

export async function userInit(userId: number, chatId: number) {
  await UserSession.updateOne(
    { userId },
    { $set: { userId, chatId, state: UserSessionState.IDLE } },
    { upsert: true }
  )
}

export async function enter(userId: number, state: UserSessionState) {
  await UserSession.updateOne({ userId }, { $set: { state } })
}

interface IUserStatefulHandler {
  (
    ctx: Context,
    userId: number,
    message: Message,
    session: IUserSession
  ): Promise<void>
}

function makeReplyInlineKeyboard(tid: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: `From ${tid}`,
          callback_data: encodeCbQuery({
            type: 'notify',
            text: `The message is sent from ${tid}`
          })
        }
      ]
    ]
  }
}

async function updateReplyInlineKeyboard(
  ctx: Context,
  holeMsgId: number,
  messageId: number,
  tid: number
) {
  ctx.telegram.editMessageReplyMarkup(discussionId, messageId, undefined, {
    inline_keyboard: [
      [
        {
          text: `Reply to ${getName(tid)}`,
          callback_data: encodeCbQuery({
            type: 'reply',
            replyMsgId: holeMsgId,
            replyTarget: messageId
          })
        }
      ]
    ]
  })
}

const UserStatefulHandlers: Record<UserSessionState, IUserStatefulHandler> = {
  async [UserSessionState.IDLE](ctx) {
    await ctx.reply(`わかります！`)
  },
  async [UserSessionState.POST](ctx, userId, message) {
    try {
      let promise: Promise<Message>
      if ('forward_date' in message) {
        promise = ctx.telegram.forwardMessage(
          channelId,
          message.chat.id,
          message.message_id
        )
      } else if ('text' in message) {
        promise = ctx.telegram.sendMessage(channelId, message.text, {
          entities: message.entities,
          reply_to_message_id: message.reply_to_message?.message_id
        })
      } else if ('sticker' in message) {
        promise = ctx.telegram.sendSticker(channelId, message.sticker.file_id, {
          reply_to_message_id: message.reply_to_message?.message_id
        })
      } else if ('photo' in message) {
        promise = ctx.telegram.sendPhoto(channelId, message.photo[0].file_id, {
          reply_to_message_id: message.reply_to_message?.message_id,
          caption: message.caption,
          caption_entities: message.caption_entities
        })
      } else if ('video' in message) {
        promise = ctx.telegram.sendVideo(channelId, message.video.file_id, {
          reply_to_message_id: message.reply_to_message?.message_id,
          caption: message.caption,
          caption_entities: message.caption_entities
        })
      } else if ('document' in message) {
        promise = ctx.telegram.sendDocument(
          channelId,
          message.document.file_id,
          {
            reply_to_message_id: message.reply_to_message?.message_id,
            caption: message.caption,
            caption_entities: message.caption_entities
          }
        )
      } else {
        throw new Error('Unsupported message type')
      }
      const msg = await promise
      await HoleSession.updateOne(
        { channelMsgId: msg.message_id },
        { $set: { participants: [userId] } },
        { upsert: true }
      )
      await ctx.reply(
        `Hole created:\n\nhttps://t.me/${channelName}/${msg.message_id}`,
        { reply_to_message_id: message.message_id }
      )
    } catch (err) {
      await ctx.reply(`${err}`)
    }
    await enter(userId, UserSessionState.IDLE)
  },
  async [UserSessionState.REPLY_0](ctx, userId, message) {
    if (!('text' in message)) {
      await ctx.reply(`Bad message ID.`)
      await enter(userId, UserSessionState.IDLE)
      return
    }
    const msgId = parseInt(message.text)
    const hole = await HoleSession.findOne({ msgId })
    if (!hole) {
      await ctx.reply(`Hole does not exist, or is locked.`)
      await enter(userId, UserSessionState.IDLE)
      return
    }
    await ctx.reply(`All right, then write your reply:`)
    await UserSession.updateOne(
      { userId },
      {
        $set: {
          state: UserSessionState.REPLY_1,
          replyMsgId: msgId,
          replyTarget: 0
        }
      }
    )
  },
  async [UserSessionState.REPLY_1](ctx, userId, message, session) {
    const { replyMsgId } = session
    if (!replyMsgId) {
      await ctx.reply(`How can you reach here?`)
      await enter(userId, UserSessionState.IDLE)
      return
    }
    let hole = await HoleSession.findOne({ msgId: replyMsgId })
    if (hole && !hole.participants.includes(userId)) {
      const resp = await HoleSession.findOneAndUpdate(
        { msgId: replyMsgId },
        { $addToSet: { participants: userId } },
        { returnDocument: 'after' }
      )
      hole = resp.value
    }
    if (!hole) {
      await ctx.reply(`Hole does not exist, or is locked.`)
      await enter(userId, UserSessionState.IDLE)
      return
    }
    const tid = hole.participants.indexOf(userId)
    const reply_to_message_id = session.replyTarget || replyMsgId
    try {
      let promise: Promise<Message>
      if ('forward_from' in message) {
        throw new Error('You cannot reply others without your own idea.')
      } else if ('text' in message) {
        promise = ctx.telegram.sendMessage(discussionId, message.text, {
          reply_to_message_id,
          entities: message.entities,
          reply_markup: makeReplyInlineKeyboard(tid)
        })
      } else if ('sticker' in message) {
        promise = ctx.telegram.sendSticker(
          discussionId,
          message.sticker.file_id,
          {
            reply_to_message_id,
            reply_markup: makeReplyInlineKeyboard(tid)
          }
        )
      } else if ('photo' in message) {
        promise = ctx.telegram.sendPhoto(
          discussionId,
          message.photo[0].file_id,
          {
            reply_to_message_id,
            reply_markup: makeReplyInlineKeyboard(tid),
            caption: message.caption,
            caption_entities: message.caption_entities
          }
        )
      } else if ('video' in message) {
        promise = ctx.telegram.sendVideo(discussionId, message.video.file_id, {
          reply_to_message_id,
          reply_markup: makeReplyInlineKeyboard(tid),
          caption: message.caption,
          caption_entities: message.caption_entities
        })
      } else if ('document' in message) {
        promise = ctx.telegram.sendDocument(
          discussionId,
          message.document.file_id,
          {
            reply_to_message_id,
            reply_markup: makeReplyInlineKeyboard(tid),
            caption: message.caption,
            caption_entities: message.caption_entities
          }
        )
      } else {
        throw new Error('Unsupported message type')
      }
      const msg = await promise
      await updateReplyInlineKeyboard(ctx, replyMsgId, msg.message_id, tid)
      await ctx.reply(
        `Well done.\n\nGoto the hole: https://t.me/${channelName}/${hole.channelMsgId}`,
        { reply_to_message_id: message.message_id }
      )
    } catch (err) {
      await ctx.reply(`${err}`)
    }
    await enter(userId, UserSessionState.IDLE)
  }
}

export async function handlePrivateMessage(
  ctx: Context,
  userId: number,
  message: Message
) {
  try {
    debug(message)
    const session = await UserSession.findOne({ userId })
    if (!session) return ctx.reply('Please run /start command first')
    const handler = UserStatefulHandlers[session.state]
    if (!handler) return ctx.reply('Operation not supported')
    await handler(ctx, userId, message, session)
  } catch (e) {
    warn(e)
  }
}
