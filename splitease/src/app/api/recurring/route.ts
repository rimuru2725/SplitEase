import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { RecurringExpenseSchema, parseBody } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

// GET - Retrieve all recurring expense templates for the group
export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const db = await getDb();
      const templates = await db.all(
        "SELECT * FROM recurring_expenses WHERE group_id = ? ORDER BY created_at DESC",
        [session.groupId]
      );
      return NextResponse.json(templates);
    })
  )
);

// POST - Create a new recurring expense template
export const POST = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      const json = await req.json();
      const parsed = parseBody(RecurringExpenseSchema, json);
      const {
        payer,
        amount,
        description,
        category,
        split_among,
        split_type,
        split_values,
        frequency,
        next_due_date,
      } = parsed;

      const splits = split_among.split(",").map((s) => s.trim());
      if (splits.length === 0 || !split_among) {
        throw new ValidationError("Split among list cannot be empty.");
      }

      // Split validation (similar to normal expenses)
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
            throw new ValidationError("Fixed split amounts must sum to the total template amount.");
          }
        }
      }

      const db = await getDb();
      const splitValuesStr = split_values ? JSON.stringify(split_values) : null;

      const templateId = await runTransaction(db, async (txDb) => {
        const result = await txDb.run(
          `INSERT INTO recurring_expenses (group_id, payer, amount, description, category, split_among, split_type, split_values, frequency, next_due_date, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            session.groupId,
            payer,
            amount,
            description,
            category,
            split_among,
            split_type,
            splitValuesStr,
            frequency,
            next_due_date,
            session.userName,
          ]
        );

        const newId = result.lastID;
        if (!newId) {
          throw new Error("Failed to insert recurring expense template.");
        }

        // Log the activity
        await logActivity(txDb, session.groupId, session.userName, "expense_created", "expense", newId, {
          description,
          amount,
          payer,
          type: "recurring_template",
          frequency,
        });

        return newId;
      });

      return NextResponse.json(
        {
          message: "Recurring expense template created successfully!",
          templateId,
        },
        { status: 201 }
      );
    })
  )
);
