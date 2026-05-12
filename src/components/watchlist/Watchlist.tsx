"use client";

import { useEffect, useState } from "react";
import { Plus, X, MoreVertical, Database } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chartDB } from "@/lib/database/db";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

export function Watchlist() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    if (watchlist.length === 0) return;
    let cancelled = false;

    fetchTickers24h(watchlist)
      .then((tickers) => {
        if (cancelled) return;
        const map: Record<string, Row> = {};
        tickers.forEach((t) => {
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            pct: t.priceChangePercent,
          };
        });
        setRows(map);
      })
      .catch(console.error);

    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(watchlist, (tick) => {
      setRows((prev) => {
        const prevRow = prev[tick.symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "up" }));
            setTimeout(
              () =>
                setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "down" }));
            setTimeout(
              () =>
                setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          }
        }
        return {
          ...prev,
          [tick.symbol]: {
            symbol: tick.symbol,
            price: tick.close,
            pct: tick.pct,
          },
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [watchlist]);

  const loadStats = async (s: string) => {
    try {
      const sData = await chartDB.getStats(s);
      setStats(prev => ({ ...prev, [s]: sData }));
    } catch (e) {
      console.error("Failed to load stats for", s, e);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Watchlist
        </h2>
        <button
          onClick={() => openSymbolDialog(true)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Agregar símbolo"
          aria-label="Agregar al watchlist"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Símbolo</span>
        <span className="text-right">Precio</span>
        <span className="text-right">24h</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {watchlist.map((s) => {
            const row = rows[s];
            const isActive = s === symbol;
            const f = flash[s];
            return (
              <div
                key={s}
                onClick={() => setSymbol(s)}
                className={cn(
                  "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-tv-text">
                    {s.replace("USDT", "")}
                  </span>
                  <span className="text-[10px] text-tv-text-dim">USDT</span>
                </div>
                <span
                  className={cn(
                    "text-right tabular-nums transition-colors",
                    f === "up" && "text-tv-green",
                    f === "down" && "text-tv-red",
                    !f && "text-tv-text",
                  )}
                >
                  {row ? formatPrice(row.price) : "—"}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={cn(
                      "tabular-nums",
                      row
                        ? row.pct >= 0
                          ? "text-tv-green"
                          : "text-tv-red"
                        : "text-tv-text-muted",
                    )}
                  >
                    {row ? formatPct(row.pct) : "—"}
                  </span>
                  
                  <div className="flex items-center gap-0.5">
                    <DropdownMenu onOpenChange={(open) => open && loadStats(s)}>
                      <DropdownMenuTrigger
                        render={
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => e.stopPropagation()}
                            className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-white group-hover:visible cursor-pointer flex items-center justify-center"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </span>
                        }
                      />
                      <DropdownMenuContent className="w-48 bg-tv-panel border-tv-border text-tv-text" align="end">
                        <DropdownMenuLabel className="text-[10px] uppercase text-tv-text-muted flex items-center gap-1.5">
                          <Database className="w-3 h-3" />
                          Datos Descargados
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {stats[s] && Object.keys(stats[s]).length > 0 ? (
                          Object.entries(stats[s]).map(([interval, count]) => (
                            <DropdownMenuItem key={interval} className="text-[11px] flex justify-between">
                              <span className="font-medium">{interval}</span>
                              <span className="text-tv-text-muted">{count.toLocaleString()} velas</span>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="p-2 text-[10px] text-tv-text-muted italic">
                            Sin datos descargados
                          </div>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          variant="destructive"
                          className="text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(s);
                          }}
                        >
                          <X className="mr-2 h-3 w-3" />
                          Quitar de la lista
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
          {watchlist.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Tu watchlist está vacío
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
