"""Tests for new BUDGETS+ALERTS feature: total budget, alert_threshold, /api/alerts, dashboard alerts."""
import os
from datetime import datetime, timezone
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://smart-receipt-parser-2.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _month():
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ---------- Module: Total Budget Settings ----------
class TestTotalBudget:
    def setup_method(self, _):
        # ensure clean state
        requests.delete(f"{API}/settings/total-budget", timeout=15)

    def teardown_method(self, _):
        requests.delete(f"{API}/settings/total-budget", timeout=15)

    def test_get_total_budget_when_absent(self):
        r = requests.get(f"{API}/settings/total-budget", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["month"] == _month()
        assert d["total_budget"] is None

    def test_upsert_total_budget(self):
        r = requests.post(
            f"{API}/settings/total-budget",
            json={"amount": 500, "alert_threshold": 60},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 500
        assert d["alert_threshold"] == 60
        assert d["month"] == _month()
        assert "_id" not in d
        # verify via GET
        g = requests.get(f"{API}/settings/total-budget", timeout=15)
        tb = g.json()["total_budget"]
        assert tb is not None and tb["amount"] == 500 and tb["alert_threshold"] == 60

    def test_upsert_total_budget_idempotent_update(self):
        requests.post(f"{API}/settings/total-budget", json={"amount": 500, "alert_threshold": 60}, timeout=15)
        r = requests.post(
            f"{API}/settings/total-budget",
            json={"amount": 800, "alert_threshold": 90},
            timeout=15,
        )
        assert r.status_code == 200
        g = requests.get(f"{API}/settings/total-budget", timeout=15).json()["total_budget"]
        assert g["amount"] == 800
        assert g["alert_threshold"] == 90

    def test_threshold_clamped_low(self):
        r = requests.post(
            f"{API}/settings/total-budget",
            json={"amount": 1000, "alert_threshold": 10},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["alert_threshold"] == 50

    def test_threshold_clamped_high(self):
        r = requests.post(
            f"{API}/settings/total-budget",
            json={"amount": 1000, "alert_threshold": 250},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["alert_threshold"] == 100

    def test_delete_total_budget(self):
        requests.post(f"{API}/settings/total-budget", json={"amount": 1000}, timeout=15)
        d = requests.delete(f"{API}/settings/total-budget", timeout=15)
        assert d.status_code == 200
        g = requests.get(f"{API}/settings/total-budget", timeout=15)
        assert g.json()["total_budget"] is None


# ---------- Module: Budget alert_threshold ----------
class TestBudgetThreshold:
    bid = None

    def teardown_method(self, _):
        if TestBudgetThreshold.bid:
            requests.delete(f"{API}/budgets/{TestBudgetThreshold.bid}", timeout=15)
            TestBudgetThreshold.bid = None

    def test_budget_default_threshold_80(self):
        r = requests.post(f"{API}/budgets", json={"category": "Bills", "amount": 1000}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["alert_threshold"] == 80
        TestBudgetThreshold.bid = d["id"]

    def test_budget_custom_threshold_persists(self):
        r = requests.post(
            f"{API}/budgets",
            json={"category": "Transport", "amount": 2000, "alert_threshold": 70},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["alert_threshold"] == 70
        TestBudgetThreshold.bid = d["id"]
        # verify list reflects
        lst = requests.get(f"{API}/budgets", timeout=15).json()["budgets"]
        match = [b for b in lst if b["category"] == "Transport"]
        assert match and match[0]["alert_threshold"] == 70

    def test_budget_threshold_clamped(self):
        r = requests.post(
            f"{API}/budgets",
            json={"category": "Health", "amount": 500, "alert_threshold": 5},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["alert_threshold"] == 50
        TestBudgetThreshold.bid = r.json()["id"]

        r2 = requests.post(
            f"{API}/budgets",
            json={"category": "Health", "amount": 500, "alert_threshold": 999},
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["alert_threshold"] == 100


# ---------- Module: /api/alerts and dashboard alerts ----------
class TestAlerts:
    created_expenses: list = []
    created_budgets: list = []

    @classmethod
    def teardown_class(cls):
        for eid in cls.created_expenses:
            requests.delete(f"{API}/expenses/{eid}", timeout=15)
        for bid in cls.created_budgets:
            requests.delete(f"{API}/budgets/{bid}", timeout=15)
        requests.delete(f"{API}/settings/total-budget", timeout=15)

    def _make_expense(self, amount, category):
        r = requests.post(
            f"{API}/expenses",
            json={"amount": amount, "merchant": f"TEST_AL_{category}", "category": category, "date": _today()},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        TestAlerts.created_expenses.append(r.json()["id"])
        return r.json()

    def _make_budget(self, category, amount, threshold=80):
        r = requests.post(
            f"{API}/budgets",
            json={"category": category, "amount": amount, "alert_threshold": threshold},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        TestAlerts.created_budgets.append(r.json()["id"])
        return r.json()

    def test_a_no_alerts_initially(self):
        # ensure clean
        requests.delete(f"{API}/settings/total-budget", timeout=15)
        r = requests.get(f"{API}/alerts", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "alerts" in d and "count" in d
        # we don't assert == 0 because env may have other data, but structure must be valid
        assert isinstance(d["alerts"], list)

    def test_b_total_budget_over_alert(self):
        # set total budget 500 / 60% threshold, spend >500
        requests.post(
            f"{API}/settings/total-budget",
            json={"amount": 500, "alert_threshold": 60},
            timeout=15,
        )
        self._make_expense(600, "Other")  # > 500 -> "over"

        r = requests.get(f"{API}/alerts", timeout=15)
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        totals = [a for a in alerts if a.get("scope") == "total"]
        assert totals, f"no total alert: {alerts}"
        a = totals[0]
        assert a["severity"] == "over"
        assert a["limit"] == 500
        assert a["percent"] >= 100
        assert a["title"] == "Overall budget exceeded"
        assert "id" in a

    def test_c_category_warning_alert(self):
        # Food budget 100 @50% threshold; spend 60 -> warning (60%)
        self._make_budget("Food", 100, threshold=50)
        self._make_expense(60, "Food")
        r = requests.get(f"{API}/alerts", timeout=15)
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        food = [a for a in alerts if a.get("category") == "Food"]
        assert food, f"no Food alert in {alerts}"
        a = food[0]
        assert a["severity"] == "warning"
        assert a["threshold"] == 50
        assert a["limit"] == 100
        assert 50 <= a["percent"] < 100

    def test_d_category_over_alert(self):
        # Groceries budget 50 default 80% threshold; spend 120 -> over
        self._make_budget("Groceries", 50, threshold=80)
        self._make_expense(120, "Groceries")
        r = requests.get(f"{API}/alerts", timeout=15)
        alerts = r.json()["alerts"]
        groc = [a for a in alerts if a.get("category") == "Groceries"]
        assert groc and groc[0]["severity"] == "over"
        # over sorted before warning
        severities = [a["severity"] for a in alerts]
        if "warning" in severities and "over" in severities:
            assert severities.index("over") < severities.index("warning")

    def test_e_dashboard_includes_alerts_and_total_budget(self):
        d = requests.get(f"{API}/dashboard", timeout=15)
        assert d.status_code == 200
        data = d.json()
        for k in ("total_budget", "alerts", "alert_count"):
            assert k in data, f"dashboard missing {k}: {list(data.keys())}"
        assert isinstance(data["alerts"], list)
        assert data["alert_count"] == len(data["alerts"])
        # total budget set in test_b
        assert data["total_budget"] is not None
        assert data["total_budget"]["amount"] == 500
        # budgets list should still include alert_threshold per item
        for b in data["budgets"]:
            assert "alert_threshold" in b
