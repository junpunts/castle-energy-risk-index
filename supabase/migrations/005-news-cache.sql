-- 005-news-cache.sql
-- Adapter output. One row per source item, deduped by URL. matched_archetypes
-- and matched_risks are computed at insert time by the matching logic in
-- lib/adapters/match.ts (M7). GIN indexes make "show me all news for risk X"
-- a cheap query.

create table news_cache (
  id bigserial primary key,
  source text not null,
  url text not null unique,
  title text not null,
  body text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  matched_archetypes text[],
  matched_risks text[]
);

create index idx_news_source_pub on news_cache(source, published_at desc);
create index idx_news_archetypes on news_cache using gin(matched_archetypes);
create index idx_news_risks on news_cache using gin(matched_risks);

-- service-role only
alter table news_cache enable row level security;
