import { NextResponse } from "next/server";
import { getAuth, type UserSession } from "./auth";
import { AppError, AuthenticationError, RateLimitError } from "./errors";
import { checkRateLimit, getClientIp, type RATE_LIMITS } from "./rate-limit";
import type { Database } from "sqlite";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Handler that receives a verified auth session. */
export type AuthenticatedHandler = (
  req: Request,
  session: UserSession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: any
) => Promise<Response>;

/** Standard route handler. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteHandler = (req: Request, context?: any) => Promise<Response>;

// ═══════════════════════════════════════════════════════════════
// Middleware Wrappers
// ═══════════════════════════════════════════════════════════════

/**
 * Wraps a handler to require JWT authentication.
 * Automatically extracts the session and passes it to the handler.
 * Returns 401 if no valid token is found.
 */
export function withAuth(handler: AuthenticatedHandler): RouteHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: Request, context?: any) => {
    const session = getAuth(req);
    if (!session) {
      throw new AuthenticationError();
    }
    return handler(req, session, context);
  };
}

/**
 * Wraps a handler with rate limiting.
 * Returns 429 if the client exceeds the configured limit.
 */
export function withRateLimit(
  config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS],
  handler: RouteHandler
): RouteHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: Request, context?: any) => {
    const ip = getClientIp(req);
    const result = checkRateLimit(config, ip);

    if (!result.allowed) {
      throw new RateLimitError(result.retryAfterSeconds);
    }

    return handler(req, context);
  };
}

/**
 * Top-level error handler wrapper.
 * Catches all errors thrown by route handlers and returns structured JSON.
 * This should be the outermost wrapper around any route handler.
 */
export function apiHandler(handler: RouteHandler): RouteHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: Request, context?: any) => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Handle known application errors
      if (error instanceof AppError) {
        const body: Record<string, unknown> = {
          error: error.message,
          code: error.code,
        };

        if (error.details) {
          body.details = error.details;
        }

        const headers: Record<string, string> = {};
        if (error instanceof RateLimitError) {
          headers["Retry-After"] = String(error.retryAfterSeconds);
        }

        return NextResponse.json(body, {
          status: error.statusCode,
          headers,
        });
      }

      // Unknown errors — log and return generic 500
      console.error(`[API Error] ${req.method} ${new URL(req.url).pathname}:`, error);
      return NextResponse.json(
        { error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Activity Logger
// ═══════════════════════════════════════════════════════════════

export type ActivityAction =
  | "expense_created"
  | "expense_updated"
  | "expense_deleted"
  | "payment_created"
  | "payment_confirmed"
  | "payment_rejected"
  | "payment_cancelled"
  | "budget_updated"
  | "member_joined"
  | "member_removed"
  | "group_deleted";

export type EntityType = "expense" | "settlement" | "budget" | "member" | "group";

/**
 * Log an activity to the audit trail.
 * Non-blocking — errors are caught and logged but don't fail the request.
 */
export async function logActivity(
  db: Database,
  groupId: number,
  userName: string,
  action: ActivityAction,
  entityType: EntityType,
  entityId?: number | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.run(
      `INSERT INTO activity_log (group_id, user_name, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        groupId,
        userName,
        action,
        entityType,
        entityId ?? null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    // Activity logging should never break the main request
    console.error("[Activity Log Error]", error);
  }
}
