"""Smoke tests for the three live clients. Uses respx to mock httpx."""
import os
import pytest
import respx
import httpx

os.environ.setdefault("CONGRESS_API_KEY", "test-key")

from castle_eri.clients import congress, federal_register, kalshi  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_cache(tmp_path, monkeypatch):
    """Point the file cache at a fresh tmp dir per test."""
    from castle_eri.clients import _cache
    monkeypatch.setattr(_cache, "CACHE_DIR", tmp_path)


@respx.mock
async def test_congress_search_bills_parses_payload():
    payload = {
        "bills": [
            {
                "number": "1234",
                "type": "HR",
                "congress": 119,
                "title": "Solar Investment Stability Act",
                "latestAction": {"text": "Referred to Ways and Means", "actionDate": "2026-04-12"},
            }
        ]
    }
    respx.get("https://api.congress.gov/v3/bill").mock(
        return_value=httpx.Response(200, json=payload)
    )
    bills = await congress.search_bills("solar ITC")
    assert len(bills) == 1
    assert bills[0]["number"] == "1234"


@respx.mock
async def test_congress_returns_empty_on_500():
    respx.get("https://api.congress.gov/v3/bill").mock(
        return_value=httpx.Response(500, text="boom")
    )
    bills = await congress.search_bills("anything", limit=1)
    assert bills == []


@respx.mock
async def test_federal_register_parses_payload():
    payload = {"results": [{"document_number": "2026-12345", "title": "45V Final Rule", "agencies": [{"name": "IRS"}], "publication_date": "2026-03-01", "html_url": "https://example.com"}]}
    respx.get("https://www.federalregister.gov/api/v1/documents.json").mock(
        return_value=httpx.Response(200, json=payload)
    )
    docs = await federal_register.search_documents("45V hydrogen")
    assert docs[0]["document_number"] == "2026-12345"


@respx.mock
async def test_kalshi_search_markets_filters_relevant_categories_and_query():
    payload = {
        "events": [
            {
                "event_ticker": "KX48ETAXCREDIT-26MAY",
                "category": "Politics",
                "title": "Will the 48E ITC be reinstated?",
                "markets": [{
                    "ticker": "KX48ETAXCREDIT-26MAY",
                    "title": "Will 48E commercial solar ITC be reinstated before Dec 2029?",
                    "yes_ask_dollars": "0.37",
                    "volume_fp": "13.8",
                    "close_time": "2029-12-31T15:00:00Z",
                    "status": "active",
                }],
            },
            {
                "event_ticker": "KXNBACHAMP",
                "category": "Sports",
                "title": "NBA Champion",
                "markets": [{"ticker": "KXLAKERS", "title": "Lakers win", "yes_ask_dollars": "0.22"}],
            },
        ]
    }
    respx.get("https://api.elections.kalshi.com/trade-api/v2/events").mock(
        return_value=httpx.Response(200, json=payload)
    )
    hits = await kalshi.search_markets("48E")
    assert len(hits) == 1
    assert hits[0]["ticker"] == "KX48ETAXCREDIT-26MAY"
    assert hits[0]["category"] == "Politics"
    assert hits[0]["yes_price"] == 0.37
