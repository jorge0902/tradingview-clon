"use client";

import { useState, useRef, useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Play, Code2, LineChart, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChartStore } from "@/lib/store/chart-store";
import { chartDB } from "@/lib/database/db";
import { BacktestEngine, type BacktestResult, type StrategyContext } from "@/lib/backtest/backtest-engine";
import { formatPrice, formatPct } from "@/lib/format";
import { EquityChart } from "./EquityChart";
import { TradesAnalysis } from "./TradesAnalysis";
import { parseStrategyInputs, createInputContext } from "@/lib/backtest/strategy-inputs";

const DEFAULT_STRATEGY = `// Estrategia de Cruce de Medias Móviles (SMA)
const fastPeriod = input(10, "SMA Rápida", { min: 2, max: 100 });
const slowPeriod = input(30, "SMA Lenta", { min: 5, max: 200 });

function sma(data, period, index) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[index - i].close;
  }
  return sum / period;
}

const fastSma = sma(ctx.data, fastPeriod, ctx.index);
const slowSma = sma(ctx.data, slowPeriod, ctx.index);

if (fastSma !== null && slowSma !== null) {
  const prevFast = sma(ctx.data, fastPeriod, ctx.index - 1);
  const prevSlow = sma(ctx.data, slowPeriod, ctx.index - 1);
  
  const crossover = prevFast <= prevSlow && fastSma > slowSma;
  const crossunder = prevFast >= prevSlow && fastSma < slowSma;

  if (crossover && ctx.position !== "LONG") {
    ctx.buy();
  } else if (crossunder && ctx.position !== "SHORT") {
    ctx.sell();
  }
}
`;

