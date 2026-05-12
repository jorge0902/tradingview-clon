"use client";

import { Watchlist } from "@/components/watchlist/Watchlist";
import { BacktestManager } from "@/components/backtest/BacktestManager";

export function RightSidebar() {
  return (
    <aside className="flex w-64 flex-col border-l border-tv-border bg-tv-panel overflow-y-auto">
      <div className="flex-1">
        <Watchlist />
      </div>
      <BacktestManager />
    </aside>
  );
}
