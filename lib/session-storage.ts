/**
 * localStorage persistence for bar tab sessions.
 *
 * Keyed by wallet address so each wallet has its own stored session.
 * Allows users to resume/settle a tab after page refresh or accidental close.
 * Session tokens expire after 1 hour (server-side), so stored sessions
 * older than that are treated as expired and cleared.
 */

import type { Message } from '@/components/chat/message-list';

const STORAGE_PREFIX = 'tinybrain:session:';
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour (matches server)

export interface StoredSession {
  sessionToken: string;
  depositCents: number;
  queryCount: number;
  totalCostCents: number;
  createdAt: number;
  messages: Message[];
}

function storageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

/** Save session + messages to localStorage. */
export function saveSession(walletAddress: string, session: StoredSession): void {
  try {
    localStorage.setItem(storageKey(walletAddress), JSON.stringify(session));
  } catch {
    // Silently fail (private browsing, quota exceeded, etc.)
  }
}

/**
 * Load a stored session for the given wallet.
 * Returns null if no session exists or if it has expired (>1 hour old).
 */
export function loadSession(walletAddress: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(storageKey(walletAddress));
    if (!raw) return null;

    const stored: StoredSession = JSON.parse(raw);

    // Check if session token has expired
    if (Date.now() - stored.createdAt > SESSION_MAX_AGE_MS) {
      clearSession(walletAddress);
      return null;
    }

    return stored;
  } catch {
    return null;
  }
}

/** Clear stored session for a wallet. */
export function clearSession(walletAddress: string): void {
  try {
    localStorage.removeItem(storageKey(walletAddress));
  } catch {
    // Silently fail
  }
}
