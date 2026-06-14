import { z } from "zod";
import { ValidationError } from "./errors";

// ═══════════════════════════════════════════════════════════════
// Auth Schemas
// ═══════════════════════════════════════════════════════════════

export const CreateGroupSchema = z.object({
  name: z
    .string({ error: "Group name is required." })
    .min(2, "Group name must be at least 2 characters.")
    .max(50, "Group name must be at most 50 characters.")
    .trim(),
  password: z
    .string({ error: "Password is required." })
    .min(4, "Password must be at least 4 characters."),
  creatorName: z
    .string({ error: "Creator name is required." })
    .min(1, "Creator name cannot be empty.")
    .max(30, "Creator name must be at most 30 characters.")
    .trim(),
  budget: z.coerce.number().min(0, "Budget cannot be negative.").default(0),
});

export const JoinGroupSchema = z.object({
  name: z
    .string({ error: "Group name is required." })
    .min(1, "Group name cannot be empty.")
    .trim(),
  password: z
    .string({ error: "Password is required." })
    .min(1, "Password cannot be empty."),
  userName: z
    .string({ error: "Username is required." })
    .min(1, "Username cannot be empty.")
    .max(30, "Username must be at most 30 characters.")
    .trim(),
});

// ═══════════════════════════════════════════════════════════════
// Expense Schemas
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = ["Food", "Travel", "Rent", "Utilities", "Shopping", "Entertainment", "Others"] as const;
const SPLIT_TYPES = ["equal", "percentage", "fixed", "shares"] as const;

export const ExpenseSchema = z.object({
  payer: z.string({ error: "Payer is required." }).min(1, "Payer cannot be empty.").trim(),
  amount: z.coerce
    .number({ error: "Amount is required." })
    .positive("Amount must be a positive number."),
  description: z
    .string({ error: "Description is required." })
    .min(1, "Description cannot be empty.")
    .max(200, "Description must be at most 200 characters.")
    .trim(),
  category: z.enum(CATEGORIES).default("Others"),
  split_among: z.union([
    z.string().min(1, "Split among cannot be empty."),
    z.array(z.string().min(1)).min(1, "At least one person must be selected."),
  ]),
  split_type: z.enum(SPLIT_TYPES).default("equal"),
  split_values: z
    .union([z.record(z.string(), z.coerce.number()), z.string(), z.null()])
    .optional()
    .default(null),
});

// ═══════════════════════════════════════════════════════════════
// Budget Schema
// ═══════════════════════════════════════════════════════════════

const BudgetAlertSchema = z.object({
  threshold_percentage: z.coerce
    .number()
    .int("Threshold must be a whole number.")
    .min(1, "Threshold must be at least 1%.")
    .max(100, "Threshold cannot exceed 100%."),
  is_active: z.boolean().default(true),
});

export const BudgetUpdateSchema = z.object({
  budget: z.coerce.number().min(0, "Budget cannot be negative."),
  alerts: z.array(BudgetAlertSchema).optional().default([]),
});

// ═══════════════════════════════════════════════════════════════
// Settlement Schemas
// ═══════════════════════════════════════════════════════════════

const CreatePaymentSchema = z.object({
  action: z.literal("create"),
  from: z.string().min(1, "Sender is required.").trim(),
  to: z.string().min(1, "Recipient is required.").trim(),
  amount: z.coerce.number().positive("Amount must be a positive number."),
});

const PaymentActionSchema = z.object({
  action: z.enum(["confirm", "reject", "cancel"]),
  paymentId: z.coerce.number().int().positive("Payment ID is required."),
});

export const SettlementActionSchema = z.discriminatedUnion("action", [
  CreatePaymentSchema,
  PaymentActionSchema.extend({ action: z.literal("confirm") }),
  PaymentActionSchema.extend({ action: z.literal("reject") }),
  PaymentActionSchema.extend({ action: z.literal("cancel") }),
]);

// ═══════════════════════════════════════════════════════════════
// Group Management Schemas
// ═══════════════════════════════════════════════════════════════

export const RemoveMemberSchema = z.object({
  userName: z
    .string({ error: "Username is required." })
    .min(1, "Username cannot be empty.")
    .trim(),
});

export const DeleteGroupSchema = z.object({
  password: z
    .string({ error: "Password confirmation is required." })
    .min(1, "Password cannot be empty."),
});

// ═══════════════════════════════════════════════════════════════
// Recurring Expense Schema
// ═══════════════════════════════════════════════════════════════

export const RecurringExpenseSchema = z.object({
  payer: z.string().min(1).trim(),
  amount: z.coerce.number().positive(),
  description: z.string().min(1).max(200).trim(),
  category: z.enum(CATEGORIES).default("Others"),
  split_among: z.string().min(1),
  split_type: z.enum(SPLIT_TYPES).default("equal"),
  split_values: z.union([z.record(z.string(), z.coerce.number()), z.string(), z.null()]).optional().default(null),
  frequency: z.enum(["weekly", "monthly"]),
  next_due_date: z.string().min(1, "Next due date is required."),
});

export const UpdateRecurringSchema = RecurringExpenseSchema.partial().extend({
  is_active: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════

/**
 * Parse and validate a request body against a Zod schema.
 * Throws a ValidationError with detailed field messages on failure.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const path = issue.path.join(".");
      fieldErrors[path || "_root"] = issue.message;
    });

    // Use the first error message as the top-level message
    const firstMessage = result.error.issues[0]?.message || "Invalid request data.";
    throw new ValidationError(firstMessage, { fields: fieldErrors });
  }

  return result.data;
}
