import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";
import { apiHandler, withRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { CreateGroupSchema, parseBody } from "@/lib/validation";
import { ConflictError } from "@/lib/errors";

export const POST = apiHandler(
  withRateLimit(RATE_LIMITS.auth, async (req: Request) => {
    const json = await req.json();
    const { name, password, creatorName, budget } = parseBody(CreateGroupSchema, json);

    const db = await getDb();

    // Check if group already exists (read query, before transaction to fail fast)
    const existingGroup = await db.get("SELECT id FROM groups WHERE name = ?", [name]);
    if (existingGroup) {
      throw new ConflictError("Group name already exists. Please choose another name.");
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create the group, creator, and default alerts in a single transaction
    const { groupId, token } = await runTransaction(db, async (txDb) => {
      const result = await txDb.run(
        "INSERT INTO groups (name, password, creator_name, budget) VALUES (?, ?, ?, ?)",
        [name, hashedPassword, creatorName, budget]
      );

      const newGroupId = result.lastID;
      if (!newGroupId) {
        throw new Error("Failed to insert group.");
      }

      // Add creator as the first user
      await txDb.run("INSERT INTO users (name, group_id) VALUES (?, ?)", [creatorName, newGroupId]);

      // Set default budget alerts (75% and 90%)
      await txDb.run(
        "INSERT INTO budget_alerts (group_id, threshold_percentage) VALUES (?, ?), (?, ?)",
        [newGroupId, 75, newGroupId, 90]
      );

      // Sign token inside or outside, but we need the data
      const token = signToken({
        groupId: newGroupId,
        groupName: name,
        userName: creatorName,
        isCreator: true,
      });

      return { groupId: newGroupId, token };
    });

    return NextResponse.json(
      {
        message: "Group created successfully!",
        token,
        groupId,
        groupName: name,
        userName: creatorName,
        isCreator: true,
      },
      { status: 201 }
    );
  })
);
