import 'server-only'

import { prisma } from '@/server/lib/prisma'
import type { Role } from '@/shared/model/domain'

export const membershipRepository = {
  find(userId: string, workspaceId: string) {
    return prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    })
  },

  /** Workspaces this user can see, for the workspace switcher. */
  async listForUser(userId: string): Promise<Array<{ id: string; name: string; role: Role }>> {
    const rows = await prisma.membership.findMany({
      where: { userId },
      select: { role: true, workspace: { select: { id: true, name: true } } },
      orderBy: { workspace: { name: 'asc' } },
    })
    return rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.role as Role }))
  },
}
