'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Receipt, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaymentModeSelectorProps {
  onSelectPerRequest: () => void;
  onSelectTab: (depositCents: number) => void;
  isOpeningTab: boolean;
}

const DEPOSIT_PRESETS = [
  { cents: 10, label: '$0.10' },
  { cents: 25, label: '$0.25' },
  { cents: 50, label: '$0.50' },
];

export function PaymentModeSelector({
  onSelectPerRequest,
  onSelectTab,
  isOpeningTab,
}: PaymentModeSelectorProps) {
  const [selectedDeposit, setSelectedDeposit] = useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center gap-6 p-6 w-full max-w-lg mx-auto"
    >
      <div className="text-center space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          How would you like to pay?
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose your payment mode to start chatting
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {/* Option 1: Pay per message */}
        <button
          onClick={onSelectPerRequest}
          disabled={isOpeningTab}
          className={cn(
            'group relative p-5 rounded-xl border border-border/50 text-left',
            'bg-card/50 backdrop-blur-sm',
            'hover:border-blue-500/50 hover:bg-blue-500/5',
            'transition-all duration-200 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mb-3">
            <CreditCard className="h-5 w-5 text-blue-500" />
          </div>
          <h3 className="font-medium text-foreground mb-1">Pay per message</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            $0.01 per query. Sign each message with your wallet.
          </p>
        </button>

        {/* Option 2: Open a tab */}
        <div
          className={cn(
            'relative p-5 rounded-xl border border-border/50',
            'bg-card/50 backdrop-blur-sm',
            'transition-all duration-200',
            selectedDeposit && 'border-purple-500/50 bg-purple-500/5',
          )}
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center mb-3">
            <Receipt className="h-5 w-5 text-purple-500" />
          </div>
          <h3 className="font-medium text-foreground mb-1">Open a tab</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Deposit once, chat freely. Pay only what you use.
          </p>

          {/* Deposit presets */}
          <div className="flex gap-2 mb-3">
            {DEPOSIT_PRESETS.map(({ cents, label }) => (
              <button
                key={cents}
                onClick={() => setSelectedDeposit(cents)}
                disabled={isOpeningTab}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedDeposit === cents
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Max queries hint */}
          {selectedDeposit && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground mb-3"
            >
              Up to {selectedDeposit} queries at $0.01 each
            </motion.p>
          )}

          {/* Open Tab button */}
          <Button
            onClick={() => selectedDeposit && onSelectTab(selectedDeposit)}
            disabled={!selectedDeposit || isOpeningTab}
            className={cn(
              'w-full gap-2',
              selectedDeposit && !isOpeningTab
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
                : '',
            )}
          >
            {isOpeningTab ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing deposit...
              </>
            ) : (
              'Open Tab'
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