export function BacktestPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "results">("editor");
  const [code, setCode] = useState(DEFAULT_STRATEGY);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  
  const { 
    symbol, 
    timeframe, 
    strategyValues, 
    setStrategyInputs, 
    setStrategyName,
    setBacktestTrades 
  } = useChartStore();
  const monaco = useMonaco();

  // Dark theme for monaco
  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('tv-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1e222d',
        }
      });
      monaco.editor.setTheme('tv-dark');
    }
  }, [monaco]);

  // Parse inputs whenever code changes
  useEffect(() => {
    const inputs = parseStrategyInputs(code);
    setStrategyInputs(inputs);
    
    // Extract strategy name from comments if present (e.g. // Strategy: My Strategy)
    const nameMatch = code.match(/\/\/\s*Strategy:\s*([^\n]+)/i) || code.match(/\/\/\s*([^\n]+)/);
    if (nameMatch) {
      setStrategyName(nameMatch[1].trim());
    }
  }, [code, setStrategyInputs, setStrategyName]);

  // Re-run backtest when parameters change
  useEffect(() => {
    if (result) {
      runBacktest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyValues]);

  const runBacktest = async () => {
    setIsRunning(true);
    setActiveTab("results");
    
    try {
      // 1. Get data from IndexedDB
      const candles = await chartDB.getCandles(symbol, timeframe, 0, Infinity);
      
      if (candles.length === 0) {
        alert("No hay datos históricos guardados para " + symbol + " en " + timeframe + ". Usa el panel derecho para descargarlos primero.");
        setIsRunning(false);
        return;
      }

      // 2. Compile strategy
      const input = createInputContext(strategyValues);
      const strategyFn = new Function("ctx", "input", code) as (ctx: StrategyContext, input: any) => void;

      // 3. Run engine
      const engine = new BacktestEngine(10000);
      const res = engine.run(candles, (ctx) => strategyFn(ctx, input));
      
      setResult(res);
      
      // Update store with trades to render markers on chart
      setBacktestTrades(res.trades);
      
    } catch (err) {
      console.error("Backtest error:", err);
      alert("Error en el código de la estrategia: " + String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-50 border-t border-tv-border bg-tv-panel transition-all duration-300 flex flex-col ${isOpen ? "h-80" : "h-10"}`}>
      {/* Panel Header / Tabs */}
      <div className="flex h-10 items-center justify-between border-b border-tv-border px-4 select-none shrink-0">
        <div className="flex gap-4 h-full">
          <button 
            className={`flex items-center gap-2 h-full border-b-2 px-1 text-sm font-medium ${activeTab === "editor" && isOpen ? "border-blue-500 text-blue-400" : "border-transparent text-tv-text-muted hover:text-tv-text"}`}
            onClick={() => { setActiveTab("editor"); setIsOpen(true); }}
          >
            <Code2 className="w-4 h-4" />
            JS Editor
          </button>
          <button 
            className={`flex items-center gap-2 h-full border-b-2 px-1 text-sm font-medium ${activeTab === "results" && isOpen ? "border-blue-500 text-blue-400" : "border-transparent text-tv-text-muted hover:text-tv-text"}`}
            onClick={() => { setActiveTab("results"); setIsOpen(true); }}
          >
            <LineChart className="w-4 h-4" />
            Strategy Tester
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {isOpen && (
            <Button size="sm" variant="outline" className="h-7 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/50" onClick={runBacktest} disabled={isRunning}>
              <Play className="w-3 h-3 mr-1" />
              {isRunning ? "Ejecutando..." : "Ejecutar Backtest"}
            </Button>
          )}
          <button onClick={() => setIsOpen(!isOpen)} className="text-tv-text-muted hover:text-white p-1 rounded hover:bg-white/10 transition">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Panel Content */}
      {isOpen && (
        <div className="flex-1 min-h-0 relative">
          {/* Editor Tab */}
          <div className={`absolute inset-0 ${activeTab === "editor" ? "block" : "hidden"}`}>
            <Editor
              height="100%"
              defaultLanguage="javascript"
              value={code}
              onChange={(v) => setCode(v || "")}
              theme="tv-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "JetBrains Mono, monospace",
                scrollBeyondLastLine: false,
                padding: { top: 16 }
              }}
            />
          </div>

          {/* Results Tab */}
          <div className={`absolute inset-0 overflow-y-auto p-4 ${activeTab === "results" ? "block" : "hidden"}`}>
            {!result ? (
              <div className="flex h-full items-center justify-center text-tv-text-muted">
                Ejecuta un backtest para ver los resultados aquí.
              </div>
            ) : (
              <div className="flex flex-col gap-6 pb-12">
                <div className="grid grid-cols-6 gap-4">
                  <ResultCard label="Net Profit" value={formatPrice(result.netProfit)} isPct={(result.netProfit / result.initialBalance) * 100} />
                  <ResultCard label="Total Trades" value={result.totalTrades.toString()} />
                  <ResultCard label="Win Rate" value={result.winRate.toFixed(2) + "%"} />
                  <ResultCard label="Max Drawdown" value={result.maxDrawdown.toFixed(2) + "%"} negative />
                  <ResultCard label="Profit Factor" value={result.profitFactor.toFixed(2)} />
                  <ResultCard label="Final Balance" value={formatPrice(result.finalBalance)} />
                </div>
                
                <EquityChart result={result} />
                <TradesAnalysis result={result} />
                
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-3 border-b border-tv-border pb-2">Últimos 100 Trades</h3>
                  <div className="text-xs text-tv-text-muted border border-tv-border rounded">
                    <div className="grid grid-cols-5 p-2 font-semibold border-b border-tv-border bg-black/20">
                      <div>Lado</div>
                      <div>Precio Entrada</div>
                      <div>Precio Salida</div>
                      <div>PNL</div>
                      <div>PNL %</div>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto">
                      {result.trades.slice().reverse().slice(0, 100).map((t, i) => (
                        <div key={i} className="grid grid-cols-5 p-2 border-b border-tv-border/50 hover:bg-white/5">
                          <div className={t.side === "LONG" ? "text-tv-green" : "text-tv-red"}>{t.side}</div>
                          <div>{formatPrice(t.entryPrice)}</div>
                          <div>{t.exitPrice ? formatPrice(t.exitPrice) : "-"}</div>
                          <div className={(t.pnl || 0) >= 0 ? "text-tv-green" : "text-tv-red"}>{t.pnl ? formatPrice(t.pnl) : "-"}</div>
                          <div className={(t.pnl || 0) >= 0 ? "text-tv-green" : "text-tv-red"}>{t.pnlPercent ? t.pnlPercent.toFixed(2) + "%" : "-"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ label, value, isPct, negative }: { label: string, value: string, isPct?: number, negative?: boolean }) {
  const isUp = isPct !== undefined ? isPct >= 0 : !negative;
  return (
    <div className="bg-black/20 border border-tv-border p-3 rounded flex flex-col gap-1">
      <span className="text-xs text-tv-text-muted">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold">{value}</span>
        {isPct !== undefined && (
          <span className={`text-xs ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{isPct.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
