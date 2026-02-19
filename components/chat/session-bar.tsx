'use client';

import { motion } from 'framer-motion';
import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SessionBarProps {
  queryCount: number;
  totalCostCents: number;
  depositCents: number;
  onEndSession: () => void;
  isEnding: boolean;
}

export function SessionBar({
  queryCount,
  totalCostCents,
  depositCents,
  onEndSession,
  isEnding,
}: SessionBarProps) {
  const percentage = depositCents > 0 ? Math.min((totalCostCents / depositCents) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          'mt-3 p-3 rounded-xl',
          'bg-gradient-to-r from-blue-500/5 to-purple-500/5',
          'border border-blue-500/20 dark:border-blue-400/20',
          'backdrop-blur-sm',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left: status + stats */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Pulsing green dot */}
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span>Tab Open</span>
                <span className="text-muted-foreground font-normal text-xs">
                  {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px] sm:max-w-[200px]">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  ${(totalCostCents / 100).toFixed(2)} / ${(depositCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: End & Pay button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onEndSession}
            disabled={isEnding}
            className="flex-shrink-0 text-xs gap-1.5 border-blue-500/30 hover:bg-blue-500/10"
          >
            {isEnding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Square className="h-3 w-3" />
                <span className="hidden sm:inline">End & Pay</span>
                <span className="sm:hidden">End</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
