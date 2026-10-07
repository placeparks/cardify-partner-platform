import { after } from "next/server"

// Only the request which actually created the cart starts an immediate run.
// Replays, polling and rejected requests must not fan out more workers.
export function scheduleCartValidation(cart: { id: string; status: string }, proposedId: string) {
  if (cart.id !== proposedId || cart.status !== "validating") return
  // Cart routes allow 300 seconds. Leave time for the response/runtime and
  // retain the worker's additional 20-second buffer before claiming a job.
  const deadline = Date.now() + 270000
  try {
    after(async () => {
      try {
        const { validateQueuedArtwork } = await import("@/lib/ingest-artwork")
        await validateQueuedArtwork(deadline)
      } catch {
        // Jobs remain durably queued/leased; cron recovers failed invocations.
        // Do not log customer image URLs or their signed storage credentials.
        console.error("Immediate artwork validation interrupted; scheduled validation will recover remaining jobs.")
      }
    })
  } catch {
    // A scheduling failure must not turn a committed cart into an HTTP error.
    console.error("Immediate artwork validation could not be scheduled; scheduled validation remains available.")
  }
}
