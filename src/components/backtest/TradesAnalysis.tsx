import type { BacktestResult } from "@/lib/backtest/backtest-engine";

export function TradesAnalysis({ result }: { result: BacktestResult }) {
  const total = result.trades.length;
  if (total === 0) return null;

  const wins = result.trades.filter((t) => (t.pnl || 0) > 0).length;
  const losses = result.trades.filter((t) => (t.pnl || 0) < 0).length;
  const breakEven = total - wins - losses;

  const winPct = (wins / total) * 100;
  const lossPct = (losses / total) * 100;

  // For the Donut Chart SVG
  const strokeWidth = 15;
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate stroke-dasharray segments
  const winDash = (winPct / 100) * circumference;
  const lossDash = (lossPct / 100) * circumference;

  // Simple PnL distribution buckets (fake/visual distribution for now, or calculated)
  // Let's calculate real buckets
  const buckets = Array(10).fill(0);
  let maxBucketVal = 0;
  
  // Find min and max % pnl
  let minPct = 0;
  let maxPct = 0;
  result.trades.forEach(t => {
      if (t.pnlPercent) {
          if (t.pnlPercent < minPct) minPct = t.pnlPercent;
          if (t.pnlPercent > maxPct) maxPct = t.pnlPercent;
      }
  });
  
  // Prevent zero division
  if (minPct === 0 && maxPct === 0) { maxPct = 1; minPct = -1; }
  
  const range = maxPct - minPct;
  
  result.trades.forEach(t => {
      const p = t.pnlPercent || 0;
      // Normalize to 0-9 index
      let index = Math.floor(((p - minPct) / range) * 9);
      if (index < 0) index = 0;
      if (index > 9) index = 9;
      buckets[index]++;
      if (buckets[index] > maxBucketVal) maxBucketVal = buckets[index];
  });

  return (
    <div className="grid grid-cols-2 gap-6 p-4 border border-tv-border bg-black/20 rounded mt-6">
      {/* Distribution (Simplified Bar Chart) */}
      <div className="flex flex-col">
        <h3 className="text-sm font-semibold mb-6">P&L Distribution</h3>
        <div className="flex-1 flex items-end justify-between gap-1 h-40">
          {buckets.map((val, i) => {
            const hPct = maxBucketVal === 0 ? 0 : (val / maxBucketVal) * 100;
            // Determine if bucket is mostly profit or loss based on its center
            const bucketCenter = minPct + (range * (i + 0.5) / 10);
            const isProfit = bucketCenter >= 0;
            
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                {/* Tooltip */}
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-black/80 text-[10px] px-2 py-1 rounded border border-tv-border whitespace-nowrap transition-opacity z-10 pointer-events-none">
                  {val} trades
                </div>
                <div 
                  className={`w-full max-w-[24px] rounded-t-sm transition-all duration-300 hover:brightness-125 ${isProfit ? 'bg-tv-green' : 'bg-tv-red'}`} 
                  style={{ height: `${Math.max(hPct, 1)}%` }} 
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-tv-text-muted mt-2 border-t border-tv-border/50 pt-2">
            <span>{minPct.toFixed(1)}%</span>
            <span>0%</span>
            <span>{maxPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Win/Loss Donut */}
      <div className="flex flex-col">
        <h3 className="text-sm font-semibold mb-6">Win/loss ratio</h3>
        <div className="flex items-center justify-center gap-8 h-40">
          {/* SVG Donut */}
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background circle (break even) */}
              <circle
                cx="50" cy="50" r={radius}
                fill="transparent"
                stroke="#363a45"
                strokeWidth={strokeWidth}
              />
              {/* Wins (Green) */}
              <circle
                cx="50" cy="50" r={radius}
                fill="transparent"
                stroke="#26a69a"
                strokeWidth={strokeWidth}
                strokeDasharray={`${winDash} ${circumference}`}
                strokeDashoffset="0"
              />
              {/* Losses (Red) */}
              <circle
                cx="50" cy="50" r={radius}
                fill="transparent"
                stroke="#ef5350"
                strokeWidth={strokeWidth}
                strokeDasharray={`${lossDash} ${circumference}`}
                strokeDashoffset={-winDash}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold">{total}</span>
              <span className="text-[10px] text-tv-text-muted leading-tight">Total trades</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tv-green" />
              <span className="w-16">Wins</span>
              <span className="w-12 text-right">{wins} trades</span>
              <span className="w-12 text-right text-tv-text-muted">{winPct.toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tv-red" />
              <span className="w-16">Losses</span>
              <span className="w-12 text-right">{losses} trades</span>
              <span className="w-12 text-right text-tv-text-muted">{lossPct.toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#363a45]" />
              <span className="w-16">Break even</span>
              <span className="w-12 text-right">{breakEven} trades</span>
              <span className="w-12 text-right text-tv-text-muted">{((breakEven / total) * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
