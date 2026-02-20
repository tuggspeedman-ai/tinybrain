'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MessageContent } from './message-content';
import { Brain, Rocket, Bot, User, DollarSign, ChevronDown, Sparkles } from 'lucide-react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: 'tinychat' | 'blockrun';
  escalationReason?: 'keyword' | 'complexity' | 'none';
  queryCost?: number; // cents, shown as badge in session mode
}

const STARTER_PROMPTS = [
  "What's your name?",
  "Tell me a joke",
  "Who created you?",
  "How many parameters do you have?",
  "What can you help me with?",
  "Say something funny",
  "What's your favorite color?",
  "Tell me about yourself",
  "What are you good at?",
  "Do you dream?",
  "What's the meaning of life?",
  "Are you sentient?",
  "What makes you different from other AIs?",
  "Give me a fun fact",
  "What's your favorite word?",
  "How were you trained?",
];

function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  onSend?: (message: string) => void;
}

export function MessageList({ messages, isLoading, onSend }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Pick 4 random starter prompts on mount
  const starters = useMemo(() => shuffleAndPick(STARTER_PROMPTS, 4), []);

  // Track whether user has scrolled away from the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
        <div className="text-center space-y-4">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p>Send a message to start chatting with TinyBrain</p>
          {onSend && (
            <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
              {starters.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSend(prompt)}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full',
                    'border border-border/50 bg-card/50',
                    'hover:border-blue-500/50 hover:bg-blue-500/5',
                    'transition-all duration-200 cursor-pointer',
                    'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sparkles size={12} />
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 relative">
      <div className="space-y-6 max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index === messages.length - 1 ? 0.05 : 0 }}
            className={cn(
              'flex gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {/* Avatar for assistant */}
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}

            <div
              className={cn(
                'max-w-[80%] overflow-x-hidden',
                message.role === 'user'
                  ? 'rounded-2xl rounded-tr-md bg-primary text-primary-foreground px-4 py-3'
                  : 'rounded-2xl rounded-tl-md bg-muted px-4 py-3'
              )}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
              ) : (
                <MessageContent content={message.content} />
              )}
              {message.role === 'assistant' && message.model && (
                <div className="mt-3 pt-2 border-t border-border/50 flex items-center gap-2 flex-wrap">
                  {message.model === 'blockrun' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                      <Rocket size={12} />
                      <span>Answered by DeepSeek R1</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Brain size={12} />
                      <span>TinyChat</span>
                    </span>
                  )}
                  {message.queryCost != null && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                      <DollarSign size={10} />
                      ${(message.queryCost / 100).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Avatar for user */}
            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </motion.div>
        ))}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 justify-start"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            className={cn(
              'absolute bottom-4 left-1/2 -translate-x-1/2',
              'w-8 h-8 rounded-full shadow-lg',
              'bg-card border border-border/50',
              'flex items-center justify-center',
              'hover:bg-muted transition-colors cursor-pointer',
            )}
          >
            <ChevronDown size={16} className="text-muted-foreground" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
