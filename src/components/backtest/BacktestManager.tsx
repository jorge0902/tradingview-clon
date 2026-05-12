"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchHistoricalRange } from "@/lib/binance/rest";
import { chartDB } from "@/lib/database/db";
import { useChartStore } from "@/lib/store/chart-store";
import { Download, Database, CheckCircle2, Loader2 } from "lucide-react";

export function BacktestManager() {
  const { symbol, timeframe: interval } = useChartStore();
  const [status, setStatus] = useState<"idle" | "downloading" | "saved">("idle");
  const [progress, setProgress] = useState(0);

  const startDownload = async () => {
    setStatus("downloading");
    setProgress(0);

    try {
      // 5 years back in seconds
      const endUnix = Math.floor(Date.now() / 1000);
      const startUnix = endUnix - 5 * 365 * 24 * 60 * 60;

      const candles = await fetchHistoricalRange(
        symbol,
        interval,
        startUnix,
        endUnix,
        (p) => setProgress(p)
      );

      await chartDB.saveCandles(symbol, interval, candles);
      setStatus("saved");
    } catch (error) {
      console.error("Download failed", error);
      setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border-t border-tv-border">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Database className="w-4 h-4" />
        <span>Backtesting Data</span>
      </div>

      <div className="text-xs text-tv-text-muted">
        Descarga datos históricos de Binance para realizar backtesting de varios años.
      </div>

      {status === "idle" && (
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2 border-blue-500/50 hover:bg-blue-500/10 text-blue-400"
          onClick={startDownload}
        >
          <Download className="w-4 h-4" />
          Descargar 5 años (1h)
        </Button>
      )}

      {status === "downloading" && (
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] text-tv-text-muted uppercase">
            <span>Descargando...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-tv-border h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-blue-400 justify-center">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Obteniendo bloques de Binance</span>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div className="flex flex-col items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <span className="text-[10px] font-medium text-green-400 uppercase tracking-wider">¡Datos Listos!</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[10px] h-6"
            onClick={() => setStatus("idle")}
          >
            Descargar más
          </Button>
        </div>
      )}
    </div>
  );
}
