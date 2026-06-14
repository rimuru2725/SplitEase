import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { NotFoundError } from "@/lib/errors";

export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const db = await getDb();

      // Get group metadata
      const group = await db.get("SELECT id, name, creator_name, budget FROM groups WHERE id = ?", [
        session.groupId,
      ]);

      if (!group) {
        throw new NotFoundError("Group");
      }

      // Calculate total spent
      const expenseSummary = await db.get(
        "SELECT SUM(amount) as total FROM expenses WHERE group_id = ?",
        [session.groupId]
      );
      const spent = expenseSummary?.total || 0;
      const budget = group.budget || 0;
      const remaining = budget - spent;
      const percentage = budget > 0 ? (spent / budget) * 100 : 0;

      // Get budget alerts
      const alerts = await db.all(
        "SELECT id, threshold_percentage, is_active FROM budget_alerts WHERE group_id = ? ORDER BY threshold_percentage",
        [session.groupId]
      );

      return NextResponse.json({
        group: {
          id: group.id,
          name: group.name,
          creatorName: group.creator_name,
          budget: group.budget,
        },
        budgetStatus: {
          budget,
          spent,
          remaining,
          percentage: Number(percentage.toFixed(2)),
        },
        alerts,
      });
    })
  )
);
