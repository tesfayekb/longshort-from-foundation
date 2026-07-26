import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWindows, packBatches, MAX_CARRY_DEFAULT } from './window-batcher.ts';
import type { AdmittedLotForBars, Window } from './window-batcher.ts';

const CAL = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-08','2024-01-09','2024-01-10','2024-01-11','2024-01-12','2024-01-16','2024-01-17','2024-01-18','2024-01-19','2024-01-22','2024-01-23','2024-01-24','2024-01-25','2024-01-26','2024-01-29'];
const idx = new Map(CAL.map((s,i)=>[s,i]));
const offset = {
  sessionAfter: (s: string, n: number) => CAL[(idx.get(s) ?? -1) + n] ?? null,
  lastSession: () => CAL[CAL.length - 1],
};

Deno.test('buildWindows — long T1 event-anchor +6+maxCarry', () => {
  const lot: AdmittedLotForBars = {
    lotId: 'lot1', ticker: 'X', side: 'long', tier: 'T1',
    eventDate: '2024-01-02', entryDate: '2024-01-04', // +2
  };
  const { windows } = buildWindows([lot], offset);
  // event+6 = index 0+6=6=2024-01-10; +maxCarry(5)=idx 11 = 2024-01-18
  assertEquals(windows[0].from, '2024-01-04');
  assertEquals(windows[0].to, '2024-01-18');
  void MAX_CARRY_DEFAULT;
});

Deno.test('buildWindows — short entry-anchor +4+maxCarry', () => {
  const lot: AdmittedLotForBars = {
    lotId: 'lot2', ticker: 'Y', side: 'short', tier: 'T2',
    eventDate: '2024-01-02', entryDate: '2024-01-03',
  };
  const { windows } = buildWindows([lot], offset);
  // entry+4=idx 1+4=5=2024-01-09; +5=idx 10=2024-01-17
  assertEquals(windows[0].to, '2024-01-17');
});

Deno.test('buildWindows — clamp when anchor walks off calendar', () => {
  const lot: AdmittedLotForBars = {
    lotId: 'clamp', ticker: 'Z', side: 'long', tier: 'T2',
    eventDate: '2024-01-25', entryDate: '2024-01-26',
  };
  const { windows, clampedLotIds } = buildWindows([lot], offset);
  assertEquals(windows[0].to, offset.lastSession());
  assertEquals(clampedLotIds, ['clamp']);
});

Deno.test('packBatches — splits on window count and sum-days caps', () => {
  const w: Window[] = Array.from({ length: 7 }, (_, i) => ({ ticker: `T${i}`, from: '2024-01-01', to: '2024-01-05' })); // 5 days each
  const batches = packBatches(w, { maxPerReq: 3, sumDaysCap: 100 });
  assertEquals(batches.map(b => b.windows.length), [3, 3, 1]);
  const daysCapped = packBatches(w, { maxPerReq: 100, sumDaysCap: 10 });
  // 5 days per window, cap=10 → 2 windows per batch
  assertEquals(daysCapped.map(b => b.windows.length), [2, 2, 2, 1]);
});

Deno.test('packBatches — refuses window larger than cap alone', () => {
  const w: Window[] = [{ ticker: 'X', from: '2024-01-01', to: '2024-12-31' }];
  assertThrows(() => packBatches(w, { sumDaysCap: 10 }), Error, 'single window');
});