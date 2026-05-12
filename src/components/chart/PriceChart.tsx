"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  // @ts-expect-error - Lightweight Charts v5 marker plugin
  createSeriesMarkers,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { ema, rsi, macd, stochastic } from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { chartDB } from "@/lib/database/db";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { ChevronDown, ChevronUp } from "lucide-react";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const stochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<any>(null);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const priceLines = useChartStore((s) => s.priceLines);
  const backtestTrades = useChartStore((s) => s.backtestTrades);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const showLegend = useChartStore((s) => s.showLegend);
  const toggleLegend = useChartStore((s) => s.toggleLegend);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      localization: {
        locale: 'es-ES',
        dateFormat: 'dd MMM \'yy',
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 35,
        barSpacing: 12,
        minBarSpacing: 1,
        fixLeftEdge: true,
        fixRightEdge: false,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
      crosshairMarkerVisible: false,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    };
  }, []);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Stochastic pane logic
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.stoch && !stochKRef.current) {
      const paneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;
      const k = chartRef.current.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1.5, crosshairMarkerVisible: false }, paneIndex);
      const d = chartRef.current.addSeries(LineSeries, { color: "#ffb74d", lineWidth: 1.5, crosshairMarkerVisible: false }, paneIndex);
      const s20 = chartRef.current.addSeries(LineSeries, { color: "#787b86", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, paneIndex);
      const s80 = chartRef.current.addSeries(LineSeries, { color: "#787b86", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, paneIndex);
      stochKRef.current = k;
      stochDRef.current = d;
      stoch20Ref.current = s20;
      stoch80Ref.current = s80;
      updateStoch();
    } else if (!indicators.stoch && stochKRef.current && chartRef.current) {
      chartRef.current.removeSeries(stochKRef.current);
      if (stochDRef.current) chartRef.current.removeSeries(stochDRef.current);
      if (stoch20Ref.current) chartRef.current.removeSeries(stoch20Ref.current);
      if (stoch80Ref.current) chartRef.current.removeSeries(stoch80Ref.current);
      stochKRef.current = null;
      stochDRef.current = null;
      stoch20Ref.current = null;
      stoch80Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.stoch, indicators.rsi, indicators.macd]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (stochKRef.current) stochKRef.current.applyOptions({ visible: v("stoch") });
    if (stochDRef.current) stochDRef.current.applyOptions({ visible: v("stoch") });
    if (stoch20Ref.current) stoch20Ref.current.applyOptions({ visible: v("stoch") });
    if (stoch80Ref.current) stoch80Ref.current.applyOptions({ visible: v("stoch") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateStoch();
  }, [config.stochK, config.stochD, config.stochSmooth]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Render backtest trades as markers on the candle series
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    
    // Convert trades to markers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers: any[] = [];
    
    // Sort trades by time to ensure markers are in chronological order (required by lightweight-charts)
    const sortedTrades = [...backtestTrades].sort((a, b) => a.entryTime - b.entryTime);
    
    sortedTrades.forEach((t) => {
      // Entry marker
      markers.push({
        time: t.entryTime as UTCTimestamp,
        position: t.side === "LONG" ? "belowBar" : "aboveBar",
        color: t.side === "LONG" ? TV_COLORS.green : TV_COLORS.red,
        shape: t.side === "LONG" ? "arrowUp" : "arrowDown",
        text: t.side === "LONG" ? "Buy" : "Sell",
        size: 2,
      });
      
      // Exit marker (if closed)
      if (t.exitTime && t.exitPrice) {
        markers.push({
          time: t.exitTime as UTCTimestamp,
          position: t.side === "LONG" ? "aboveBar" : "belowBar",
          color: (t.pnl || 0) >= 0 ? TV_COLORS.green : TV_COLORS.red,
          shape: t.side === "LONG" ? "arrowDown" : "arrowUp",
          text: `Close ${(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toFixed(0)}`,
          size: 1.5,
        });
      }
    });
    
    // Markers must be sorted by time
    markers.sort((a, b) => a.time - b.time);
    
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    } else {
      markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      candleSeriesRef.current.attachPrimitive(markersPluginRef.current);
    }
  }, [backtestTrades]);

  // Cursor style when drawing tools are active + reset measure on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" ? "crosshair" : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
  }, [tool]);

  function updateEMAs(isUpdate = false) {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    
    const updateInd = (ref: React.RefObject<ISeriesApi<"Line"> | null>, period: number) => {
      if (!ref.current) return undefined;
      if (isUpdate) {
        const lastBars = c.slice(-Math.max(period * 2, 100));
        const res = ema(lastBars, period);
        if (res.length > 0) {
          const last = res[res.length - 1];
          ref.current.update({ time: last.time as UTCTimestamp, value: last.value });
          return last.value;
        }
      } else {
        const data = ema(c, period);
        ref.current.setData(data.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
        return data.at(-1)?.value;
      }
      return undefined;
    };

    const v20 = updateInd(ema20Ref, cfg.ema20);
    const v50 = updateInd(ema50Ref, cfg.ema50);
    const v200 = updateInd(ema200Ref, cfg.ema200);
    const lastVol = c.at(-1)?.volume;

    setLastValues(prev => ({
      ...prev,
      ema20: v20 ?? prev.ema20,
      ema50: v50 ?? prev.ema50,
      ema200: v200 ?? prev.ema200,
      volume: lastVol,
    }));
  }

  function updateRSI(isUpdate = false) {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;

    if (isUpdate) {
      const lastBars = c.slice(-200);
      const res = rsi(lastBars, cfg.rsi);
      if (res.length > 0) {
        const last = res[res.length - 1];
        const val = { time: last.time as UTCTimestamp, value: last.value };
        rsiRef.current.update(val);
        rsi30Ref.current?.update({ time: last.time as UTCTimestamp, value: 30 });
        rsi70Ref.current?.update({ time: last.time as UTCTimestamp, value: 70 });
        setLastValues(prev => ({ ...prev, rsi: last.value }));
      }
    } else {
      const data = rsi(c, cfg.rsi).map(p => ({ time: p.time as UTCTimestamp, value: p.value }));
      rsiRef.current.setData(data);
      if (data.length > 0) {
        const t1 = data[0].time;
        const t2 = data[data.length - 1].time;
        rsi30Ref.current?.setData([{ time: t1, value: 30 }, { time: t2, value: 30 }]);
        rsi70Ref.current?.setData([{ time: t1, value: 70 }, { time: t2, value: 70 }]);
        setLastValues(prev => ({ ...prev, rsi: data.at(-1)?.value }));
      }
    }
  }

  function updateMACD(isUpdate = false) {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;

    if (isUpdate) {
      const lastBars = c.slice(-200);
      const m = macd(lastBars, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
      if (m.length > 0) {
        const last = m[m.length - 1];
        const t = last.time as UTCTimestamp;
        macdRef.current.update({ time: t, value: last.macd });
        macdSignalRef.current?.update({ time: t, value: last.signal });
        macdHistRef.current?.update({
          time: t,
          value: last.histogram,
          color: last.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
        });
        setLastValues(prev => ({ ...prev, macd: last.macd, macdSignal: last.signal, macdHist: last.histogram }));
      }
    } else {
      const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
      macdRef.current.setData(m.map(p => ({ time: p.time as UTCTimestamp, value: p.macd })));
      macdSignalRef.current?.setData(m.map(p => ({ time: p.time as UTCTimestamp, value: p.signal })));
      macdHistRef.current?.setData(m.map(p => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })));
      const last = m.at(-1);
      setLastValues(prev => ({ ...prev, macd: last?.macd, macdSignal: last?.signal, macdHist: last?.histogram }));
    }
  }

  function updateStoch(isUpdate = false) {
    const c = candlesRef.current;
    if (c.length === 0 || !stochKRef.current || !stochDRef.current) return;
    const cfg = configRef.current;

    if (isUpdate) {
      const lastBars = c.slice(-200);
      const res = stochastic(lastBars, cfg.stochK, cfg.stochD, cfg.stochSmooth);
      if (res.length > 0) {
        const last = res[res.length - 1];
        const t = last.time as UTCTimestamp;
        stochKRef.current.update({ time: t, value: last.k });
        stochDRef.current.update({ time: t, value: last.d });
        stoch20Ref.current?.update({ time: t, value: 20 });
        stoch80Ref.current?.update({ time: t, value: 80 });
        setLastValues(prev => ({ ...prev, stochK: last.k, stochD: last.d }));
      }
    } else {
      const data = stochastic(c, cfg.stochK, cfg.stochD, cfg.stochSmooth);
      stochKRef.current.setData(data.map(p => ({ time: p.time as UTCTimestamp, value: p.k })));
      stochDRef.current.setData(data.map(p => ({ time: p.time as UTCTimestamp, value: p.d })));
      if (data.length > 0) {
        const t1 = data[0].time as UTCTimestamp;
        const t2 = data[data.length - 1].time as UTCTimestamp;
        stoch20Ref.current?.setData([{ time: t1, value: 20 }, { time: t2, value: 20 }]);
        stoch80Ref.current?.setData([{ time: t1, value: 80 }, { time: t2, value: 80 }]);
        setLastValues(prev => ({ ...prev, stochK: data.at(-1)?.k, stochD: data.at(-1)?.d }));
      }
    }
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function load() {
      try {
        // Load local data first
        const localKlines = await chartDB.getAllCandles(symbol, timeframe);
        
        // Load recent data from Binance
        const binanceKlines = await fetchKlines(symbol, timeframe, 1000);
        
        if (cancelled) return;

        // Merge datasets using a Map to avoid duplicates (favoring Binance data for overlap)
        const candleMap = new Map<number, Candle>();
        localKlines.forEach(k => candleMap.set(k.time, k));
        binanceKlines.forEach(k => candleMap.set(k.time, k));
        
        const mergedKlines = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
        candlesRef.current = mergedKlines;

        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            mergedKlines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            mergedKlines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            })),
          );
        }
        updateEMAs();
        updateRSI();
        updateMACD();
        updateStoch();

        // If we have a lot of data, don't use fitContent as it zooms out too much.
        // Instead, scroll to the end.
        if (mergedKlines.length > 500) {
          chartRef.current?.timeScale().scrollToRealTime();
        } else {
          chartRef.current?.timeScale().fitContent();
        }
        
        requestAnimationFrame(() => recomputePaneOffsets());

        if (mergedKlines.length > 0) {
          const last = mergedKlines[mergedKlines.length - 1];
          const prev = mergedKlines[mergedKlines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        const ws = getBinanceWS();
        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe,
          onCandle: (k) => {
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              if (arr.length > 100000) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: k.time as UTCTimestamp,
                value: k.volume,
                color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
              });
            }
            // Optimized: use incremental update for indicators
            updateEMAs(true);
            updateRSI(true);
            updateMACD(true);
            updateStoch(true);
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [symbol, timeframe]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button 
            onClick={toggleLegend}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/10 text-tv-text-muted hover:text-white transition"
            title={showLegend ? "Ocultar leyendas" : "Mostrar leyendas"}
          >
            {showLegend ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
            <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
              <span className="text-tv-text">{symbol}</span>
              <span className="text-tv-text-muted">·</span>
              <span className="uppercase text-tv-text-muted">{timeframe}</span>
              <span className="text-tv-text-muted hidden md:inline">·</span>
              <span className="text-tv-text-muted hidden md:inline">Binance</span>
            </div>
            {showLegend && hover && (
              <div className="flex items-center gap-x-3 text-[11px]">
                <span className="text-tv-text-muted">
                  O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
                </span>
                <span className="text-tv-text-muted">
                  H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
                </span>
                <span className="text-tv-text-muted">
                  L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
                </span>
                <span className="text-tv-text-muted">
                  C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
                </span>
                <span className={greenOrRed(hover.pct)}>
                  {hover.pct >= 0 ? "+" : ""}
                  {hover.pct.toFixed(2)}%
                </span>
                <span className="text-tv-text-muted">
                  Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {showLegend && (
          <>
            {/* Live price */}
            <div className="flex h-7 items-center gap-2">
              {lastPrice ? (
                <>
                  <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                    {formatPrice(lastPrice.value)}
                  </span>
                  <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                    {lastPrice.pct >= 0 ? "+" : ""}
                    {lastPrice.pct.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-tv-text-muted">Cargando…</span>
              )}
            </div>

            {/* Indicator pills for the main pane */}
            <div className="mt-1 flex flex-col items-start gap-1">
              {indicators.ema20 && (
                <IndicatorPill
                  name={`EMA ${config.ema20}`}
                  value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
                  color={INDICATOR_COLORS.ema20}
                  hidden={hidden.ema20}
                  onToggleHide={() => toggleHidden("ema20")}
                  onSettings={() => setSettingsTarget("ema20")}
                  onRemove={() => removeIndicator("ema20")}
                />
              )}
              {indicators.ema50 && (
                <IndicatorPill
                  name={`EMA ${config.ema50}`}
                  value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
                  color={INDICATOR_COLORS.ema50}
                  hidden={hidden.ema50}
                  onToggleHide={() => toggleHidden("ema50")}
                  onSettings={() => setSettingsTarget("ema50")}
                  onRemove={() => removeIndicator("ema50")}
                />
              )}
              {indicators.ema200 && (
                <IndicatorPill
                  name={`EMA ${config.ema200}`}
                  value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
                  color={INDICATOR_COLORS.ema200}
                  hidden={hidden.ema200}
                  onToggleHide={() => toggleHidden("ema200")}
                  onSettings={() => setSettingsTarget("ema200")}
                  onRemove={() => removeIndicator("ema200")}
                />
              )}
              {indicators.volume && (
                <IndicatorPill
                  name="Vol"
                  value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
                  color={INDICATOR_COLORS.volume}
                  hidden={hidden.volume}
                  onToggleHide={() => toggleHidden("volume")}
                  onSettings={() => setSettingsTarget("volume")}
                  onRemove={() => removeIndicator("volume")}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* RSI pane label */}
      {showLegend && indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {showLegend && indicators.macd && paneOffsets[indicators.rsi ? 2 : 1] && (
        <div
          style={{ top: paneOffsets[indicators.rsi ? 2 : 1].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}

      {/* Stochastic pane label */}
      {showLegend && indicators.stoch && paneOffsets[(indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1] && (
        <div
          style={{ top: paneOffsets[(indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch ${config.stochK}, ${config.stochD}, ${config.stochSmooth}`}
            value={
              lastValues.stochK !== undefined
                ? `K:${lastValues.stochK.toFixed(2)} / D:${(lastValues.stochD ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.stoch}
            hidden={hidden.stoch}
            onToggleHide={() => toggleHidden("stoch")}
            onSettings={() => setSettingsTarget("stoch")}
            onRemove={() => removeIndicator("stoch")}
          />
        </div>
      )}
    </div>
  );
}
