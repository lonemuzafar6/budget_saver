"""Backend API tests for SS Spend Tracker."""
import os
import io
import base64
import time
from datetime import datetime, timezone

import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://smart-receipt-parser-2.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

CATEGORIES = ["Food", "Groceries", "Shopping", "Transport", "Bills", "Entertainment", "Health", "Other"]


# ---------- Module: Categories ----------
class TestCategories:
    def test_get_categories(self):
        r = requests.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        assert data["categories"] == CATEGORIES
        assert len(data["categories"]) == 8


# ---------- Module: Expense CRUD ----------
class TestExpenseCRUD:
    created_ids: list = []

    def test_create_expense(self):
        payload = {
            "amount": 245.5,
            "merchant": "TEST_Swiggy",
            "category": "Food",
            "note": "lunch",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        r = requests.post(f"{API}/expenses", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 245.5
        assert d["merchant"] == "TEST_Swiggy"
        assert d["category"] == "Food"
        assert "id" in d
        TestExpenseCRUD.created_ids.append(d["id"])

    def test_create_invalid_category_defaults_to_other(self):
        r = requests.post(
            f"{API}/expenses",
            json={"amount": 10, "merchant": "TEST_X", "category": "Bogus"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["category"] == "Other"
        TestExpenseCRUD.created_ids.append(r.json()["id"])

    def test_get_expense(self):
        assert TestExpenseCRUD.created_ids, "no expense created"
        eid = TestExpenseCRUD.created_ids[0]
        r = requests.get(f"{API}/expenses/{eid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == eid
        assert "_id" not in r.json()

    def test_get_expense_not_found(self):
        r = requests.get(f"{API}/expenses/nonexistent-id", timeout=15)
        assert r.status_code == 404

    def test_list_expenses(self):
        r = requests.get(f"{API}/expenses", timeout=15)
        assert r.status_code == 200
        assert "expenses" in r.json()
        ids = [e["id"] for e in r.json()["expenses"]]
        assert TestExpenseCRUD.created_ids[0] in ids

    def test_list_expenses_filter_category(self):
        r = requests.get(f"{API}/expenses", params={"category": "Food"}, timeout=15)
        assert r.status_code == 200
        for e in r.json()["expenses"]:
            assert e["category"] == "Food"

    def test_list_expenses_filter_q(self):
        r = requests.get(f"{API}/expenses", params={"q": "TEST_Swiggy"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["expenses"]
        assert any("TEST_Swiggy" in e["merchant"] for e in items)

    def test_patch_expense(self):
        eid = TestExpenseCRUD.created_ids[0]
        r = requests.patch(
            f"{API}/expenses/{eid}",
            json={"amount": 500, "category": "Shopping"},
            timeout=15,
        )
        assert r.status_code == 200
        # verify via GET
        g = requests.get(f"{API}/expenses/{eid}", timeout=15)
        assert g.json()["amount"] == 500
        assert g.json()["category"] == "Shopping"

    def test_patch_expense_not_found(self):
        r = requests.patch(f"{API}/expenses/nonexistent", json={"amount": 1}, timeout=15)
        assert r.status_code == 404

    def test_patch_expense_empty(self):
        eid = TestExpenseCRUD.created_ids[0]
        r = requests.patch(f"{API}/expenses/{eid}", json={}, timeout=15)
        assert r.status_code == 400

    def test_zz_delete_expense(self):
        # cleanup all created
        for eid in TestExpenseCRUD.created_ids:
            r = requests.delete(f"{API}/expenses/{eid}", timeout=15)
            assert r.status_code == 200
            # verify 404 on subsequent GET
            g = requests.get(f"{API}/expenses/{eid}", timeout=15)
            assert g.status_code == 404


# ---------- Module: Dashboard ----------
class TestDashboard:
    expense_id = None

    def test_dashboard_with_data(self):
        # create one expense for current month
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.post(
            f"{API}/expenses",
            json={"amount": 123.45, "merchant": "TEST_Dash", "category": "Bills", "date": today},
            timeout=15,
        )
        assert r.status_code == 200
        TestDashboard.expense_id = r.json()["id"]

        d = requests.get(f"{API}/dashboard", timeout=15)
        assert d.status_code == 200
        data = d.json()
        for k in ("month", "total", "count", "by_category", "recent", "budgets"):
            assert k in data, f"missing {k}"
        assert data["total"] >= 123.45
        assert data["count"] >= 1
        cats = [c["category"] for c in data["by_category"]]
        assert "Bills" in cats
        assert isinstance(data["recent"], list)

    def test_zz_cleanup(self):
        if TestDashboard.expense_id:
            requests.delete(f"{API}/expenses/{TestDashboard.expense_id}", timeout=15)


# ---------- Module: Budgets ----------
class TestBudgets:
    budget_id = None
    expense_id = None

    def test_upsert_budget(self):
        r = requests.post(
            f"{API}/budgets",
            json={"category": "Food", "amount": 5000},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["category"] == "Food"
        assert d["amount"] == 5000
        TestBudgets.budget_id = d["id"]

    def test_upsert_budget_idempotent(self):
        # set to different amount; should upsert, not duplicate
        r = requests.post(
            f"{API}/budgets",
            json={"category": "Food", "amount": 7500},
            timeout=15,
        )
        assert r.status_code == 200
        # list and ensure only one Food entry for current month
        l = requests.get(f"{API}/budgets", timeout=15)
        assert l.status_code == 200
        food = [b for b in l.json()["budgets"] if b["category"] == "Food"]
        assert len(food) == 1
        assert food[0]["amount"] == 7500

    def test_list_budgets_spent(self):
        # create expense in Food
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.post(
            f"{API}/expenses",
            json={"amount": 200, "merchant": "TEST_B", "category": "Food", "date": today},
            timeout=15,
        )
        TestBudgets.expense_id = r.json()["id"]

        l = requests.get(f"{API}/budgets", timeout=15)
        assert l.status_code == 200
        food = [b for b in l.json()["budgets"] if b["category"] == "Food"]
        assert food and food[0]["spent"] >= 200

    def test_zz_cleanup(self):
        if TestBudgets.budget_id:
            requests.delete(f"{API}/budgets/{TestBudgets.budget_id}", timeout=15)
        if TestBudgets.expense_id:
            requests.delete(f"{API}/expenses/{TestBudgets.expense_id}", timeout=15)


# ---------- Module: Scan Screenshot (Claude vision) ----------
def _make_upi_screenshot_b64() -> str:
    """Render a realistic-looking UPI payment screenshot."""
    W, H = 480, 800
    img = Image.new("RGB", (W, H), (245, 247, 250))
    draw = ImageDraw.Draw(img)
    try:
        font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 38)
        font_med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except Exception:
        font_big = ImageFont.load_default()
        font_med = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    # Header (Google Pay style)
    draw.rectangle([0, 0, W, 110], fill=(26, 115, 232))
    draw.text((20, 36), "Google Pay", fill="white", font=font_med)
    draw.text((20, 70), "Payment successful", fill="white", font=font_sm)

    # Green check circle
    draw.ellipse([W // 2 - 40, 150, W // 2 + 40, 230], fill=(52, 168, 83))
    draw.text((W // 2 - 18, 170), "OK", fill="white", font=font_med)

    # Amount
    draw.text((W // 2 - 90, 260), "Rs 487.50", fill=(20, 20, 20), font=font_big)
    draw.text((W // 2 - 55, 315), "Paid to", fill=(90, 90, 90), font=font_sm)

    # Merchant
    draw.text((W // 2 - 70, 345), "Swiggy Foods", fill=(20, 20, 20), font=font_med)

    # Card box
    draw.rectangle([20, 420, W - 20, 720], outline=(220, 220, 220), width=2)
    today = datetime.now(timezone.utc).strftime("%d %b %Y")
    draw.text((40, 440), f"Date: {today}", fill=(40, 40, 40), font=font_sm)
    draw.text((40, 480), "From: yourname@okhdfcbank", fill=(40, 40, 40), font=font_sm)
    draw.text((40, 520), "To: swiggy@ybl", fill=(40, 40, 40), font=font_sm)
    draw.text((40, 560), "UPI Ref: 412598732145", fill=(40, 40, 40), font=font_sm)
    draw.text((40, 600), "Category: Food order", fill=(40, 40, 40), font=font_sm)
    draw.text((40, 660), "Transaction ID: T2501150847", fill=(120, 120, 120), font=font_sm)

    # add textural noise (small dots) so it's not uniform
    for i, x in enumerate(range(0, W, 11)):
        draw.point((x, 380 + (i % 7)), fill=(200, 200, 210))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


class TestScanScreenshot:
    def test_scan_missing_image(self):
        r = requests.post(f"{API}/scan-screenshot", json={"image_base64": ""}, timeout=30)
        assert r.status_code == 400

    def test_scan_real_screenshot(self):
        b64 = _make_upi_screenshot_b64()
        r = requests.post(
            f"{API}/scan-screenshot",
            json={"image_base64": b64, "mime_type": "image/jpeg"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "success" in data
        # log result for visibility
        print("SCAN RESULT:", data)
        if not data.get("success"):
            pytest.fail(f"Scan failed: {data.get('error')}")
        # category must be one of allowed
        assert data.get("category") in CATEGORIES
        # We expect Claude to read 487.50 and merchant Swiggy
        assert data.get("amount") is not None, f"amount missing in {data}"
        assert abs(float(data["amount"]) - 487.5) < 5, f"amount mismatch: {data}"
        assert data.get("merchant") and "swiggy" in data["merchant"].lower(), f"merchant: {data}"
