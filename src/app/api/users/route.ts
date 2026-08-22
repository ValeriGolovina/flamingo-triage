import { userRepository } from '@/server/auth/repository/userRepository'
import { toErrorResponse } from '@/server/lib/errors'

/**
 * The seeded users behind the sign-in dropdown. Public by design: the brief
 * asks for a user picker instead of real OAuth, so this list is the login
 * screen. It exposes names only — no credentials exist to leak.
 */
export async function GET() {
  try {
    return Response.json({ users: await userRepository.listAll() })
  } catch (error) {
    return toErrorResponse(error)
  }
}
