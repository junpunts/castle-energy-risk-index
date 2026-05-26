-- 006-pipeline-input.sql
-- Adds input_json to pipeline_runs so the orchestrator can pass a stage-input
-- payload at enqueue time (e.g. the changes packet for daily_refresh, or the
-- stub evidence for agent_smoke_test). The runtime already reads run.input_json
-- (see lib/pipeline/runtime.ts), so this just closes the schema gap.

alter table pipeline_runs
  add column if not exists input_json jsonb;
