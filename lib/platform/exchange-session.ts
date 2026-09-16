import { readExchangeSaved } from "./exchange-saved";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import {
  exchangeEditorContext,
  listExchangeListings,
  readExchangeListing
} from "./exchange-listings";

async function token() {
  if (process.env.NODE_ENV !== "production") return undefined;
  return (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value;
}
export async function exchangeContextPage() {
  return exchangeEditorContext(prisma, await token());
}
export async function exchangeListingPage(id: string, management = false) {
  return readExchangeListing(prisma, await token(), id, management);
}
export async function exchangeListPage(
  query: Parameters<typeof listExchangeListings>[2]
) {
  return listExchangeListings(prisma, await token(), query);
}

export async function exchangeSavedPage(
  query: Parameters<typeof readExchangeSaved>[2]
) {
  return readExchangeSaved(prisma, await token(), query);
}
