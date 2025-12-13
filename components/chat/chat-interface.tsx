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
  const { isConnected, address } = useAccount();

  // Use ref to store fetchWithPayment to avoid hydration mismatch
  // This is set only on client side via useEffect
  const fetchWithPaymentRef = useRef<ReturnType<typeof wrapFetchWithPayment> | null>(null);

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
              // Update the assistant message with new content and model info
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        content: m.content + (parsed.content || ''),
                        // Set model on first chunk that includes it
                        model: m.model || parsed.model,
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
    <Card className="flex flex-col h-[600px] w-full max-w-3xl mx-auto">
      <div className="border-b p-4">
        <h1 className="text-xl font-semibold">NanoBrain</h1>
        <p className="text-sm text-muted-foreground">
          Chat with a locally-trained AI model
          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
            $0.01 / query
          </span>
        </p>
        {!isConnected && (
          <p className="text-sm text-amber-600 mt-2">
            Connect your wallet to chat
          </p>
        )}
        {paymentStatus && (
          <p className="text-sm text-blue-600 mt-2">
            {paymentStatus}
          </p>
        )}
      </div>
      <MessageList messages={messages} isLoading={isLoading} />
      <MessageInput onSend={sendMessage} disabled={isLoading || !isConnected} />
    </Card>
  );
}
