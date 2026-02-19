import { eip3009ABI } from '@x402/evm';
import { treasuryWallet, publicClient } from './treasury';
import { SESSION_PRICING, USDC_ADDRESS } from './session-pricing';
import type { EscalationReason, ModelType } from './router';

// ---------- Types ----------

export interface DepositAuth {
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;            // USDC base units (6 decimals), e.g. "250000" = $0.25
    validAfter: string;       // Unix timestamp
    validBefore: string;      // Unix timestamp
    nonce: `0x${string}`;
  };
  signature: `0x${string}`;
}

export interface UsageEntry {
  model: 'tinychat' | 'blockrun';
  cost: number;               // Cost in cents (1 = $0.01)
  timestamp: number;          // Unix epoch ms
  escalationReason: EscalationReason;
}

export type SessionStatus = 'active' | 'closed' | 'expired';

export interface Session {
  id: string;
  token: string;
  walletAddress: `0x${string}`;
  depositAuth: DepositAuth;
  depositAmount: number;      // Deposit in cents (e.g. 25 = $0.25)
  usage: UsageEntry[];
  totalCostCents: number;
  createdAt: number;          // Unix epoch ms
  lastActivityAt: number;     // Unix epoch ms
  status: SessionStatus;
}

// ---------- Store ----------

class SessionStore {
  private sessions = new Map<string, Session>();        // token → Session
  private walletIndex = new Map<string, string>();      // walletAddress (lowercase) → token
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;

  createSession(
    walletAddress: `0x${string}`,
    depositAuth: DepositAuth,
    depositAmount: number,
  ): Session {
    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      walletAddress,
      depositAuth,
      depositAmount,
      usage: [],
      totalCostCents: 0,
      createdAt: now,
      lastActivityAt: now,
      status: 'active',
    };

    this.sessions.set(session.token, session);
    this.walletIndex.set(walletAddress.toLowerCase(), session.token);
    this.ensureTimeoutChecker();

    console.log(`[Session] Created session ${session.id} for ${walletAddress} (deposit: ${depositAmount}¢)`);
    return session;
  }

  getSessionByToken(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  getSessionByWallet(walletAddress: `0x${string}`): Session | undefined {
    const token = this.walletIndex.get(walletAddress.toLowerCase());
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (session && session.status === 'active') return session;
    return undefined;
  }

  addUsage(token: string, entry: { model: ModelType; cost: number; escalationReason: EscalationReason }): Session | undefined {
    const session = this.sessions.get(token);
    if (!session || session.status !== 'active') return undefined;

    const usageEntry: UsageEntry = {
      model: entry.model === 'daydreams' ? 'blockrun' : entry.model as 'tinychat' | 'blockrun',
      cost: entry.cost,
      timestamp: Date.now(),
      escalationReason: entry.escalationReason,
    };

    session.usage.push(usageEntry);
    session.totalCostCents += entry.cost;
    session.lastActivityAt = Date.now();

    console.log(`[Session] ${session.id} usage: +${entry.cost}¢ (${entry.model}), total: ${session.totalCostCents}¢ / ${session.depositAmount}¢`);
    return session;
  }

  hasAvailableBalance(token: string): boolean {
    const session = this.sessions.get(token);
    if (!session || session.status !== 'active') return false;
    return session.totalCostCents + SESSION_PRICING.QUERY_COST_CENTS <= session.depositAmount;
  }

  closeSession(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (!session || session.status !== 'active') return undefined;

    session.status = 'closed';
    this.walletIndex.delete(session.walletAddress.toLowerCase());

    console.log(`[Session] Closed session ${session.id}, total: ${session.totalCostCents}¢`);
    this.cleanupIfEmpty();
    return session;
  }

  // ---------- Timeout handling ----------

  private ensureTimeoutChecker() {
    if (this.timeoutTimer) return;
    this.timeoutTimer = setInterval(() => this.checkExpiredSessions(), 60_000);
    console.log('[Session] Started timeout checker');
  }

  private cleanupIfEmpty() {
    const hasActive = [...this.sessions.values()].some(s => s.status === 'active');
    if (!hasActive && this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
      console.log('[Session] Stopped timeout checker (no active sessions)');
    }
  }

  private async checkExpiredSessions() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.status !== 'active') continue;
      if (now - session.lastActivityAt < SESSION_PRICING.SESSION_TIMEOUT_MS) continue;

      console.log(`[Session] Session ${session.id} expired (inactive ${Math.round((now - session.lastActivityAt) / 60_000)}min)`);
      await this.settleExpiredSession(session);
    }
  }

  private async settleExpiredSession(session: Session) {
    session.status = 'expired';
    this.walletIndex.delete(session.walletAddress.toLowerCase());

    // Check if the deposit auth is still valid (not expired on-chain)
    const validBefore = Number(session.depositAuth.authorization.validBefore);
    if (validBefore <= Math.floor(Date.now() / 1000)) {
      console.error(`[Session] Deposit auth for ${session.id} has expired on-chain, cannot settle`);
      this.cleanupIfEmpty();
      return;
    }

    try {
      const { authorization, signature } = session.depositAuth;

      // Submit deposit auth on-chain (bytes signature overload)
      const txHash = await treasuryWallet.writeContract({
        address: USDC_ADDRESS,
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          authorization.from,
          authorization.to,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce,
          signature,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[Session] Deposit settled for expired session ${session.id}: ${txHash} (status: ${receipt.status})`);
    } catch (err) {
      console.error(`[Session] Failed to settle deposit for expired session ${session.id}:`, err);
      // Keep status as expired — next timeout check won't retry since status !== 'active'
    }

    this.cleanupIfEmpty();
  }
}

export const sessionStore = new SessionStore();
