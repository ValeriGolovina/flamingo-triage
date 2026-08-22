import { z } from 'zod'

import { clearSession, getSession, setSession } from '@/server/auth/service/session'
import { userRepository } from '@/server/auth/repository/userRepository'
import { NotFoundError, toErrorResponse } from '@/server/lib/errors'
import { parseBody } from '@/server/lib/validate'
import { membershipRepository } from '@/server/workspace/repository/membershipRepository'

/** Who am I, and which workspaces can I see. */
/** One definition of the session payload, so GET and POST cannot drift apart. */
async function sessionState(user: { id: string; name: string }) {
  return { user, workspaces: await membershipRepository.listForUser(user.id) }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return Response.json({ user: null, workspaces: [] })

    const user = await userRepository.findById(session.userId)
    // A signed cookie for a user that no longer exists — after a reseed, for
    // instance. Treat it as signed out rather than 500 on the next query.
    if (!user) return Response.json({ user: null, workspaces: [] })

    return Response.json(await sessionState(user))
  } catch (error) {
    return toErrorResponse(error)
  }
}

/** Sign in as one of the seeded users. */
export async function POST(request: Request) {
  try {
    const { userId } = await parseBody(request, z.object({ userId: z.uuid() }))

    const user = await userRepository.findById(userId)
    if (!user) throw new NotFoundError()

    await setSession(user.id)
    return Response.json(await sessionState(user))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE() {
  try {
    await clearSession()
    return new Response(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
