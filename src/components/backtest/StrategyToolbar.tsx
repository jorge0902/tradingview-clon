"use client";

import { Settings, Play, Trash2, Eye, EyeOff, Code2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StrategyToolbar() {
  const { 
    strategyInputs, 
    strategyValues, 
    strategyName, 
    strategyVisible,
    setStrategyVisible,
    setStrategySettingsOpen,
    setBacktestTrades
  } = useChartStore();

  if (strategyInputs.length === 0) return null;

  return (
    <div className="flex h-9 items-center justify-between border-b border-tv-border bg-tv-panel px-4 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-semibold text-blue-400">
          <Code2 className="w-3.5 h-3.5" />
          <span>{strategyName}</span>
        </div>
        
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="h-4 w-px bg-tv-border mx-1" />
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
            {strategyInputs.map((input) => (
              <div key={input.name} className="flex items-center gap-1">
                <span className="text-tv-text-muted">{input.label}:</span>
                <span className="text-tv-text font-medium">
                  {strategyValues[input.name]?.toString() ?? input.default?.toString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-tv-text-muted hover:text-white"
          onClick={() => setStrategyVisible(!strategyVisible)}
          title={strategyVisible ? "Ocultar en gráfico" : "Mostrar en gráfico"}
        >
          {strategyVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-tv-text-muted hover:text-white"
          onClick={() => setStrategySettingsOpen(true)}
          title="Configuración de estrategia"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
        <div className="h-4 w-px bg-tv-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-tv-text-muted hover:text-tv-red"
          onClick={() => setBacktestTrades([])}
          title="Limpiar trades"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
