import { Prisma } from "@prisma/client";
/** These source columns are UTC timestamp-without-zone. Bind UTC text explicitly;
 * casting a driver's timestamptz Date would first apply the database session zone. */
export function metricUtc(value: Date | string) {
  return Prisma.sql`${typeof value === "string" ? value : value.toISOString()}::timestamp`;
}
