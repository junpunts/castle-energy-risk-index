-- 007-news-cache-embedding.sql
-- Adds an `embedding` column to news_cache so the matcher can fold semantic
-- similarity into its score, alongside the existing keyword matcher.
--
-- Stored as jsonb (array of 1536 floats from text-embedding-3-small) rather
-- than pgvector — at our scale (hundreds to a few thousand rows) the
-- TS-side cosine similarity is cheap, and skipping pgvector keeps the
-- migration friction-free. If we later need server-side nearest-neighbour
-- search at scale, swap to vector(1536) + ivfflat index.

alter table news_cache
  add column if not exists embedding jsonb;

create index if not exists idx_news_cache_embedded
  on news_cache ((embedding is not null));
