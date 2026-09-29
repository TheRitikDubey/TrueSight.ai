import { PrismaClient } from "@prisma/client";

// Lazy initialization lets dotenv load first and keeps the legacy API usable without a DB.
let client: PrismaClient | undefined;
export function database() {
  return (client ??= new PrismaClient());
}
