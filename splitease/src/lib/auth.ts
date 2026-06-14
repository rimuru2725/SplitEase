import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "splitease-default-secret-key-super-secure-2026";

export interface UserSession {
  groupId: number;
  groupName: string;
  userName: string;
  isCreator: boolean;
}

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Compare raw password with hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Sign session token
export function signToken(session: UserSession): string {
  return jwt.sign(session, JWT_SECRET, { expiresIn: "7d" });
}

// Verify session token
export function verifyToken(token: string): UserSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserSession;
  } catch (error) {
    return null;
  }
}

// Extract auth session from request headers or query parameters
export function getAuth(req: Request): UserSession | null {
  try {
    const authHeader = req.headers.get("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      const url = new URL(req.url);
      token = url.searchParams.get("token") || "";
    }

    if (!token) {
      return null;
    }
    return verifyToken(token);
  } catch (error) {
    return null;
  }
}
