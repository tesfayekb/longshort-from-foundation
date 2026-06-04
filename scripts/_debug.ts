import { resolveJobStateFromMigrations } from './check-handler-liveness-markers.ts';
const state = await resolveJobStateFromMigrations();
console.log("Total jobs:", state.size);
for (const [k, v] of state) console.log(k, '=>', v.enabled, v.trigger_type, v.handler_path);
