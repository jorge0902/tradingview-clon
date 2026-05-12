import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";

const BASE = "https://api.binance.com/api/v3";

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  startTime?: number,
  endTime?: number,
): Promise<Candle[]> {
  let url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  if (startTime) url += `&startTime=${startTime}`;
  if (endTime) url += `&endTime=${endTime}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

/**
 * Fetches a large range of historical data by paginating through multiple requests.
 */
export async function fetchHistoricalRange(
  symbol: string,
  interval: Timeframe,
  startUnix: number,
  endUnix: number,
  onProgress?: (progress: number) => void
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let currentStart = startUnix * 1000;
  const targetEnd = endUnix * 1000;
  const totalDuration = targetEnd - currentStart;

  while (currentStart < targetEnd) {
    const klines = await fetchKlines(symbol, interval, 1000, currentStart, targetEnd);
    if (klines.length === 0) break;

    allCandles.push(...klines);
    
    // Update progress
    if (onProgress) {
      const progress = Math.min(100, Math.floor(((klines[klines.length - 1].time * 1000 - startUnix * 1000) / totalDuration) * 100));
      onProgress(progress);
    }

    // Next start is 1ms after the last candle
    currentStart = (klines[klines.length - 1].time + 1) * 1000;

    // Small delay to respect rate limits
    if (currentStart < targetEnd) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return allCandles;
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const url = `${BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const url = `${BASE}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

let cachedSymbols: SymbolInfo[] | null = null;
export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  cachedSymbols = data.symbols
    .filter(
      (s: { status: string; quoteAsset: string }) =>
        s.status === "TRADING" && s.quoteAsset === "USDT",
    )
    .map((s: { symbol: string; baseAsset: string; quoteAsset: string; status: string }) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
    }));
  return cachedSymbols!;
}
