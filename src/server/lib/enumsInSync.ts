import 'server-only'

import type { ItemStatus as DbItemStatus, Role as DbRole } from '@/generated/prisma/enums'
import type { ItemStatus, Role } from '@/shared/model/domain'

/**
 * `src/shared` declares its own enums so client code never pulls in the Prisma
 * client. This file is the price of that: a compile-time assertion, in both
 * directions, that the two definitions still describe the same value set.
 *
 * Adding a status to the schema without adding it to the shared enum (or the
 * reverse) fails the build here rather than at runtime, in one branch, later.
 */
type Extends<A extends B, B> = A

/* These types exist to be checked, not used — an unused-vars warning is the
   expected shape of a compile-time assertion. */
/* eslint-disable @typescript-eslint/no-unused-vars */

type _RoleToDb = Extends<`${Role}`, DbRole>
type _DbToRole = Extends<DbRole, `${Role}`>
type _StatusToDb = Extends<`${ItemStatus}`, DbItemStatus>
type _DbToStatus = Extends<DbItemStatus, `${ItemStatus}`>
/* eslint-enable @typescript-eslint/no-unused-vars */

export {}
