/** Duck-typed interface for any socket with pub/sub .on() semantics. */
export interface SocketLike {
  on(
    type: string,
    handler: (type: string, data: unknown) => void,
  ): () => void
}

/** Extended interface for sockets that can also send messages. */
export interface SendableSocketLike extends SocketLike {
  send(type: string, data?: Record<string, unknown>): void
}
