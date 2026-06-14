import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const { searchParams } = new URL(req.url);
      const limitParam = searchParams.get("limit");
      const offsetParam = searchParams.get("offset");

      const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 100) : 50;
      const offset = offsetParam ? Math.max(Number(offsetParam), 0) : 0;

      const db = await getDb();

      const logs = await db.all(
        `SELECT id, user_name, action, entity_type, entity_id, details, created_at 
         FROM activity_log 
         WHERE group_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [session.groupId, limit, offset]
      );

      // Parse JSON in details field for each row
      const formattedLogs = logs.map((log) => {
        let details = null;
        if (log.details) {
          try {
            details = JSON.parse(log.details);
          } catch (e) {
            console.error("Failed to parse log details:", e);
          }
        }
        return {
          ...log,
          details,
        };
      });

      return NextResponse.json({
        logs: formattedLogs,
        limit,
        offset,
      });
    })
  )
);
