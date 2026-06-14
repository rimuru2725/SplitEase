/**
 * In-memory sliding window rate limiter.
 * No external dependencies — uses a Map with LRU eviction.
 *
 * Keys are based on client IP address.
 * Entries automatically expire after windowMs.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp in ms
}

interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// Preset configurations
export const RATE_LIMITS = {
  /** Auth endpoints — 5 requests / 60s per IP */
  auth: { windowMs: 60_000, maxRequests: 5 } as RateLimitConfig,

  /** Write endpoints (POST/PUT/DELETE) — 30 requests / 60s per IP */
  write: { windowMs: 60_000, maxRequests: 30 } as RateLimitConfig,

  /** Read endpoints (GET) — 60 requests / 60s per IP */
  read: { windowMs: 60_000, maxRequests: 60 } as RateLimitConfig,
};

// Separate stores for each config so limits are independent
const stores = new Map<RateLimitConfig, Map<string, RateLimitEntry>>();

const MAX_STORE_SIZE = 10_000; // Prevent unbounded memory growth

function getStore(config: RateLimitConfig): Map<string, RateLimitEntry> {
  let store = stores.get(config);
  if (!store) {
    store = new Map();
    stores.set(config, store);
  }
  return store;
}

/**
 * Extract client IP from request headers.
 * Falls back to "unknown" if no IP can be determined.
 */
export function getClientIp(req: Request): string {
  // Check standard proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

/**
 * Check rate limit for a given key and config.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
 */
export function checkRateLimit(
  config: RateLimitConfig,
  key: string
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const store = getStore(config);
  const now = Date.now();

  // Evict expired entries periodically (every 100th check)
  if (Math.random() < 0.01) {
    for (const [k, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(k);
      }
    }
  }

  // LRU eviction if store is too large
  if (store.size > MAX_STORE_SIZE) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // First request in this window or window has expired
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count < config.maxRequests) {
    entry.count++;
    return { allowed: true };
  }

  // Rate limited
  const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}
