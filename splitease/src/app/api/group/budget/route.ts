import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { BudgetUpdateSchema, parseBody } from "@/lib/validation";
import { ForbiddenError } from "@/lib/errors";

export const PUT = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      if (!session.isCreator) {
        throw new ForbiddenError("Only the group creator can update the budget configuration.");
      }

      const json = await req.json();
      const { budget, alerts } = parseBody(BudgetUpdateSchema, json);

      const db = await getDb();

      await runTransaction(db, async (txDb) => {
        // Update budget in groups table
        await txDb.run("UPDATE groups SET budget = ? WHERE id = ?", [budget, session.groupId]);

        // Clear old alerts and insert new ones
        await txDb.run("DELETE FROM budget_alerts WHERE group_id = ?", [session.groupId]);

        if (alerts && alerts.length > 0) {
          for (const alert of alerts) {
            await txDb.run(
              "INSERT INTO budget_alerts (group_id, threshold_percentage, is_active) VALUES (?, ?, ?)",
              [session.groupId, alert.threshold_percentage, alert.is_active ? 1 : 0]
            );
          }
        }

        // Log activity
        await logActivity(txDb, session.groupId, session.userName, "budget_updated", "budget", null, {
          new_budget: budget,
          alerts_count: alerts ? alerts.length : 0,
        });
      });

      return NextResponse.json({ message: "Budget configuration updated successfully!" });
    })
  )
);
