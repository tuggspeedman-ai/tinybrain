'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';
import { MessageList, type Message } from './message-list';
import { MessageInput } from './message-input';
import { Card } from '@/components/ui/card';

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { isConnected, address } = useAccount();

  // Use ref to store fetchWithPayment to avoid hydration mismatch
  // This is set only on client side via useEffect
  const fetchWithPaymentRef = useRef<ReturnType<typeof wrapFetchWithPayment> | null>(null);

  // Prevent hydration mismatch by only rendering wallet-dependent UI after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Set up wallet client only on client side to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!isConnected || !address || !ethereum) {
      fetchWithPaymentRef.current = null;
      return;
    }

    const walletClient = createWalletClient({
      account: address,
      chain: base,
      transport: custom(ethereum),
    });

    // Cast to any to bypass type mismatch - the wallet client will work at runtime
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    fetchWithPaymentRef.current = wrapFetchWithPayment(fetch, walletClient as any);
  }, [isConnected, address]);

  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setPaymentStatus(null);

    // Create assistant message placeholder
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    };

    try {
      // Require wallet connection
      if (!isConnected || !fetchWithPaymentRef.current) {
        throw new Error('Please connect your wallet to chat');
      }

      setPaymentStatus('Requesting payment...');

      // Prepare messages for API (include history)
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Use payment-wrapped fetch - it will automatically:
      // 1. Make the request
      // 2. If 402, extract payment details
      // 3. Sign with wallet
      // 4. Retry with X-PAYMENT header
      const response = await fetchWithPaymentRef.current('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      setPaymentStatus(null);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error: ${response.status} - ${errorBody}`);
      }

      // Add empty assistant message that we'll update
      setMessages((prev) => [...prev, assistantMessage]);

      // Read streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

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
              // Update the assistant message with new content, model, and escalation info
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        content: m.content + (parsed.content || ''),
                        // Set model on first chunk that includes it
                        model: m.model || parsed.model,
                        escalationReason: m.escalationReason || parsed.escalationReason,
                        perplexity: m.perplexity ?? parsed.perplexity,
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore parse errors for non-JSON data
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Add error message
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantMessage.id),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isConnected]);

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] min-h-[400px] max-h-[800px] w-full max-w-3xl mx-auto overflow-hidden shadow-lg">
      <div className="border-b p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              TinyBrain
            </h1>
            <p className="text-sm text-muted-foreground">
              Chat with a locally-trained AI model
            </p>
          </div>
          <span className="text-xs bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full font-medium border border-blue-500/20">
            $0.01 / query
          </span>
        </div>
        {mounted && !isConnected && (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Connect your wallet to chat
          </div>
        )}
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
      <MessageList messages={messages} isLoading={isLoading} />
      <MessageInput onSend={sendMessage} disabled={isLoading || !mounted || !isConnected} />
    </Card>
  );
}
