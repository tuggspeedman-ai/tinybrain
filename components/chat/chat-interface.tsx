'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageList, type Message } from './message-list';
import { MessageInput } from './message-input';
import { PaymentModeSelector } from './payment-mode-selector';
import { SessionBar } from './session-bar';
import { SessionReceipt, type ReceiptData } from './session-receipt';
import { buildAuthorization, signAuthorization } from '@/lib/session-signing';
import { saveSession, loadSession, clearSession } from '@/lib/session-storage';
import { Card } from '@/components/ui/card';

type PaymentMode = 'select' | 'per-request' | 'tab';

interface SessionState {
  sessionToken: string;
  depositCents: number;
  queryCount: number;
  totalCostCents: number;
  createdAt: number;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { isConnected, address } = useAccount();

  // Payment mode state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('select');
  const [session, setSession] = useState<SessionState | null>(null);
  const [isOpeningTab, setIsOpeningTab] = useState(false);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [settlementTx, setSettlementTx] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // x402 fetch ref (for per-request mode)
  const fetchWithPaymentRef = useRef<((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null>(null);
  // Wallet client ref (for session signing)
  const walletClientRef = useRef<ReturnType<typeof createWalletClient> | null>(null);
  // Abort controller for stopping generation
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set up wallet client + x402 fetch on connection change
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!isConnected || !address || !ethereum) {
      fetchWithPaymentRef.current = null;
      walletClientRef.current = null;
      return;
    }

    const wc = createWalletClient({
      account: address,
      chain: base,
      transport: custom(ethereum),
    });
    walletClientRef.current = wc;

    const signer: ClientEvmSigner = {
      address: wc.account!.address,
      signTypedData: (args) => wc.signTypedData(args),
    };

    const client = new x402Client();
    registerExactEvmScheme(client, { signer });
    fetchWithPaymentRef.current = wrapFetchWithPayment(fetch, client);
  }, [isConnected, address]);

  // Reset UI (but not localStorage) when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setPaymentMode('select');
      setSession(null);
      setMessages([]);
      setShowReceipt(false);
      setSettlementTx(null);
      setReceiptData(null);
    }
  }, [isConnected]);

  // Restore session from localStorage when wallet connects
  useEffect(() => {
    if (!mounted || !isConnected || !address) return;
    // Don't restore if already in an active session or payment mode
    if (paymentMode !== 'select') return;

    const stored = loadSession(address);
    if (stored) {
      setSession({
        sessionToken: stored.sessionToken,
        depositCents: stored.depositCents,
        queryCount: stored.queryCount,
        totalCostCents: stored.totalCostCents,
        createdAt: stored.createdAt,
      });
      setMessages(stored.messages);
      setPaymentMode('tab');
    }
  }, [mounted, isConnected, address, paymentMode]);

  // Persist session + messages to localStorage on every change
  useEffect(() => {
    if (!address || !session || paymentMode !== 'tab') return;
    saveSession(address, {
      sessionToken: session.sessionToken,
      depositCents: session.depositCents,
      queryCount: session.queryCount,
      totalCostCents: session.totalCostCents,
      createdAt: session.createdAt,
      messages,
    });
  }, [address, session, messages, paymentMode]);

  // --- Tab lifecycle ---

  const handleSelectPerRequest = useCallback(() => {
    setPaymentMode('per-request');
  }, []);

  const handleOpenTab = useCallback(async (depositCents: number) => {
    if (!walletClientRef.current || !address) return;
    setIsOpeningTab(true);

    try {
      // Build and sign the deposit authorization
      const authorization = buildAuthorization(address as `0x${string}`, depositCents);
      const signature = await signAuthorization(walletClientRef.current, authorization);

      // POST to open session
      const res = await fetch('/api/session/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          depositAuth: { authorization, signature },
          depositCents,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to open tab');
      }

      const data = await res.json();
      setSession({
        sessionToken: data.sessionToken,
        depositCents,
        queryCount: 0,
        totalCostCents: 0,
        createdAt: Date.now(),
      });
      setPaymentMode('tab');
    } catch (err) {
      console.error('Open tab error:', err);
      setPaymentStatus(`Tab error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setPaymentStatus(null), 4000);
    } finally {
      setIsOpeningTab(false);
    }
  }, [address]);

  const handleEndSession = useCallback(() => {
    if (!session) return;
    // Build receipt data from session
    setIsEndingSession(true);

    const elapsed = Date.now() - session.createdAt;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    // Count breakdown from messages (source of truth for costs)
    const breakdown = new Map<string, { count: number; totalCost: number }>();
    let computedTotal = 0;
    for (const m of messages) {
      if (m.role !== 'assistant' || !m.model || m.queryCost == null) continue;
      const existing = breakdown.get(m.model) ?? { count: 0, totalCost: 0 };
      existing.count += 1;
      existing.totalCost += m.queryCost;
      breakdown.set(m.model, existing);
      computedTotal += m.queryCost;
    }

    // Use computed total from messages (reliable) over session state (may be stale)
    const totalCostCents = computedTotal || session.totalCostCents;

    setReceiptData({
      duration,
      breakdown: Array.from(breakdown.entries()).map(([model, data]) => ({
        model,
        count: data.count,
        totalCost: data.totalCost,
      })),
      totalCostCents,
      depositCents: session.depositCents,
    });

    setShowReceipt(true);
    setIsEndingSession(false);
  }, [session, messages]);

  const handlePay = useCallback(async () => {
    if (!session || !walletClientRef.current || !address || !receiptData) return;
    setIsPaying(true);

    try {
      // Use receiptData.totalCostCents (computed from messages, always reliable)
      const totalCents = receiptData.totalCostCents;
      const isZeroCost = totalCents === 0;
      let settlementAuth = null;
      let settlementSig = null;

      if (!isZeroCost) {
        // Sign settlement for exact amount used
        const auth = buildAuthorization(address as `0x${string}`, totalCents);
        const sig = await signAuthorization(walletClientRef.current, auth);
        settlementAuth = auth;
        settlementSig = sig;
      }

      const res = await fetch('/api/session/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: session.sessionToken,
          ...(settlementAuth && settlementSig
            ? { settlementAuth: { authorization: settlementAuth, signature: settlementSig } }
            : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Settlement failed');
      }

      const data = await res.json();
      setSettlementTx(data.settlementTx || 'closed');
    } catch (err) {
      console.error('Settlement error:', err);
      setIsPaying(false);
      setPaymentStatus(`Settlement error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setPaymentStatus(null), 4000);
    }
  }, [session, address, receiptData]);

  const handleReceiptClose = useCallback(() => {
    if (address) clearSession(address);
    setShowReceipt(false);
    setSettlementTx(null);
    setReceiptData(null);
    setSession(null);
    setPaymentMode('select');
    setMessages([]);
    setIsPaying(false);
  }, [address]);

  // --- Stop generation ---

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  // --- Dual send path ---

  const sendMessage = useCallback(async (content: string) => {
    // Abort any in-flight request
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setPaymentStatus(null);

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    };

    try {
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let response: Response;

      if (paymentMode === 'tab' && session) {
        // Tab mode: plain fetch with session token
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SESSION-TOKEN': session.sessionToken,
          },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortController.signal,
        });
      } else {
        // Per-request mode: x402 payment-wrapped fetch
        if (!isConnected || !fetchWithPaymentRef.current) {
          throw new Error('Please connect your wallet to chat');
        }
        setPaymentStatus('Requesting payment...');

        response = await fetchWithPaymentRef.current('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortController.signal,
        });
      }

      setPaymentStatus(null);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error: ${response.status} - ${errorBody}`);
      }

      setMessages((prev) => [...prev, assistantMessage]);

      // Read streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let sessionIncremented = false; // Track whether we've counted this query

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content || parsed.model) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        content: m.content + (parsed.content || ''),
                        model: m.model || parsed.model,
                        escalationReason: m.escalationReason || parsed.escalationReason,
                        queryCost: m.queryCost ?? parsed.queryCost,
                      }
                    : m
                )
              );
            }

            // Client-side session usage tracking (stateless server — no sessionUsage in SSE)
            if (parsed.queryCost != null && !sessionIncremented && paymentMode === 'tab') {
              sessionIncremented = true;
              const cost = parsed.queryCost;
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      queryCount: prev.queryCount + 1,
                      totalCostCents: prev.totalCostCents + cost,
                    }
                  : prev
              );
            }
          } catch {
            // Ignore parse errors for non-JSON data
          }
        }
      }
    } catch (error) {
      // Silently handle user-initiated abort
      if (error instanceof DOMException && error.name === 'AbortError') return;

      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantMessage.id),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        },
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [messages, isConnected, paymentMode, session]);

  // --- Render ---

  const showSelector = mounted && isConnected && paymentMode === 'select';
  const showMessages = paymentMode === 'per-request' || paymentMode === 'tab';
  const inputDisabled = isLoading || !mounted || !isConnected || paymentMode === 'select';

  return (
    <>
      <Card className="flex flex-col h-[calc(100vh-12rem)] min-h-[400px] max-h-[800px] w-full max-w-3xl mx-auto overflow-hidden shadow-lg">
        {/* Header */}
        <div className="border-b p-4 bg-card">
          {paymentMode === 'per-request' && (
            <div className="flex justify-end">
              <span className="text-xs bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full font-medium border border-blue-500/20">
                $0.01 / query
              </span>
            </div>
          )}

          {/* Session bar (tab mode) */}
          {paymentMode === 'tab' && session && (
            <SessionBar
              queryCount={session.queryCount}
              totalCostCents={session.totalCostCents}
              depositCents={session.depositCents}
              onEndSession={handleEndSession}
              isEnding={isEndingSession}
            />
          )}

          {/* Wallet not connected warning */}
          {mounted && !isConnected && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Connect a wallet on Base to chat
            </div>
          )}

          {/* Payment status banner */}
          {paymentStatus && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              {paymentStatus}
            </div>
          )}
        </div>

        {/* Main content area */}
        <AnimatePresence mode="wait">
          {showSelector ? (
            <motion.div
              key="selector"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex items-center justify-center overflow-y-auto"
            >
              <PaymentModeSelector
                onSelectPerRequest={handleSelectPerRequest}
                onSelectTab={handleOpenTab}
                isOpeningTab={isOpeningTab}
              />
            </motion.div>
          ) : showMessages ? (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <MessageList messages={messages} isLoading={isLoading} />
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
              <div className="text-center space-y-2">
                <p>Connect a wallet on Base to start chatting</p>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Input */}
        <MessageInput onSend={sendMessage} disabled={inputDisabled} isLoading={isLoading} onStop={handleStop} />
      </Card>

      {/* Receipt modal (outside card for fixed positioning) */}
      <SessionReceipt
        isOpen={showReceipt}
        onClose={handleReceiptClose}
        onPay={handlePay}
        receipt={receiptData}
        isPaying={isPaying}
        settlementTx={settlementTx}
      />
    </>
  );
}
