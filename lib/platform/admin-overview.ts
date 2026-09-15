import { metricUtc } from "./metric-sql";
import type { PrismaClient } from "@prisma/client";
import { withAdmin } from "./admin-authority";
import { adminQueueCounts } from "./admin-queue";
import { defaultAdminFilters } from "./admin-types";
import {metricConfiguration} from "./platform-measurement";
import {metricDay,metricAddDays} from "./metric-time";
import {metricSources} from "./metric-sources";
import {Prisma} from "@prisma/client";

export function readAdminOverview(db: PrismaClient, token: unknown) {
  return withAdmin(db, token, async (tx, a) => {
    const checkedAt = new Date();
    let growth=null;
    if(a.capabilities.has("VIEW_PLATFORM_METRICS")){
      const config=await metricConfiguration(tx),from=metricAddDays(metricDay(checkedAt,config.zone),-6);
      const [counts]=await tx.$queryRaw<{existing:number;registrations:number;active:number}[]>(Prisma.sql`WITH RECURSIVE ${metricSources(config.version,checkedAt,new Date(checkedAt.getTime()-90*86400000))}
        SELECT (SELECT count(*)::int FROM population) AS existing,
        (SELECT count(*)::int FROM population WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${config.zone})::date>=${from}::date AND "createdAt"<=${metricUtc(checkedAt)}) AS registrations,
        (SELECT count(DISTINCT "userId")::int FROM activity WHERE day>=${from}::date) AS active`);
      growth={...counts,from,zone:config.zone,startedAt:config.startedAt.toISOString()};
    }
    return {
      navigation: a.navigation,
      checkedAt: checkedAt.toISOString(),
      growth,
      requests: a.canQueue
        ? await adminQueueCounts(tx, a, defaultAdminFilters, checkedAt)
        : null
    };
  });
}
export type AdminOverviewSnapshot = Awaited<
  ReturnType<typeof readAdminOverview>
>;
