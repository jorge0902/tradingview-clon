"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, type UTCTimestamp } from "lightweight-charts";
import type { BacktestResult } from "@/lib/backtest/backtest-engine";

export function EquityChart({ result }: { result: BacktestResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const isProfit = result.netProfit >= 0;
  const mainColor = isProfit ? "#26a69a" : "#ef5350";
  const areaTopColor = isProfit ? "rgba(38, 166, 154, 0.4)" : "rgba(239, 83, 80, 0.4)";

  useEffect(() => {
    if (!containerRef.current || !result || result.equityCurve.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#d1d4dc",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.3)" },
        horzLines: { color: "rgba(42, 46, 57, 0.3)" },
      },
      rightPriceScale: {
        borderVisible: false,
        autoScale: true,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      autoSize: true,
      crosshair: {
        vertLine: { color: "#787b86", width: 1, style: 3 },
        horzLine: { color: "#787b86", width: 1, style: 3 },
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: mainColor,
      topColor: areaTopColor,
      bottomColor: "rgba(0, 0, 0, 0)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: 2,
    });

    const data = result.equityCurve.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.equity,
    }));
    
    data.sort((a, b) => a.time - b.time);
    const uniqueData = data.filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);

    series.setData(uniqueData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [result, mainColor, areaTopColor]);

  const handleFit = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  return (
    <div className="w-full h-[300px] border border-tv-border bg-black/20 rounded relative group">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <span className="font-semibold text-sm">Equity Chart</span>
        <button 
          onClick={handleFit}
          className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-tv-text-muted hover:text-white transition opacity-0 group-hover:opacity-100"
        >
          Ver todo (5 años)
        </button>
      </div>
      <div ref={containerRef} className="w-full h-full pt-8" />
    </div>
  );
}
