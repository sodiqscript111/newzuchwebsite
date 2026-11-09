import { z } from "zod"

const BayseHealth = z.object({ status: z.literal("ok") })

export const bayseHealthCheck = async (bayseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${bayseUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return false
    return BayseHealth.safeParse(await response.json()).success
  } catch {
    return false
  }
}
