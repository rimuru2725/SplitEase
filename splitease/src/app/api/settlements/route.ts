import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const GET = apiHandler(
  withRateLimit(
    RATE_LIMITS.read,
    withAuth(async (req: Request, session) => {
      const db = await getDb();

      // Fetch all expenses
      const expenses = await db.all(
        "SELECT amount, payer, split_among, split_type, split_values FROM expenses WHERE group_id = ?",
        [session.groupId]
      );

      // Fetch all recorded payments (settlements that are 'paid' or 'settled')
      const payments = await db.all(
        "SELECT id, from_user, to_user, amount, status, created_at, updated_at FROM settlements WHERE group_id = ?",
        [session.groupId]
      );

      // Get all users in the group to initialize balances
      const users = await db.all("SELECT name FROM users WHERE group_id = ?", [session.groupId]);
      const balances: Record<string, number> = {};
      users.forEach((u) => {
        balances[u.name] = 0;
      });

      // 1. Calculate balances based on expenses
      (expenses as any[]).forEach((expense) => {
        const payer = expense.payer;
        const amount = Number(expense.amount);
        const splitType = expense.split_type || "equal";
        const splitAmong: string[] = expense.split_among
          ? (expense.split_among as string).split(",").map((s) => s.trim())
          : [];

        if (splitAmong.length === 0) return;

        // Ensure keys exist in balances
        if (balances[payer] === undefined) balances[payer] = 0;
        splitAmong.forEach((person: string) => {
          if (balances[person] === undefined) balances[person] = 0;
        });

        // Add full paid amount to payer's credit balance
        balances[payer] += amount;

        // Deduct shares
        let splitValues: Record<string, number> = {};
        try {
          if (expense.split_values) {
            splitValues = JSON.parse(expense.split_values);
          }
        } catch (e) {
          console.error("Error parsing split values:", e);
        }

        if (splitType === "equal") {
          const share = amount / splitAmong.length;
          splitAmong.forEach((person: string) => {
            balances[person] -= share;
          });
        } else if (splitType === "percentage") {
          splitAmong.forEach((person: string) => {
            const pct = splitValues[person] || 0;
            balances[person] -= (amount * pct) / 100;
          });
        } else if (splitType === "fixed") {
          splitAmong.forEach((person: string) => {
            const val = splitValues[person] || 0;
            balances[person] -= val;
          });
        } else if (splitType === "shares") {
          const totalShares = Object.values(splitValues).reduce((sum, s) => sum + (Number(s) || 0), 0);
          if (totalShares > 0) {
            splitAmong.forEach((person: string) => {
              const sh = splitValues[person] || 0;
              balances[person] -= (amount * sh) / totalShares;
            });
          }
        }
      });

      // 2. Adjust balances based on recorded payment transactions
      // If user A paid B $10, then A is credited +$10 and B is debited -$10
      payments.forEach((payment) => {
        // We process payments that are active (marked as paid or settled)
        if (payment.status === "paid" || payment.status === "settled") {
          const from = payment.from_user;
          const to = payment.to_user;
          const amt = Number(payment.amount);

          if (balances[from] === undefined) balances[from] = 0;
          if (balances[to] === undefined) balances[to] = 0;

          balances[from] += amt; // paid debt, increases balance
          balances[to] -= amt;   // received money, decreases credit balance
        }
      });

      // 3. Separate creditors and debtors
      const creditors: { name: string; amount: number }[] = [];
      const debtors: { name: string; amount: number }[] = [];

      Object.entries(balances).forEach(([name, bal]) => {
        if (bal > 0.01) {
          creditors.push({ name, amount: bal });
        } else if (bal < -0.01) {
          debtors.push({ name, amount: -bal }); // Keep debt positive for calculations
        }
      });

      // Sort descending
      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => b.amount - a.amount);

      // 4. Calculate optimized settlements
      const settlements: { from: string; to: string; amount: string }[] = [];
      let i = 0; // index for debtors
      let j = 0; // index for creditors

      // Copy to avoid modifying values
      const creds = creditors.map((c) => ({ ...c }));
      const debts = debtors.map((d) => ({ ...d }));

      while (i < debts.length && j < creds.length) {
        const pay = Math.min(creds[j].amount, debts[i].amount);

        if (pay > 0.01) {
          settlements.push({
            from: debts[i].name,
            to: creds[j].name,
            amount: pay.toFixed(2),
          });
        }

        creds[j].amount -= pay;
        debts[i].amount -= pay;

        if (creds[j].amount < 0.01) j++;
        if (debts[i].amount < 0.01) i++;
      }

      // 5. Calculate individual balance details for the current user
      let totalOwes = 0;
      let totalOwed = 0;

      settlements.forEach((s) => {
        const amt = Number(s.amount);
        if (s.from === session.userName) {
          totalOwes += amt;
        }
        if (s.to === session.userName) {
          totalOwed += amt;
        }
      });

      const netBalance = totalOwed - totalOwes;

      return NextResponse.json({
        settlements,
        paymentHistory: payments,
        userBalances: {
          owes: Number(totalOwes.toFixed(2)),
          owed: Number(totalOwed.toFixed(2)),
          net: Number(netBalance.toFixed(2)),
        },
      });
    })
  )
);
