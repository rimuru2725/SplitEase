import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { UpdateRecurringSchema, parseBody } from "@/lib/validation";
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";

type Context = {
  params: Promise<{ id: string }>;
};

// PUT - Update a recurring expense template
export const PUT = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session, context: Context) => {
      const { id } = await context.params;
      const templateId = Number(id);
      if (isNaN(templateId)) {
        throw new ValidationError("Invalid template ID.");
      }

      const db = await getDb();

      // Check if template exists and belongs to the user's group
      const template = await db.get("SELECT * FROM recurring_expenses WHERE id = ?", [templateId]);
      if (!template) {
        throw new NotFoundError("Recurring template");
      }

      if (template.group_id !== session.groupId) {
        throw new ForbiddenError("Unauthorized to manage this template.");
      }

      // Permission check: Only payer, group creator, or template creator can edit
      const isPayer = session.userName === template.payer;
      const isAuthor = session.userName === template.created_by;
      if (!isPayer && !session.isCreator && !isAuthor) {
        throw new ForbiddenError("Only the payer, group creator, or template creator can edit this template.");
      }

      const json = await req.json();
      const parsed = parseBody(UpdateRecurringSchema, json);

      // Perform validation on updated split values if relevant fields are changed
      const finalAmount = parsed.amount !== undefined ? parsed.amount : template.amount;
      const finalSplitType = parsed.split_type !== undefined ? parsed.split_type : template.split_type;
      const finalSplitAmong = parsed.split_among !== undefined ? parsed.split_among : template.split_among;
      const finalSplitValues = parsed.split_values !== undefined ? parsed.split_values : template.split_values;

      if (finalSplitType !== "equal") {
        if (!finalSplitValues) {
          throw new ValidationError("Split values are required for custom splits.");
        }
        const values = typeof finalSplitValues === "string" ? JSON.parse(finalSplitValues) : finalSplitValues;
        const numericValues = Object.values(values).map((v) => Number(v));

        if (numericValues.some(isNaN)) {
          throw new ValidationError("Split values must be numeric.");
        }

        if (finalSplitType === "percentage") {
          const sum = numericValues.reduce((sum, v) => sum + v, 0);
          if (Math.abs(sum - 100) > 0.01) {
            throw new ValidationError("Percentage split values must sum to 100%.");
          }
        } else if (finalSplitType === "fixed") {
          const sum = numericValues.reduce((sum, v) => sum + v, 0);
          if (Math.abs(sum - finalAmount) > 0.01) {
            throw new ValidationError("Fixed split amounts must sum to the total template amount.");
          }
        }
      }

      // Prepare updates
      const updates: string[] = [];
      const values: any[] = [];

      Object.entries(parsed).forEach(([key, val]) => {
        if (key === "split_values") {
          updates.push(`${key} = ?`);
          values.push(val ? JSON.stringify(val) : null);
        } else if (key === "is_active") {
          updates.push(`${key} = ?`);
          values.push(val ? 1 : 0);
        } else {
          updates.push(`${key} = ?`);
          values.push(val);
        }
      });

      if (updates.length > 0) {
        values.push(templateId);
        await runTransaction(db, async (txDb) => {
          await txDb.run(
            `UPDATE recurring_expenses SET ${updates.join(", ")} WHERE id = ?`,
            values
          );

          // Log the activity
          await logActivity(txDb, session.groupId, session.userName, "expense_updated", "expense", templateId, {
            description: parsed.description || template.description,
            amount: parsed.amount || template.amount,
            payer: parsed.payer || template.payer,
            type: "recurring_template",
          });
        });
      }

      return NextResponse.json({
        message: "Recurring expense template updated successfully!",
      });
    })
  )
);

// DELETE - Delete a recurring expense template
export const DELETE = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session, context: Context) => {
      const { id } = await context.params;
      const templateId = Number(id);
      if (isNaN(templateId)) {
        throw new ValidationError("Invalid template ID.");
      }

      const db = await getDb();

      // Check if template exists and belongs to the user's group
      const template = await db.get("SELECT * FROM recurring_expenses WHERE id = ?", [templateId]);
      if (!template) {
        throw new NotFoundError("Recurring template");
      }

      if (template.group_id !== session.groupId) {
        throw new ForbiddenError("Unauthorized to manage this template.");
      }

      // Permission check: Only payer, group creator, or template creator can delete
      const isPayer = session.userName === template.payer;
      const isAuthor = session.userName === template.created_by;
      if (!isPayer && !session.isCreator && !isAuthor) {
        throw new ForbiddenError("Only the payer, group creator, or template creator can delete this template.");
      }

      await runTransaction(db, async (txDb) => {
        await txDb.run("DELETE FROM recurring_expenses WHERE id = ?", [templateId]);

        // Log the activity
        await logActivity(txDb, session.groupId, session.userName, "expense_deleted", "expense", templateId, {
          description: template.description,
          amount: template.amount,
          payer: template.payer,
          type: "recurring_template",
        });
      });

      return NextResponse.json({
        message: "Recurring expense template deleted successfully!",
      });
    })
  )
);
