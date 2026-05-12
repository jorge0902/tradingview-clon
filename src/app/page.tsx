"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { BacktestPanel } from "@/components/backtest/BacktestPanel";
import { StrategyToolbar } from "@/components/backtest/StrategyToolbar";
import { StrategySettingsDialog } from "@/components/backtest/StrategySettingsDialog";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 relative flex flex-col">
            <StrategyToolbar />
            <div className="flex-1 relative">
              <PriceChart symbol={symbol} timeframe={timeframe} />
              <BacktestPanel />
            </div>
          </div>
        </main>
        <RightSidebar />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
      <StrategySettingsDialog />
    </div>
  );
}
