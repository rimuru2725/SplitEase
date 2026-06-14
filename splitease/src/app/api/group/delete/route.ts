import { NextResponse } from "next/server";
import { getDb, runTransaction } from "@/lib/db";
import { apiHandler, withAuth, withRateLimit, logActivity } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { DeleteGroupSchema, parseBody } from "@/lib/validation";
import { ForbiddenError, ValidationError, AuthenticationError } from "@/lib/errors";
import { comparePassword } from "@/lib/auth";

export const POST = apiHandler(
  withRateLimit(
    RATE_LIMITS.write,
    withAuth(async (req: Request, session) => {
      // Permission check: Only group creator can delete the group
      if (!session.isCreator) {
        throw new ForbiddenError("Only the group creator can delete this group.");
      }

      const json = await req.json();
      const { password } = parseBody(DeleteGroupSchema, json);

      const db = await getDb();

      // Fetch group details to check password
      const group = await db.get("SELECT password FROM groups WHERE id = ?", [session.groupId]);
      if (!group) {
        throw new ValidationError("Group not found.");
      }

      // Verify creator password
      const isPasswordValid = await comparePassword(password, group.password);
      if (!isPasswordValid) {
        throw new AuthenticationError("Incorrect password. Group deletion cancelled.");
      }

      // Delete the group atomically (foreign keys ON and ON DELETE CASCADE will wipe child tables)
      await runTransaction(db, async (txDb) => {
        // Log activity before deleting (even though log gets deleted, it is good practice or can be outputted to server console)
        console.log(`[Group Delete] Group '${session.groupName}' (ID: ${session.groupId}) is being deleted by creator '${session.userName}'`);
        
        await txDb.run("DELETE FROM groups WHERE id = ?", [session.groupId]);
      });

      return NextResponse.json({
        message: `Group '${session.groupName}' and all its associated data have been permanently deleted.`,
      });
    })
  )
);
