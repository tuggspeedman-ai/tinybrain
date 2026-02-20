'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, Brain, Rocket, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ReceiptData {
  duration: string;
  breakdown: Array<{
    model: string;
    count: number;
    totalCost: number; // cents
  }>;
  totalCostCents: number;
  depositCents: number;
}

interface SessionReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  onPay: () => void;
  receipt: ReceiptData | null;
  isPaying: boolean;
  settlementTx: string | null;
}

export function SessionReceipt({
  isOpen,
  onClose,
  onPay,
  receipt,
  isPaying,
  settlementTx,
}: SessionReceiptProps) {
  const savingsCents = (receipt?.depositCents ?? 0) - (receipt?.totalCostCents ?? 0);
  const isZeroCost = (receipt?.totalCostCents ?? 0) === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={!isPaying ? onClose : undefined}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full max-w-md rounded-2xl border border-border/50',
              'bg-card shadow-xl',
            )}
          >
            {/* Header */}
            <div className="p-6 pb-4 text-center border-b border-border/50">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-3">
                <Receipt className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Session Receipt</h2>
              {receipt && (
                <p className="text-sm text-muted-foreground mt-1">{receipt.duration}</p>
              )}
            </div>

            {/* Breakdown */}
            <div className="p-6 space-y-3">
              {receipt?.breakdown.map((entry) => (
                <div key={entry.model} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {entry.model === 'blockrun' ? (
                      <Rocket size={14} className="text-orange-500" />
                    ) : (
                      <Brain size={14} className="text-blue-500" />
                    )}
                    <span className="text-foreground">
                      {entry.count}x {entry.model === 'blockrun' ? 'DeepSeek R1' : 'TinyChat'}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    ${(entry.totalCost / 100).toFixed(2)}
                  </span>
                </div>
              ))}

              {receipt?.breakdown.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No queries made
                </p>
              )}

              {/* Totals */}
              <div className="border-t border-border/50 pt-3 space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Total</span>
                  <span className="font-mono">
                    ${((receipt?.totalCostCents ?? 0) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Deposit</span>
                  <span className="font-mono">
                    ${((receipt?.depositCents ?? 0) / 100).toFixed(2)}
                  </span>
                </div>
                {savingsCents > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Savings (not charged)</span>
                    <span className="font-mono">
                      ${(savingsCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Settlement confirmation */}
              {settlementTx && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
                >
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    <span>Settled on Base</span>
                  </div>
                  <a
                    href={`https://basescan.org/tx/${settlementTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground mt-1 font-mono break-all block underline decoration-muted-foreground/30 hover:decoration-foreground/50 transition-colors"
                  >
                    {settlementTx}
                  </a>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 pt-0 flex gap-3">
              {!settlementTx ? (
                <>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={isPaying}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={onPay}
                    disabled={isPaying}
                    className={cn(
                      'flex-1 gap-2',
                      'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white',
                    )}
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Settling...
                      </>
                    ) : isZeroCost ? (
                      'Close (No Charge)'
                    ) : (
                      `Pay $${((receipt?.totalCostCents ?? 0) / 100).toFixed(2)}`
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={onClose}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
                >
                  Done
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
