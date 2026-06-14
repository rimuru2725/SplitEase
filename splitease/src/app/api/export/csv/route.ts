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

      // Get group info for filename
      const group = await db.get("SELECT name FROM groups WHERE id = ?", [session.groupId]);
      if (!group) {
        throw new NotFoundError("Group");
      }

      const groupName = group.name.replace(/[^a-zA-Z0-9]/g, "_");

      // Fetch expenses
      const expenses = await db.all(
        "SELECT description, amount, payer, split_among, split_type, created_at FROM expenses WHERE group_id = ? ORDER BY created_at DESC",
        [session.groupId]
      );

      // Simple custom CSV formatter to avoid library installation issues
      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = ["Description", "Amount", "Paid By", "Split Among", "Split Type", "Date"];
      const csvRows = [headers.join(",")];

      expenses.forEach((e) => {
        const row = [
          escapeCSV(e.description),
          escapeCSV(Number(e.amount).toFixed(2)),
          escapeCSV(e.payer),
          escapeCSV(e.split_among),
          escapeCSV(e.split_type),
          escapeCSV(new Date(e.created_at).toLocaleDateString()),
        ];
        csvRows.push(row.join(","));
      });

      const csvContent = csvRows.join("\n");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="expenses-${groupName}.csv"`,
        },
      });
    })
  )
);
