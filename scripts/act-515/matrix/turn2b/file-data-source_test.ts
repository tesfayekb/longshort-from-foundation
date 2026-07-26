import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FileR1DataSource, stageACloseKey } from './file-data-source.ts';

async function makeTempCache(): Promise<{ dir: string; barsPairsPath: string }> {
  const dir = await Deno.makeTempDir({ prefix: 'file-r1-' }) + '/';
  await Deno.writeTextFile(`${dir}calendar.jsonl`,
    `{"session":"2024-01-02"}\n{"session":"2024-01-03"}\n{"session":"2024-01-04"}\n`);
  await Deno.writeTextFile(`${dir}cellmap.jsonl`,
    `{"side":"long","band":"L_10_INF","window_days":2,"momentum_quintile":4,"drawdown_bucket":1,"exclusion_width_days":5,"arrival_count":10,"mean_fwd_return_1d":"0.01","mean_fwd_return_5d":"0.02","mean_fwd_return_20d":"0.03","median_fwd_return_5d":"0.01","hit_rate_5d":"0.5"}\n`);
  await Deno.writeTextFile(`${dir}universe.jsonl`,
    `{"ticker":"AAPL","source":"seed","added_as_of":"2024-01-01","active":true,"gics_sector":"Tech","sector_source":"fmp"}\n{"trailer":true,"active_count":1}\n`);
  await Deno.writeTextFile(`${dir}slate-2024.jsonl`,
    `{"session":"2024-01-02","side":"long","slate_rank":1,"tier":"T2","band":"L_10_INF","ticker":"AAPL","event_id":1,"window_days":4,"momentum_quintile":3,"drawdown_bucket":4,"move_pct":"0.1","short_excess_at_argmax":null,"excess_w1":null,"excess_w2":null,"excess_w3":null,"excess_w4":null,"excess_w5":null,"days_to_nearest_earnings":null,"mean_fwd_return_5d":"0.01","rank_score":"0.01"}\n`);
  const barsPairsPath = `${dir}bars-pairs.jsonl`;
  await Deno.writeTextFile(barsPairsPath,
    `{"ticker":"AAPL","trade_date":"2024-01-03","open":"150.00","high":"151","low":"149","close":"150.5","volume":"100"}\n`);
  return { dir, barsPairsPath };
}

Deno.test('FileR1DataSource — end-to-end read from temp cache', async () => {
  const { dir, barsPairsPath } = await makeTempCache();
  const ds = new FileR1DataSource({ cacheDir: dir, slateYears: [2024], barsPairsPath });
  const corpus = await ds.fetchCorpus();
  assertEquals(corpus.length, 1);
  assertEquals(corpus[0].eventId, 1);
  const cells = await ds.fetchCellMap();
  assertEquals(cells.length, 1);
  assertEquals(cells[0].meanFwdReturn5d, 0.02);
  const uni = await ds.fetchUniverse();
  assertEquals(uni.length, 1);
  assert(uni[0].active);
  const cal = await ds.fetchSessions('2024-01-02', '2024-01-04');
  assertEquals(cal, ['2024-01-02','2024-01-03','2024-01-04']);
  const bars = await ds.fetchBarsChunk(['AAPL'], ['2024-01-03']);
  assertEquals(bars.size, 1);
  const closes = await ds.loadStageACloses();
  assertEquals(closes.get(stageACloseKey('AAPL','2024-01-03')), 150);
});