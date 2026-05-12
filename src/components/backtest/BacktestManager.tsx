"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchHistoricalRange } from "@/lib/binance/rest";
import { chartDB } from "@/lib/database/db";
import { useChartStore } from "@/lib/store/chart-store";
import { Download, Database, CheckCircle2, Loader2, Calendar, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Timeframe } from "@/lib/binance/types";

export function BacktestManager() {
  const { symbol, timeframe: interval } = useChartStore();
  const [status, setStatus] = useState<"idle" | "downloading" | "saved">("idle");
  const [progress, setProgress] = useState(0);
  const [downloadInterval, setDownloadInterval] = useState<Timeframe>("1h");
  const [downloadYears, setDownloadYears] = useState("5");

  const startDownload = async () => {
    setStatus("downloading");
    setProgress(0);

    try {
      const years = parseInt(downloadYears);
      const endUnix = Math.floor(Date.now() / 1000);
      const startUnix = endUnix - years * 365 * 24 * 60 * 60;

      const candles = await fetchHistoricalRange(
        symbol,
        downloadInterval,
        startUnix,
        endUnix,
        (p) => setProgress(p)
      );

      await chartDB.saveCandles(symbol, downloadInterval, candles);
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
        Descarga datos históricos de Binance para <span className="text-blue-400 font-medium">{symbol}</span> para realizar backtesting de varios años.
      </div>

      {status === "idle" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase text-tv-text-muted flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Intervalo
              </Label>
              <Select value={downloadInterval} onValueChange={(v) => setDownloadInterval(v as Timeframe)}>
                <SelectTrigger className="h-8 text-xs bg-black/20 border-tv-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-tv-panel border-tv-border text-tv-text">
                  {["1m", "5m", "15m", "1h", "4h", "1d"].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase text-tv-text-muted flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Periodo
              </Label>
              <Select value={downloadYears} onValueChange={setDownloadYears}>
                <SelectTrigger className="h-8 text-xs bg-black/20 border-tv-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-tv-panel border-tv-border text-tv-text">
                  {[1, 2, 3, 5, 10].map((y) => (
                    <SelectItem key={y} value={y.toString()} className="text-xs">
                      {y} {y === 1 ? 'año' : 'años'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2 border-blue-500/50 hover:bg-blue-500/10 text-blue-400"
            onClick={startDownload}
          >
            <Download className="w-4 h-4" />
            Descargar Datos
          </Button>
        </div>
      )}

      {status === "downloading" && (
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] text-tv-text-muted uppercase">
            <span>Descargando {symbol}...</span>
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
            <span>Obteniendo {symbol} desde Binance</span>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div className="flex flex-col items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <span className="text-[10px] font-medium text-green-400 uppercase tracking-wider">¡{symbol} Listo!</span>
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
