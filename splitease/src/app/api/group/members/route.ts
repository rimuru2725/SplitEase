import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { RemoveMemberSchema, parseBody } from "@/lib/validation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const POST = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      const json = await req.json();
      const { userName } = parseBody(RemoveMemberSchema, json);

      const db = await getDb();

      // Check if user exists in the group
      const user = await db.get("SELECT id FROM users WHERE name = ? AND group_id = ?", [
        userName,
        session.groupId,
      ]);
      if (!user) {
        throw new NotFoundError("Member");
      }

      // Check permissions: Only group creator can remove others; users can remove themselves.
      const isSelfRemoval = session.userName === userName;
      if (!session.isCreator && !isSelfRemoval) {
        throw new ForbiddenError("Only the group creator can remove other members.");
      }

      // Group creator cannot remove themselves this way (they must delete the group instead)
      const group = await db.get("SELECT creator_name FROM groups WHERE id = ?", [session.groupId]);
      if (group && group.creator_name === userName) {
        throw new ValidationError("The group creator cannot be removed. You must delete the group instead.");
      }

      // Calculate the member's current balance to ensure it is exactly zero
      const expenses = await db.all(
        "SELECT amount, payer, split_among, split_type, split_values FROM expenses WHERE group_id = ?",
        [session.groupId]
      );

      const payments = await db.all(
        "SELECT from_user, to_user, amount, status FROM settlements WHERE group_id = ?",
        [session.groupId]
      );

      let balance = 0;

      // 1. Process expenses
      expenses.forEach((expense) => {
        const payer = expense.payer;
        const amount = Number(expense.amount);
        const splitType = expense.split_type || "equal";
        const splitAmong: string[] = expense.split_among
          ? expense.split_among.split(",").map((s: string) => s.trim())
          : [];

        if (!splitAmong.includes(userName) && payer !== userName) return;

        // If user is the payer, credit them
        if (payer === userName) {
          balance += amount;
        }

        // Deduct split share if they are in splitAmong
        if (splitAmong.includes(userName)) {
          let splitValues: Record<string, number> = {};
          try {
            if (expense.split_values) {
              splitValues = JSON.parse(expense.split_values);
            }
          } catch (e) {
            console.error("Error parsing split values:", e);
          }

          if (splitType === "equal") {
            balance -= amount / splitAmong.length;
          } else if (splitType === "percentage") {
            const pct = splitValues[userName] || 0;
            balance -= (amount * pct) / 100;
          } else if (splitType === "fixed") {
            const val = splitValues[userName] || 0;
            balance -= val;
          } else if (splitType === "shares") {
            const totalShares = Object.values(splitValues).reduce((sum, s) => sum + (Number(s) || 0), 0);
            if (totalShares > 0) {
              const sh = splitValues[userName] || 0;
              balance -= (amount * sh) / totalShares;
            }
          }
        }
      });

      // 2. Process settlements
      payments.forEach((payment) => {
        if (payment.status === "paid" || payment.status === "settled") {
          const amt = Number(payment.amount);
          if (payment.from_user === userName) {
            balance += amt; // Paid out debt -> reduces debt (increases balance)
          }
          if (payment.to_user === userName) {
            balance -= amt; // Received settlement -> reduces credit (decreases balance)
          }
        }
      });

      // If user's balance is non-zero, reject removal
      if (Math.abs(balance) > 0.01) {
        throw new ValidationError(
          `Cannot remove member '${userName}' because they have a non-zero balance ($${balance.toFixed(
            2
          )}). Please settle all debts before leaving or removing.`
        );
      }

      // Perform removal atomically
      await runTransaction(db, async (txDb) => {
        await txDb.run("DELETE FROM users WHERE name = ? AND group_id = ?", [
          userName,
          session.groupId,
        ]);

        await logActivity(txDb, session.groupId, session.userName, "member_removed", "member", null, {
          removed_member: userName,
        });
      });

      return NextResponse.json({
        message: isSelfRemoval
          ? "You have left the group successfully."
          : `Member '${userName}' has been removed successfully.`,
      });
    })
  )
);
