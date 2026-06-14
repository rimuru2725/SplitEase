import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { ExpenseSchema, parseBody } from "@/lib/validation";
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";

type Context = {
  params: Promise<{ id: string }>;
};

// PUT - Edit expense
export const PUT = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session, context: Context) => {
      const { id } = await context.params;
      const expenseId = Number(id);
      if (isNaN(expenseId)) {
        throw new ValidationError("Invalid expense ID.");
      }

      const db = await getDb();

      // Check if expense exists and belongs to the user's group
      const expense = await db.get("SELECT * FROM expenses WHERE id = ?", [expenseId]);
      if (!expense) {
        throw new NotFoundError("Expense");
      }

      if (expense.group_id !== session.groupId) {
        throw new ForbiddenError("Unauthorized to edit this expense.");
      }

      // Permission check: Only the payer or the group creator can edit
      const isPayer = session.userName === expense.payer;
      if (!isPayer && !session.isCreator) {
        throw new ForbiddenError("Only the payer or the group creator can edit this expense.");
      }

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

      const splitAmongStr = splits.join(", ");
      const splitValuesStr = split_values ? JSON.stringify(split_values) : null;

      const { budgetAlert } = await runTransaction(db, async (txDb) => {
        // Update expense
        await txDb.run(
          `UPDATE expenses 
           SET payer = ?, amount = ?, description = ?, category = ?, split_among = ?, split_type = ?, split_values = ?
           WHERE id = ?`,
          [payer, amount, description, category, splitAmongStr, split_type, splitValuesStr, expenseId]
        );

        // Log the activity
        await logActivity(txDb, session.groupId, session.userName, "expense_updated", "expense", expenseId, {
          description,
          amount,
          payer,
          previous_amount: expense.amount,
        });

        // Check budget alert
        const group = await txDb.get("SELECT budget FROM groups WHERE id = ?", [session.groupId]);
        let alertObj = null;

        if (group && group.budget > 0) {
          const sumResult = await txDb.get("SELECT SUM(amount) as total FROM expenses WHERE group_id = ?", [
            session.groupId,
          ]);
          const totalExpenses = sumResult?.total || 0;
          const budgetPercentage = (totalExpenses / group.budget) * 100;

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

        return { budgetAlert: alertObj };
      });

      return NextResponse.json({
        message: "Expense updated successfully!",
        budgetAlert,
      });
    })
  )
);

// DELETE - Delete expense
export const DELETE = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session, context: Context) => {
      const { id } = await context.params;
      const expenseId = Number(id);
      if (isNaN(expenseId)) {
        throw new ValidationError("Invalid expense ID.");
      }

      const db = await getDb();

      // Check if expense exists and belongs to the user's group
      const expense = await db.get("SELECT * FROM expenses WHERE id = ?", [expenseId]);
      if (!expense) {
        throw new NotFoundError("Expense");
      }

      if (expense.group_id !== session.groupId) {
        throw new ForbiddenError("Unauthorized to delete this expense.");
      }

      // Permission check: Only the payer or the group creator can delete
      const isPayer = session.userName === expense.payer;
      if (!isPayer && !session.isCreator) {
        throw new ForbiddenError("Only the payer or the group creator can delete this expense.");
      }

      await runTransaction(db, async (txDb) => {
        // Delete the expense
        await txDb.run("DELETE FROM expenses WHERE id = ?", [expenseId]);

        // Log the activity
        await logActivity(txDb, session.groupId, session.userName, "expense_deleted", "expense", expenseId, {
          description: expense.description,
          amount: expense.amount,
          payer: expense.payer,
        });
      });

      return NextResponse.json({ message: "Expense deleted successfully!" });
    })
  )
);
