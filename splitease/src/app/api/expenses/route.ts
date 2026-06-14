import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { ExpenseSchema, parseBody } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

// GET group expenses
export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const db = await getDb();
      const expenses = await db.all(
        "SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC",
        [session.groupId]
      );
      return NextResponse.json(expenses);
    })
  )
);

// POST add expense (Open to all authenticated members of the group)
export const POST = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      const json = await req.json();
      const parsed = parseBody(ExpenseSchema, json);
      const { payer, amount, description, category, split_among, split_type, split_values } = parsed;

      const splits = Array.isArray(split_among)
        ? split_among
        : split_among.split(",").map((s) => s.trim());

      if (splits.length === 0) {
        throw new ValidationError("Split among list cannot be empty.");
      }

      // Split validation
      if (split_type !== "equal") {
        if (!split_values) {
          throw new ValidationError("Split values are required for custom splits.");
        }

        const values = typeof split_values === "string" ? JSON.parse(split_values) : split_values;
        const numericValues = Object.values(values).map((v) => Number(v));

        if (numericValues.some(isNaN)) {
          throw new ValidationError("Split values must be numeric.");
        }

        if (split_type === "percentage") {
          const sum = numericValues.reduce((sum, v) => sum + v, 0);
          if (Math.abs(sum - 100) > 0.01) {
            throw new ValidationError("Percentage split values must sum to 100%.");
          }
        } else if (split_type === "fixed") {
          const sum = numericValues.reduce((sum, v) => sum + v, 0);
          if (Math.abs(sum - amount) > 0.01) {
            throw new ValidationError("Fixed split amounts must sum to the total expense amount.");
          }
        }
      }

      const db = await getDb();
      const splitAmongStr = splits.join(", ");
      const splitValuesStr = split_values ? JSON.stringify(split_values) : null;

      const { expenseId, budgetAlert } = await runTransaction(db, async (txDb) => {
        // Insert the expense
        const result = await txDb.run(
          `INSERT INTO expenses (group_id, payer, amount, description, category, split_among, split_type, split_values) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [session.groupId, payer, amount, description, category, splitAmongStr, split_type, splitValuesStr]
        );

        const newExpenseId = result.lastID;
        if (!newExpenseId) {
          throw new Error("Failed to insert expense.");
        }

        // Log the activity
        await logActivity(txDb, session.groupId, session.userName, "expense_created", "expense", newExpenseId, {
          description,
          amount,
          payer,
        });

        // Check budget threshold alerts
        const group = await txDb.get("SELECT budget FROM groups WHERE id = ?", [session.groupId]);
        let alertObj = null;

        if (group && group.budget > 0) {
          const sumResult = await txDb.get("SELECT SUM(amount) as total FROM expenses WHERE group_id = ?", [
            session.groupId,
          ]);
          const totalExpenses = sumResult?.total || 0;
          const budgetPercentage = (totalExpenses / group.budget) * 100;

          // Get highest triggered active alert
          const triggeredAlert = await txDb.get(
            `SELECT threshold_percentage FROM budget_alerts 
             WHERE group_id = ? AND is_active = 1 AND threshold_percentage <= ?
             ORDER BY threshold_percentage DESC LIMIT 1`,
            [session.groupId, budgetPercentage]
          );

          if (triggeredAlert) {
            alertObj = {
              percentage: triggeredAlert.threshold_percentage,
              currentUsage: Number(budgetPercentage.toFixed(2)),
              budget: group.budget,
              spent: totalExpenses,
            };
          }
        }

        return { expenseId: newExpenseId, budgetAlert: alertObj };
      });

      return NextResponse.json(
        {
          message: "Expense added successfully!",
          expenseId,
          budgetAlert,
        },
        { status: 201 }
      );
    })
  )
);
