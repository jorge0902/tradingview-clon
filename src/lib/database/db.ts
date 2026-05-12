import { openDB, type IDBPDatabase } from "idb";
import type { Candle, Timeframe } from "../binance/types";

const DB_NAME = "tradingview_gratis_db";
const STORE_NAME = "candles";
const VERSION = 1;

export interface DBMetadata {
  symbol: string;
  interval: Timeframe;
  startTime: number;
  endTime: number;
  count: number;
}

/**
 * IndexedDB management for historical candles.
 */
class ChartDB {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private async getDB() {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            // Store candles with a composite key: "symbol:interval:time"
            db.createObjectStore(STORE_NAME);
          }
        },
      });
    }
    return this.dbPromise;
  }

  private getKey(symbol: string, interval: Timeframe, time: number) {
    return `${symbol}:${interval}:${time}`;
  }

  async saveCandles(symbol: string, interval: Timeframe, candles: Candle[]) {
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const candle of candles) {
      await store.put(candle, this.getKey(symbol, interval, candle.time));
    }

    await tx.done;
  }

  async getCandles(symbol: string, interval: Timeframe, startTime: number, endTime: number): Promise<Candle[]> {
    const db = await this.getDB();
    const range = IDBKeyRange.bound(
      this.getKey(symbol, interval, startTime),
      this.getKey(symbol, interval, endTime)
    );

    const candles: Candle[] = [];
    let cursor = await db.transaction(STORE_NAME).store.openCursor(range);

    while (cursor) {
      candles.push(cursor.value);
      cursor = await cursor.continue();
    }

    return candles.sort((a, b) => a.time - b.time);
  }

  async clearData(symbol: string, interval: Timeframe) {
    const db = await this.getDB();
    const range = IDBKeyRange.bound(
      this.getKey(symbol, interval, 0),
      this.getKey(symbol, interval, Infinity)
    );
    const tx = db.transaction(STORE_NAME, "readwrite");
    let cursor = await tx.store.openCursor(range);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export const chartDB = new ChartDB();
