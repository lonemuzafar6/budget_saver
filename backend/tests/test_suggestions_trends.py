"""Tests for /api/budget-suggestions and /api/trends endpoints (Iteration 3)."""
import os
from datetime import datetime, timezone

import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://smart-receipt-parser-2.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _prev_month_str(ym: str, n: int) -> str:
    y, m = map(int, ym.split("-"))
    total = y * 12 + (m - 1) - n
    ny, nm = divmod(total, 12)
    return f"{ny:04d}-{nm + 1:02d}"


def _round_to_hundred(x: float) -> int:
    if x <= 0:
        return 0
    return int(((x + 99) // 100) * 100)


# pick a far-past test month to avoid colliding with other tests' current-month data
TEST_END_MONTH = "2024-07"  # current month for suggestion target
# Prior months 2024-06, 2024-05, 2024-04
PRIOR_MONTHS = [
    _prev_month_str(TEST_END_MONTH, 1),
    _prev_month_str(TEST_END_MONTH, 2),
    _prev_month_str(TEST_END_MONTH, 3),
]


# ---------- Module: Budget Suggestions ----------
class TestBudgetSuggestions:
    created_ids: list = []

    @classmethod
    def setup_class(cls):
        # Seed: Food expenses across 3 prior months -- 200, 400, 600 (avg=400, *1.1=440, round=500)
        # Transport only in 2 months -- 100, 300 (avg=200 over 2 months, *1.1=220, round=300)
        # Bills only in 1 month -- 1000 (avg=1000, *1.1=1100, round=1100)
        seeds = [
            ("Food", 200, PRIOR_MONTHS[2]),
            ("Food", 400, PRIOR_MONTHS[1]),
            ("Food", 600, PRIOR_MONTHS[0]),
            ("Transport", 100, PRIOR_MONTHS[2]),
            ("Transport", 300, PRIOR_MONTHS[0]),
            ("Bills", 1000, PRIOR_MONTHS[1]),
        ]
        for cat, amt, m in seeds:
            r = requests.post(
                f"{API}/expenses",
                json={
                    "amount": amt,
                    "merchant": f"TEST_SUG_{cat}_{m}",
                    "category": cat,
                    "date": f"{m}-15",
                },
                timeout=15,
            )
            assert r.status_code == 200, r.text
            cls.created_ids.append(r.json()["id"])

    @classmethod
    def teardown_class(cls):
        for eid in cls.created_ids:
            requests.delete(f"{API}/expenses/{eid}", timeout=15)

    def test_default_shape(self):
        r = requests.get(f"{API}/budget-suggestions", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("month", "lookback_months", "suggestions", "total"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["lookback_months"], list)
        assert len(d["lookback_months"]) == 3  # default lookback
        # 8 categories regardless of data
        assert len(d["suggestions"]) == 8
        total = d["total"]
        for k in ("avg", "months_with_data", "suggested_amount", "current_amount"):
            assert k in total

    def test_seeded_food_suggestion_value(self):
        r = requests.get(
            f"{API}/budget-suggestions",
            params={"month": TEST_END_MONTH, "lookback": 3},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["lookback_months"] == PRIOR_MONTHS  # most recent first
        food = next(s for s in d["suggestions"] if s["category"] == "Food")
        # avg over non-zero months (3 months: 200,400,600)
        assert food["months_with_data"] == 3
        assert abs(food["avg"] - 400.0) < 0.01
        # 400 * 1.1 = 440 -> round to 500 (ceil hundred)
        assert food["suggested_amount"] == _round_to_hundred(400 * 1.1)
        assert food["suggested_amount"] == 500
        assert "10% buffer" in food["reason"]

    def test_seeded_transport_avg_non_zero_only(self):
        r = requests.get(
            f"{API}/budget-suggestions",
            params={"month": TEST_END_MONTH, "lookback": 3},
            timeout=15,
        )
        d = r.json()
        tr = next(s for s in d["suggestions"] if s["category"] == "Transport")
        # only 2 non-zero months (100, 300) -> avg=200
        assert tr["months_with_data"] == 2
        assert abs(tr["avg"] - 200.0) < 0.01
        # 200*1.1=220 -> 300
        assert tr["suggested_amount"] == 300

    def test_seeded_bills_one_month(self):
        r = requests.get(
            f"{API}/budget-suggestions",
            params={"month": TEST_END_MONTH, "lookback": 3},
            timeout=15,
        )
        d = r.json()
        b = next(s for s in d["suggestions"] if s["category"] == "Bills")
        assert b["months_with_data"] == 1
        assert abs(b["avg"] - 1000.0) < 0.01
        # 1000*1.1=1100 -> 1100
        assert b["suggested_amount"] == 1100

    def test_no_data_categories_zero(self):
        r = requests.get(
            f"{API}/budget-suggestions",
            params={"month": TEST_END_MONTH, "lookback": 3},
            timeout=15,
        )
        d = r.json()
        ent = next(s for s in d["suggestions"] if s["category"] == "Entertainment")
        assert ent["months_with_data"] == 0
        assert ent["suggested_amount"] == 0
        assert ent["avg"] == 0
        assert "No prior spending" in ent["reason"]

    def test_total_suggestion(self):
        r = requests.get(
            f"{API}/budget-suggestions",
            params={"month": TEST_END_MONTH, "lookback": 3},
            timeout=15,
        )
        d = r.json()
        total = d["total"]
        # Per-month totals: Apr=200+100=300, May=400+1000=1400, Jun=600+300=900
        # avg = (300+1400+900)/3 = 866.6667 *1.1=953.33 -> 1000
        assert total["months_with_data"] == 3
        assert abs(total["avg"] - ((300 + 1400 + 900) / 3)) < 0.5
        assert total["suggested_amount"] == _round_to_hundred(total["avg"] * 1.1)

    def test_lookback_clamping(self):
        # lookback > 6 should clamp to 6
        r = requests.get(f"{API}/budget-suggestions", params={"lookback": 99}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["lookback_months"]) == 6
        # lookback < 1 clamps to 1
        r = requests.get(f"{API}/budget-suggestions", params={"lookback": 0}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["lookback_months"]) == 1


# ---------- Module: Trends ----------
class TestTrends:
    created_ids: list = []
    TEST_TREND_END = "2024-11"
    # months series for 4-month window: 2024-08, 09, 10, 11
    SERIES = [
        _prev_month_str(TEST_TREND_END, 3),
        _prev_month_str(TEST_TREND_END, 2),
        _prev_month_str(TEST_TREND_END, 1),
        TEST_TREND_END,
    ]

    @classmethod
    def setup_class(cls):
        seeds = [
            ("Food", 100, cls.SERIES[0]),
            ("Food", 200, cls.SERIES[1]),
            ("Food", 300, cls.SERIES[2]),
            ("Food", 400, cls.SERIES[3]),
            ("Shopping", 500, cls.SERIES[2]),
            ("Shopping", 250, cls.SERIES[3]),
        ]
        for cat, amt, m in seeds:
            r = requests.post(
                f"{API}/expenses",
                json={
                    "amount": amt,
                    "merchant": f"TEST_TRD_{cat}_{m}",
                    "category": cat,
                    "date": f"{m}-10",
                },
                timeout=15,
            )
            assert r.status_code == 200
            cls.created_ids.append(r.json()["id"])

    @classmethod
    def teardown_class(cls):
        for eid in cls.created_ids:
            requests.delete(f"{API}/expenses/{eid}", timeout=15)

    def test_shape(self):
        r = requests.get(
            f"{API}/trends",
            params={"months": 4, "end_month": self.TEST_TREND_END},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        for k in ("months", "series_total", "by_category", "grand_total"):
            assert k in d
        assert d["months"] == self.SERIES
        assert len(d["series_total"]) == 4
        for entry in d["series_total"]:
            assert "month" in entry and "amount" in entry

    def test_per_month_aggregation(self):
        r = requests.get(
            f"{API}/trends",
            params={"months": 4, "end_month": self.TEST_TREND_END},
            timeout=15,
        )
        d = r.json()
        by_month = {p["month"]: p["amount"] for p in d["series_total"]}
        # NOTE: by_month may include other tests' data — check that our seeds are present at minimum
        assert by_month[self.SERIES[0]] >= 100  # Food 100
        assert by_month[self.SERIES[1]] >= 200  # Food 200
        assert by_month[self.SERIES[2]] >= 800  # Food 300 + Shopping 500
        assert by_month[self.SERIES[3]] >= 650  # Food 400 + Shopping 250

    def test_per_category_series(self):
        r = requests.get(
            f"{API}/trends",
            params={"months": 4, "end_month": self.TEST_TREND_END},
            timeout=15,
        )
        d = r.json()
        cats = {c["category"]: c for c in d["by_category"]}
        assert "Food" in cats
        assert "Shopping" in cats
        food = cats["Food"]
        assert len(food["values"]) == 4
        # Each month-value for Food should be at least our seeded values
        assert food["values"][0] >= 100
        assert food["values"][1] >= 200
        assert food["values"][2] >= 300
        assert food["values"][3] >= 400
        assert food["total"] >= 1000
        # avg = total / months (months=4)
        assert abs(food["avg"] - food["total"] / 4) < 0.01
        # categories with no spend should NOT appear
        # (using a category we definitely didn't seed for this end_month range)
        # Entertainment may have data from other tests — skip this strict check.

    def test_months_clamping(self):
        # months < 2 should clamp to 2
        r = requests.get(f"{API}/trends", params={"months": 1}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["months"]) == 2
        # months > 12 should clamp to 12
        r = requests.get(f"{API}/trends", params={"months": 24}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["months"]) == 12

    def test_grand_total_equals_sum(self):
        r = requests.get(
            f"{API}/trends",
            params={"months": 4, "end_month": self.TEST_TREND_END},
            timeout=15,
        )
        d = r.json()
        s = sum(p["amount"] for p in d["series_total"])
        assert abs(d["grand_total"] - s) < 0.01
