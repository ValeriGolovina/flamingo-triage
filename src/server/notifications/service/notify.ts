import 'server-only'

/**
 * The unreliable dependency from R3. It sleeps about a second and fails on
 * roughly one call in five, and making it reliable is not allowed — so
 * everything around it is built to survive that instead.
 *
 * Nothing here is configurable on purpose: a knob that turns the failures off
 * would quietly become the way the demo is run, and the interesting behaviour
 * would never be exercised.
 */
const FAILURE_RATE = 0.2
const LATENCY_MS = 1_000

export type NotificationPayload = {
  itemId: string
  workspaceId: string
}

export async function notify(payload: NotificationPayload): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS))

  if (Math.random() < FAILURE_RATE) {
    throw new Error(`notify() failed for item ${payload.itemId}`)
  }
}
