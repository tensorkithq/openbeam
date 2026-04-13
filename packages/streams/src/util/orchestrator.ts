import type { Subscription } from "rxjs"

/** Collects subscriptions and teardown functions for bulk cleanup. */
export class StreamOrchestrator {
  private subscriptions: Subscription[] = []
  private teardowns: Array<() => void> = []

  add(subscription: Subscription): this {
    this.subscriptions.push(subscription)
    return this
  }

  addTeardown(fn: () => void): this {
    this.teardowns.push(fn)
    return this
  }

  destroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe())
    this.teardowns.forEach((fn) => fn())
    this.subscriptions = []
    this.teardowns = []
  }
}
