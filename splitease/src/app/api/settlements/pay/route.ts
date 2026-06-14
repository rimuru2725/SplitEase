import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity, type ActivityAction } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { SettlementActionSchema, parseBody } from "@/lib/validation";
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";

export const POST = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      const json = await req.json();
      const parsed = parseBody(SettlementActionSchema, json);
      const db = await getDb();

      // Action 1: Create a payment record
      if (parsed.action === "create") {
        const { from, to, amount } = parsed;

        // Check if both users belong to this group
        const usersInGroup = await db.all("SELECT name FROM users WHERE group_id = ?", [session.groupId]);
        const userNames = usersInGroup.map((u) => u.name);
        if (!userNames.includes(from) || !userNames.includes(to)) {
          throw new ValidationError("Users must belong to the active group.");
        }

        const isReceiver = session.userName === to;
        const status = isReceiver ? "settled" : "paid";

        const message = await runTransaction(db, async (txDb) => {
          const result = await txDb.run(
            `INSERT INTO settlements (group_id, from_user, to_user, amount, status) 
             VALUES (?, ?, ?, ?, ?)`,
            [session.groupId, from, to, amount, status]
          );

          const paymentId = result.lastID;
          if (!paymentId) {
            throw new Error("Failed to record settlement payment.");
          }

          // Log activity
          await logActivity(txDb, session.groupId, session.userName, "payment_created", "settlement", paymentId, {
            from,
            to,
            amount,
            status,
          });

          if (isReceiver) {
            await logActivity(txDb, session.groupId, session.userName, "payment_confirmed", "settlement", paymentId, {
              from,
              to,
              amount,
            });
            return "Payment recorded and settled!";
          } else {
            return "Payment marked as paid! Awaiting recipient confirmation.";
          }
        });

        return NextResponse.json({ message });
      }

      // Action 2: Confirm a pending payment
      if (parsed.action === "confirm") {
        const { paymentId } = parsed;

        const payment = await db.get("SELECT * FROM settlements WHERE id = ?", [paymentId]);
        if (!payment) {
          throw new NotFoundError("Payment record");
        }

        if (payment.group_id !== session.groupId) {
          throw new ForbiddenError("Unauthorized access to this payment.");
        }

        // Only the recipient (to_user) can confirm receipt
        if (session.userName !== payment.to_user) {
          throw new ForbiddenError("Only the recipient can confirm receipt of this payment.");
        }

        await runTransaction(db, async (txDb) => {
          await txDb.run(
            "UPDATE settlements SET status = 'settled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [paymentId]
          );

          // Log activity
          await logActivity(txDb, session.groupId, session.userName, "payment_confirmed", "settlement", paymentId, {
            from: payment.from_user,
            to: payment.to_user,
            amount: payment.amount,
          });
        });

        return NextResponse.json({ message: "Payment receipt confirmed!" });
      }

      // Action 3: Reject or Cancel a payment record
      if (parsed.action === "reject" || parsed.action === "cancel") {
        const { paymentId, action } = parsed;

        const payment = await db.get("SELECT * FROM settlements WHERE id = ?", [paymentId]);
        if (!payment) {
          throw new NotFoundError("Payment record");
        }

        if (payment.group_id !== session.groupId) {
          throw new ForbiddenError("Unauthorized access to this payment.");
        }

        // Check permission
        if (action === "reject" && session.userName !== payment.to_user) {
          throw new ForbiddenError("Only the recipient can reject this payment.");
        }
        if (action === "cancel" && session.userName !== payment.from_user) {
          throw new ForbiddenError("Only the sender can cancel this pending payment.");
        }

        const logAction: ActivityAction = action === "reject" ? "payment_rejected" : "payment_cancelled";

        await runTransaction(db, async (txDb) => {
          // Remove the incorrect/rejected record from DB
          await txDb.run("DELETE FROM settlements WHERE id = ?", [paymentId]);

          // Log activity
          await logActivity(txDb, session.groupId, session.userName, logAction, "settlement", paymentId, {
            from: payment.from_user,
            to: payment.to_user,
            amount: payment.amount,
          });
        });

        return NextResponse.json({
          message: action === "reject" ? "Payment rejected and deleted." : "Payment cancelled.",
        });
      }

      throw new ValidationError("Invalid action.");
    })
  )
);
