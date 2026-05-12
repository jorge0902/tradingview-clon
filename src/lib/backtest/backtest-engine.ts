import type { Candle } from "../binance/types";

export type PositionSide = "LONG" | "SHORT" | "FLAT";

export interface Trade {
  id: string;
  side: "LONG" | "SHORT";
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface BacktestResult {
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  profitFactor: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  trades: Trade[];
  equityCurve: { time: number; equity: number }[];
}

export interface StrategyContext {
  candle: Candle;
  index: number;
  data: Candle[];
  position: PositionSide;
  entryPrice: number | null;
  buy: () => void;
  sell: () => void;
  close: () => void;
}

export type StrategyFunction = (ctx: StrategyContext) => void;

/**
 * Engine to run a backtest over a set of historical candles.
 */
export class BacktestEngine {
  private initialBalance = 10000; // $10,000 default
  private balance = 10000;
  private position: PositionSide = "FLAT";
  private positionSize = 0; // Amount of asset
  private entryPrice: number | null = null;
  private currentTrade: Trade | null = null;
  private trades: Trade[] = [];
  private equityCurve: { time: number; equity: number }[] = [];

  constructor(initialBalance = 10000) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
  }

  public run(candles: Candle[], strategy: StrategyFunction): BacktestResult {
    // Reset state
    this.balance = this.initialBalance;
    this.position = "FLAT";
    this.positionSize = 0;
    this.entryPrice = null;
    this.currentTrade = null;
    this.trades = [];
    this.equityCurve = [];

    let peakEquity = this.initialBalance;
    let maxDrawdown = 0;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      // Calculate current equity
      let currentEquity = this.balance;
      if (this.position === "LONG" && this.entryPrice) {
        const unrealized = (candle.close - this.entryPrice) * this.positionSize;
        currentEquity += unrealized;
      } else if (this.position === "SHORT" && this.entryPrice) {
        const unrealized = (this.entryPrice - candle.close) * this.positionSize;
        currentEquity += unrealized;
      }

      this.equityCurve.push({ time: candle.time, equity: currentEquity });

      // Update max drawdown
      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const drawdown = (peakEquity - currentEquity) / peakEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      // Provide context to strategy
      const ctx: StrategyContext = {
        candle,
        index: i,
        data: candles,
        position: this.position,
        entryPrice: this.entryPrice,
        buy: () => {
          if (this.position === "SHORT") this.closePosition(candle.close, candle.time);
          if (this.position === "FLAT") this.openPosition("LONG", candle.close, candle.time);
        },
        sell: () => {
          if (this.position === "LONG") this.closePosition(candle.close, candle.time);
          if (this.position === "FLAT") this.openPosition("SHORT", candle.close, candle.time);
        },
        close: () => {
          if (this.position !== "FLAT") this.closePosition(candle.close, candle.time);
        }
      };

      try {
        strategy(ctx);
      } catch (err) {
        console.error("Strategy error at index", i, err);
      }
    }

    // Close any open position at the end
    if (this.position !== "FLAT" && candles.length > 0) {
      this.closePosition(candles[candles.length - 1].close, candles[candles.length - 1].time);
    }

    // Calculate metrics
    const winningTrades = this.trades.filter(t => (t.pnl || 0) > 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const losingTrades = this.trades.filter(t => (t.pnl || 0) <= 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    
    return {
      initialBalance: this.initialBalance,
      finalBalance: this.balance,
      netProfit: this.balance - this.initialBalance,
      profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss,
      winRate: this.trades.length > 0 ? (winningTrades.length / this.trades.length) * 100 : 0,
      maxDrawdown: maxDrawdown * 100,
      totalTrades: this.trades.length,
      trades: this.trades,
      equityCurve: this.equityCurve
    };
  }

  private openPosition(side: "LONG" | "SHORT", price: number, time: number) {
    this.position = side;
    this.entryPrice = price;
    // For simplicity, we use 99% of balance to account for potential fees
    const investAmount = this.balance * 0.99; 
    this.positionSize = investAmount / price;
    
    this.currentTrade = {
      id: Math.random().toString(36).substr(2, 9),
      side,
      entryTime: time,
      entryPrice: price,
    };
  }

  private closePosition(price: number, time: number) {
    if (!this.currentTrade || !this.entryPrice) return;

    let pnl = 0;
    if (this.position === "LONG") {
      pnl = (price - this.entryPrice) * this.positionSize;
    } else {
      pnl = (this.entryPrice - price) * this.positionSize;
    }

    // Apply a simulated 0.1% fee on round trip
    const fee = (this.balance * 0.001);
    pnl -= fee;

    this.balance += pnl;

    this.currentTrade.exitTime = time;
    this.currentTrade.exitPrice = price;
    this.currentTrade.pnl = pnl;
    this.currentTrade.pnlPercent = (pnl / (this.entryPrice * this.positionSize)) * 100;
    
    this.trades.push(this.currentTrade);

    this.position = "FLAT";
    this.entryPrice = null;
    this.positionSize = 0;
    this.currentTrade = null;
  }
}
