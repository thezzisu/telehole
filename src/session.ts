export enum SessionState {
  POST,
  PREPARE_REPLY,
  REPLY,
  EDIT,
  IDLE
}

export class UserSession {
  constructor(
    private storage: Storage<number, UserSession>,
    public chatId: number,
    public state: SessionState = SessionState.IDLE,
    public target: number = 0
  ) {}

  save() {
    return this.storage.put(this.chatId, this)
  }

  enter(state: SessionState) {
    this.state = state
    return this.save()
  }

  static async get(storage: Storage<number, UserSession>, chatId: number) {
    return (
      (await storage.get(chatId)) ??
      new UserSession(storage, chatId, SessionState.IDLE, 0)
    )
  }
}

export class HoleSession {
  constructor(
    private storage: Storage<number, HoleSession>,
    public msgId: number,
    public mapping: Record<number, number>
  ) {}

  save() {
    return this.storage.put(this.msgId, this)
  }

  static async get(storage: Storage<number, HoleSession>, msgId: number) {
    return (
      (await storage.get(msgId)) ??
      new HoleSession(storage, msgId, Object.create(null))
    )
  }

  static async getOrFail(storage: Storage<number, HoleSession>, msgId: number) {
    const session = await storage.get(msgId)
    if (!session) throw new Error(`Hole not found`)
    return session
  }
}

export abstract class Storage<K, V> {
  abstract get(key: K): Promise<V | null>
  abstract put(key: K, value: V): Promise<void>
}

export class MemoryStorage<K, V> extends Storage<K, V> {
  private sessions: Map<K, V> = new Map()
  async get(key: K): Promise<V | null> {
    return this.sessions.get(key) ?? null
  }
  async put(key: K, value: V): Promise<void> {
    this.sessions.set(key, value)
  }
}
