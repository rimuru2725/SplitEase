import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { apiHandler, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { JoinGroupSchema, parseBody } from "@/lib/validation";
import { AuthenticationError, AppError } from "@/lib/errors";

export const POST = apiHandler(
  withRateLimit(RATE_LIMITS.auth, async (req: Request) => {
    const json = await req.json();
    const { name, password, userName } = parseBody(JoinGroupSchema, json);

    const db = await getDb();

    // Fetch the group
    const group = await db.get(
      "SELECT id, name, password, creator_name FROM groups WHERE name = ?",
      [name]
    );
    if (!group) {
      throw new AppError("Invalid group name or password.", 404, "NOT_FOUND");
    }

    // Verify password hash
    const isPasswordValid = await comparePassword(password, group.password);
    if (!isPasswordValid) {
      throw new AuthenticationError("Invalid group name or password.");
    }

    // Check if user already exists in this group and insert if not, atomically
    const { isNewUser } = await runTransaction(db, async (txDb) => {
      const existingUser = await txDb.get(
        "SELECT id FROM users WHERE name = ? AND group_id = ?",
        [userName, group.id]
      );

      let isNew = false;
      if (!existingUser) {
        await txDb.run("INSERT INTO users (name, group_id) VALUES (?, ?)", [userName, group.id]);
        isNew = true;

        // Log activity for the new member joining
        await logActivity(txDb, group.id, userName, "member_joined", "member", null, {
          member_name: userName,
        });
      }

      return { isNewUser: isNew };
    });

    const isCreator = userName === group.creator_name;

    // Sign a secure JWT session token
    const token = signToken({
      groupId: group.id,
      groupName: group.name,
      userName,
      isCreator,
    });

    return NextResponse.json({
      message: !isNewUser ? "Welcome back to the group!" : "Group joined successfully!",
      token,
      groupId: group.id,
      groupName: group.name,
      userName,
      isCreator,
      creatorName: group.creator_name,
    });
  })
);
