import { MongoClient } from 'mongodb'
import { fatal, info } from './logger.js'

export enum UserSessionState {
  IDLE,
  POST,
  REPLY_0,
  REPLY_1
}

export interface IUserSession {
  userId: number
  chatId: number
  state: UserSessionState
  authorized?: boolean
  replyMsgId?: number
  replyTarget?: number
}

export interface IHoleSession {
  /** The message ID of the hole **in the discssion group** */
  msgId?: number
  /** The message ID of the hole **in the channel** */
  channelMsgId: number
  participants: number[]
}

const url = process.env.HOLE_MONGO_URL!
if (!url) fatal('HOLE_MONGO_URL is not set')
const dbName = process.env.HOLE_MONGO_DB!
if (!dbName) fatal('HOLE_MONGO_DB is not set')
const client = new MongoClient(url)
await client.connect()
export const db = client.db(dbName)
export const UserSession = db.collection<IUserSession>('user_sess')
export const HoleSession = db.collection<IHoleSession>('hole_sess')
await db.createIndex('user_sess', { userId: 1 }, { unique: true })
await db.createIndex('hole_sess', { msgId: 1 }, { unique: true, sparse: true })
await db.createIndex('hole_sess', { channelMsgId: 1 }, { unique: true })

info('Connected to MongoDB')
