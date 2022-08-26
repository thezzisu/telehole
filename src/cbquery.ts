export interface CbQueryNotify {
  type: 'notify'
  text: string
}

export interface CbQueryReply {
  type: 'reply'
  replyMsgId: number
  replyTarget: number
}

export type CbQueryData = CbQueryNotify | CbQueryReply

export function encodeCbQuery(data: CbQueryData) {
  return JSON.stringify(data)
}

export function decodeCbQuery(data: string): CbQueryData {
  return JSON.parse(data)
}
