import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const db = await getDb();
      const users = await db.all("SELECT id, name FROM users WHERE group_id = ? ORDER BY name ASC", [
        session.groupId,
      ]);
      return NextResponse.json(users);
    })
  )
);
