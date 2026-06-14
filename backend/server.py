from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import csv
import io
import json
import logging
import uuid
from calendar import monthrange
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, date as date_cls

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

CATEGORIES = [
    "Food",
    "Groceries",
    "Shopping",
    "Transport",
    "Bills",
    "Entertainment",
    "Health",
    "Other",
]


# ---------- Models ----------
class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    merchant: str
    category: str = "Other"
    note: Optional[str] = ""
    date: str  # ISO yyyy-mm-dd
    source: str = "manual"  # manual | screenshot
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpenseCreate(BaseModel):
    amount: float
    merchant: str
    category: Optional[str] = "Other"
    note: Optional[str] = ""
    date: Optional[str] = None
    source: Optional[str] = "manual"


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    date: Optional[str] = None


class Budget(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    amount: float
    month: str  # YYYY-MM
    alert_threshold: int = 80  # 50..100
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None
    alert_threshold: Optional[int] = 80


class TotalBudgetUpsert(BaseModel):
    amount: float
    month: Optional[str] = None
    alert_threshold: Optional[int] = 80


class ScanRequest(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"


class ScanResponse(BaseModel):
    amount: Optional[float] = None
    merchant: Optional[str] = None
    date: Optional[str] = None
    category: Optional[str] = "Other"
    raw: Optional[str] = ""
    success: bool = True
    error: Optional[str] = None


# ---------- Helpers ----------
def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _prev_month_str(ym: str, n: int) -> str:
    y, m = map(int, ym.split("-"))
    total = y * 12 + (m - 1) - n
    ny, nm = divmod(total, 12)
    return f"{ny:04d}-{nm + 1:02d}"


def _round_to_hundred(x: float) -> int:
    if x <= 0:
        return 0
    return int(((x + 99) // 100) * 100)


def _serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "BudgetSnavings API"}


@api_router.get("/categories")
async def get_categories():
    return {"categories": CATEGORIES}


# ----- Expenses -----
@api_router.post("/expenses", response_model=Expense)
async def create_expense(body: ExpenseCreate):
    category = body.category if body.category in CATEGORIES else "Other"
    expense = Expense(
        amount=float(body.amount),
        merchant=body.merchant.strip() or "Unknown",
        category=category,
        note=body.note or "",
        date=body.date or _today_iso(),
        source=body.source or "manual",
    )
    await db.expenses.insert_one(expense.model_dump())
    await _record_merchant_memory(expense.merchant, expense.category)
    return expense


@api_router.get("/expenses")
async def list_expenses(category: Optional[str] = None, month: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if category and category != "All":
        query["category"] = category
    if month:
        query["date"] = {"$regex": f"^{month}"}
    if q:
        query["merchant"] = {"$regex": q, "$options": "i"}
    cursor = db.expenses.find(query, {"_id": 0}).sort("date", -1)
    items = await cursor.to_list(2000)
    for it in items:
        if isinstance(it.get("created_at"), datetime):
            it["created_at"] = it["created_at"].isoformat()
    return {"expenses": items}


@api_router.get("/expenses/{expense_id}")
async def get_expense(expense_id: str):
    doc = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Expense not found")
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, body: ExpenseUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "category" in updates and updates["category"] not in CATEGORIES:
        updates["category"] = "Other"
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.expenses.update_one({"id": expense_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    doc = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    res = await db.expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"success": True}


# ----- Dashboard -----
@api_router.get("/dashboard")
async def dashboard(month: Optional[str] = None):
    target_month = month or _current_month()
    cursor = db.expenses.find({"date": {"$regex": f"^{target_month}"}}, {"_id": 0})
    items = await cursor.to_list(5000)

    total = 0.0
    by_category: dict = {c: 0.0 for c in CATEGORIES}
    for it in items:
        amt = float(it.get("amount", 0))
        total += amt
        cat = it.get("category", "Other")
        if cat not in by_category:
            cat = "Other"
        by_category[cat] += amt

    recent = sorted(items, key=lambda x: (x.get("date", ""), x.get("created_at", "")), reverse=True)[:5]
    for r in recent:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()

    breakdown = [
        {"category": c, "amount": round(v, 2)}
        for c, v in by_category.items()
        if v > 0
    ]
    breakdown.sort(key=lambda x: x["amount"], reverse=True)

    # Budgets info
    bcursor = db.budgets.find({"month": target_month}, {"_id": 0})
    budgets = await bcursor.to_list(100)
    for b in budgets:
        b["spent"] = round(by_category.get(b["category"], 0.0), 2)
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()

    total_budget = await _get_total_budget(target_month)
    alerts = _compute_alerts(total, total_budget, budgets, by_category)

    return {
        "month": target_month,
        "total": round(total, 2),
        "count": len(items),
        "by_category": breakdown,
        "recent": recent,
        "budgets": budgets,
        "total_budget": total_budget,
        "alerts": alerts,
        "alert_count": len(alerts),
    }


# ----- Budgets -----
@api_router.post("/budgets")
async def upsert_budget(body: BudgetCreate):
    month = body.month or _current_month()
    category = body.category if body.category in CATEGORIES else "Other"
    threshold = max(50, min(100, int(body.alert_threshold or 80)))
    existing = await db.budgets.find_one({"category": category, "month": month})
    if existing:
        await db.budgets.update_one(
            {"category": category, "month": month},
            {"$set": {"amount": float(body.amount), "alert_threshold": threshold}},
        )
        doc = await db.budgets.find_one({"category": category, "month": month}, {"_id": 0})
    else:
        budget = Budget(
            category=category,
            amount=float(body.amount),
            month=month,
            alert_threshold=threshold,
        )
        await db.budgets.insert_one(budget.model_dump())
        doc = budget.model_dump()
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    # Ensure alert_threshold exists on older records too
    doc.setdefault("alert_threshold", 80)
    return doc


@api_router.get("/budgets")
async def list_budgets(month: Optional[str] = None):
    target_month = month or _current_month()
    cursor = db.budgets.find({"month": target_month}, {"_id": 0})
    budgets = await cursor.to_list(100)

    ecursor = db.expenses.find({"date": {"$regex": f"^{target_month}"}}, {"_id": 0})
    expenses = await ecursor.to_list(5000)
    spent_by_cat: dict = {}
    for e in expenses:
        cat = e.get("category", "Other")
        spent_by_cat[cat] = spent_by_cat.get(cat, 0.0) + float(e.get("amount", 0))

    for b in budgets:
        b["spent"] = round(spent_by_cat.get(b["category"], 0.0), 2)
        b.setdefault("alert_threshold", 80)
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()

    return {
        "month": target_month,
        "budgets": budgets,
        "total_budget": await _get_total_budget(target_month),
    }


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str):
    res = await db.budgets.delete_one({"id": budget_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"success": True}


# ----- Total Budget (per month) -----
async def _get_total_budget(month: str) -> Optional[dict]:
    doc = await db.settings.find_one(
        {"type": "total_budget", "month": month}, {"_id": 0}
    )
    if doc and isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


# ----- Merchant Memory -----
def _normalize_merchant(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


async def _record_merchant_memory(merchant: str, category: str) -> None:
    if not merchant or category not in CATEGORIES:
        return
    norm = _normalize_merchant(merchant)
    if not norm or norm == "unknown":
        return
    # Per-merchant per-category counter
    await db.merchant_memory.update_one(
        {"merchant_norm": norm, "category": category},
        {
            "$inc": {"count": 1},
            "$set": {
                "merchant_display": merchant.strip(),
                "merchant_norm": norm,
                "category": category,
                "last_seen": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )


async def _suggest_category_from_memory(merchant: str) -> Optional[str]:
    norm = _normalize_merchant(merchant)
    if not norm or norm == "unknown":
        return None
    cursor = db.merchant_memory.find({"merchant_norm": norm}, {"_id": 0}).sort(
        "count", -1
    )
    rows = await cursor.to_list(8)
    if not rows:
        return None
    # If top is overwhelmingly the most-used, return it.
    top = rows[0]
    total = sum(r.get("count", 0) for r in rows)
    if top.get("count", 0) >= 2 and top.get("count", 0) / max(total, 1) >= 0.5:
        return top.get("category")
    # Otherwise if only one category ever seen, return it
    if len(rows) == 1:
        return top.get("category")
    return None


@api_router.get("/settings/total-budget")
async def get_total_budget(month: Optional[str] = None):
    target_month = month or _current_month()
    doc = await _get_total_budget(target_month)
    return {"month": target_month, "total_budget": doc}


@api_router.post("/settings/total-budget")
async def upsert_total_budget(body: TotalBudgetUpsert):
    month = body.month or _current_month()
    threshold = max(50, min(100, int(body.alert_threshold or 80)))
    amount = float(body.amount)
    existing = await db.settings.find_one({"type": "total_budget", "month": month})
    if existing:
        await db.settings.update_one(
            {"type": "total_budget", "month": month},
            {"$set": {"amount": amount, "alert_threshold": threshold}},
        )
    else:
        await db.settings.insert_one(
            {
                "id": str(uuid.uuid4()),
                "type": "total_budget",
                "month": month,
                "amount": amount,
                "alert_threshold": threshold,
                "created_at": datetime.now(timezone.utc),
            }
        )
    return await _get_total_budget(month)


@api_router.delete("/settings/total-budget")
async def delete_total_budget(month: Optional[str] = None):
    target_month = month or _current_month()
    await db.settings.delete_one({"type": "total_budget", "month": target_month})
    return {"success": True}


# ----- Alerts -----
def _compute_alerts(
    total: float,
    total_budget: Optional[dict],
    budgets: List[dict],
    by_category: dict,
) -> List[dict]:
    alerts: List[dict] = []

    # Overall alert
    if total_budget and float(total_budget.get("amount", 0)) > 0:
        limit = float(total_budget["amount"])
        threshold = int(total_budget.get("alert_threshold", 80))
        pct = (total / limit) * 100 if limit > 0 else 0
        if pct >= 100:
            alerts.append(
                {
                    "id": f"total-{total_budget.get('month')}",
                    "scope": "total",
                    "category": None,
                    "severity": "over",
                    "spent": round(total, 2),
                    "limit": round(limit, 2),
                    "percent": round(pct, 1),
                    "threshold": threshold,
                    "title": "Overall budget exceeded",
                    "message": f"You've spent \u20B9{int(total)} of your \u20B9{int(limit)} total monthly budget.",
                }
            )
        elif pct >= threshold:
            alerts.append(
                {
                    "id": f"total-{total_budget.get('month')}",
                    "scope": "total",
                    "category": None,
                    "severity": "warning",
                    "spent": round(total, 2),
                    "limit": round(limit, 2),
                    "percent": round(pct, 1),
                    "threshold": threshold,
                    "title": "Approaching total budget",
                    "message": f"You've used {int(pct)}% of your \u20B9{int(limit)} total budget.",
                }
            )

    # Category alerts
    for b in budgets:
        limit = float(b.get("amount", 0))
        if limit <= 0:
            continue
        cat = b.get("category", "Other")
        spent = float(by_category.get(cat, 0))
        threshold = int(b.get("alert_threshold", 80))
        pct = (spent / limit) * 100 if limit > 0 else 0
        if pct >= 100:
            alerts.append(
                {
                    "id": f"cat-{cat}-{b.get('month')}",
                    "scope": "category",
                    "category": cat,
                    "severity": "over",
                    "spent": round(spent, 2),
                    "limit": round(limit, 2),
                    "percent": round(pct, 1),
                    "threshold": threshold,
                    "title": f"{cat} budget exceeded",
                    "message": f"\u20B9{int(spent)} spent vs \u20B9{int(limit)} budgeted.",
                }
            )
        elif pct >= threshold:
            alerts.append(
                {
                    "id": f"cat-{cat}-{b.get('month')}",
                    "scope": "category",
                    "category": cat,
                    "severity": "warning",
                    "spent": round(spent, 2),
                    "limit": round(limit, 2),
                    "percent": round(pct, 1),
                    "threshold": threshold,
                    "title": f"{cat} nearing budget",
                    "message": f"{int(pct)}% used (\u20B9{int(spent)} of \u20B9{int(limit)}).",
                }
            )

    # Sort: over first, then warning, then by percent desc
    alerts.sort(
        key=lambda a: (0 if a["severity"] == "over" else 1, -a["percent"])
    )
    return alerts


@api_router.get("/alerts")
async def get_alerts(month: Optional[str] = None):
    target_month = month or _current_month()
    ecursor = db.expenses.find({"date": {"$regex": f"^{target_month}"}}, {"_id": 0})
    expenses = await ecursor.to_list(5000)
    total = 0.0
    by_category: dict = {}
    for e in expenses:
        amt = float(e.get("amount", 0))
        total += amt
        cat = e.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0.0) + amt

    bcursor = db.budgets.find({"month": target_month}, {"_id": 0})
    budgets = await bcursor.to_list(100)
    total_budget = await _get_total_budget(target_month)

    alerts = _compute_alerts(total, total_budget, budgets, by_category)
    return {"month": target_month, "alerts": alerts, "count": len(alerts)}


# ----- Budget Suggestions -----
@api_router.get("/budget-suggestions")
async def budget_suggestions(month: Optional[str] = None, lookback: int = 3):
    target_month = month or _current_month()
    lookback = max(1, min(6, int(lookback)))

    # Gather lookback prior months data
    months = [_prev_month_str(target_month, i) for i in range(1, lookback + 1)]
    sums: dict = {c: [] for c in CATEGORIES}
    total_per_month: dict = {m: 0.0 for m in months}

    for m in months:
        cursor = db.expenses.find({"date": {"$regex": f"^{m}"}}, {"_id": 0})
        items = await cursor.to_list(5000)
        per_cat: dict = {}
        for it in items:
            cat = it.get("category", "Other")
            if cat not in CATEGORIES:
                cat = "Other"
            amt = float(it.get("amount", 0))
            per_cat[cat] = per_cat.get(cat, 0.0) + amt
            total_per_month[m] += amt
        for c in CATEGORIES:
            sums[c].append(per_cat.get(c, 0.0))

    # Current budgets for the target month
    bcursor = db.budgets.find({"month": target_month}, {"_id": 0})
    current_budgets = await bcursor.to_list(100)
    cur_by_cat: dict = {b["category"]: b for b in current_budgets}

    suggestions = []
    for cat in CATEGORIES:
        vals = sums[cat]
        non_zero = [v for v in vals if v > 0]
        if non_zero:
            avg = sum(non_zero) / len(non_zero)
            suggested = _round_to_hundred(avg * 1.1)  # 10% buffer
        else:
            avg = 0.0
            suggested = 0
        cur = cur_by_cat.get(cat)
        suggestions.append(
            {
                "category": cat,
                "avg": round(avg, 2),
                "months_with_data": len(non_zero),
                "suggested_amount": suggested,
                "current_amount": float(cur["amount"]) if cur else None,
                "reason": (
                    f"Based on \u20B9{int(avg)} avg/month across {len(non_zero)} prior month(s) + 10% buffer"
                    if non_zero
                    else "No prior spending in this category"
                ),
            }
        )

    # Total suggested
    total_avg_vals = [t for t in total_per_month.values() if t > 0]
    total_avg = (sum(total_avg_vals) / len(total_avg_vals)) if total_avg_vals else 0
    total_suggested = _round_to_hundred(total_avg * 1.1)

    # Existing total budget for target month
    cur_total = await _get_total_budget(target_month)

    return {
        "month": target_month,
        "lookback_months": months,
        "suggestions": suggestions,
        "total": {
            "avg": round(total_avg, 2),
            "months_with_data": len(total_avg_vals),
            "suggested_amount": total_suggested,
            "current_amount": float(cur_total["amount"]) if cur_total else None,
        },
    }


# ----- Trends -----
@api_router.get("/trends")
async def trends(months: int = 4, end_month: Optional[str] = None):
    months = max(2, min(12, int(months)))
    last = end_month or _current_month()
    ym_list = [_prev_month_str(last, i) for i in range(months - 1, -1, -1)]

    series_total: List[dict] = []
    by_category: dict = {c: [] for c in CATEGORIES}

    for ym in ym_list:
        cursor = db.expenses.find({"date": {"$regex": f"^{ym}"}}, {"_id": 0})
        items = await cursor.to_list(5000)
        month_total = 0.0
        per_cat: dict = {c: 0.0 for c in CATEGORIES}
        for it in items:
            cat = it.get("category", "Other")
            if cat not in CATEGORIES:
                cat = "Other"
            amt = float(it.get("amount", 0))
            per_cat[cat] += amt
            month_total += amt
        series_total.append({"month": ym, "amount": round(month_total, 2)})
        for c in CATEGORIES:
            by_category[c].append(round(per_cat[c], 2))

    # Build per-category response: only return categories with any spend
    cat_series = []
    for c in CATEGORIES:
        if any(v > 0 for v in by_category[c]):
            total_c = sum(by_category[c])
            cat_series.append(
                {
                    "category": c,
                    "values": by_category[c],
                    "total": round(total_c, 2),
                    "avg": round(total_c / months, 2),
                }
            )
    cat_series.sort(key=lambda x: x["total"], reverse=True)

    grand_total = sum(p["amount"] for p in series_total)
    return {
        "months": ym_list,
        "series_total": series_total,
        "by_category": cat_series,
        "grand_total": round(grand_total, 2),
    }


# ----- Scan Screenshot -----
SCAN_SYSTEM_PROMPT = (
    "You are an expert at extracting structured payment data from Indian UPI payment "
    "confirmation screenshots (GPay, PhonePe, Paytm, BHIM, Amazon Pay, etc.). "
    "Given an image, extract the transaction amount in INR, the merchant or recipient name, "
    "the transaction date (YYYY-MM-DD), and pick the most appropriate spending category "
    f"from this fixed list: {', '.join(CATEGORIES)}. "
    "Respond with ONLY a JSON object, no prose, no markdown fences. "
    'Format: {"amount": number, "merchant": string, "date": "YYYY-MM-DD" or null, "category": string}. '
    "If you cannot read a field, set it to null. If the image is not a payment screenshot, "
    'return {"amount": null, "merchant": null, "date": null, "category": "Other"}.'
)


def _extract_json_blob(text: str) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    # Strip markdown fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                return None
    return None


@api_router.post("/scan-screenshot", response_model=ScanResponse)
async def scan_screenshot(body: ScanRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    if not body.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scan-{uuid.uuid4()}",
            system_message=SCAN_SYSTEM_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        image = ImageContent(image_base64=body.image_base64)
        user_msg = UserMessage(
            text=(
                "Extract amount, merchant, date and category from this payment "
                "screenshot. Return only the JSON object."
            ),
            file_contents=[image],
        )
        raw = await chat.send_message(user_msg)
        raw_text = raw if isinstance(raw, str) else str(raw)
        data = _extract_json_blob(raw_text) or {}

        amount = data.get("amount")
        try:
            amount = float(amount) if amount is not None else None
        except (TypeError, ValueError):
            amount = None

        merchant = data.get("merchant")
        if merchant is not None:
            merchant = str(merchant).strip() or None

        date_val = data.get("date")
        if date_val and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(date_val)):
            date_val = None

        category = data.get("category") or "Other"
        if category not in CATEGORIES:
            category = "Other"

        # Override with merchant memory if we've seen this merchant before
        if merchant:
            memory_cat = await _suggest_category_from_memory(merchant)
            if memory_cat:
                category = memory_cat

        return ScanResponse(
            amount=amount,
            merchant=merchant,
            date=date_val,
            category=category,
            raw=raw_text[:500],
            success=True,
        )
    except Exception as exc:
        logging.exception("scan-screenshot failed")
        return ScanResponse(success=False, error=str(exc), category="Other")


# ---------- Merchant Memory endpoints ----------
@api_router.get("/merchants/suggest")
async def merchant_suggest(merchant: str):
    cat = await _suggest_category_from_memory(merchant)
    return {"merchant": merchant, "suggested_category": cat}


@api_router.get("/merchants")
async def list_merchants():
    cursor = db.merchant_memory.find({}, {"_id": 0}).sort("count", -1)
    rows = await cursor.to_list(200)
    for r in rows:
        if isinstance(r.get("last_seen"), datetime):
            r["last_seen"] = r["last_seen"].isoformat()
    return {"merchants": rows}


# ---------- Anomaly Detection ----------
@api_router.get("/anomalies")
async def get_anomalies(month: Optional[str] = None, factor: float = 2.0):
    target_month = month or _current_month()
    factor = max(1.5, min(5.0, float(factor)))

    # Look at previous 3 months as history baseline
    history_months = [_prev_month_str(target_month, i) for i in range(1, 4)]
    hist_cursor = db.expenses.find(
        {"date": {"$regex": "^(" + "|".join(history_months) + ")"}}, {"_id": 0}
    )
    history = await hist_cursor.to_list(10000)

    # Aggregate per-merchant average from history
    by_merchant_hist: dict = {}
    for it in history:
        m = _normalize_merchant(it.get("merchant", ""))
        if not m:
            continue
        by_merchant_hist.setdefault(m, []).append(float(it.get("amount", 0)))

    merchant_avg: dict = {}
    for m, arr in by_merchant_hist.items():
        if len(arr) >= 2:
            merchant_avg[m] = sum(arr) / len(arr)

    # This month's expenses
    cur_cursor = db.expenses.find({"date": {"$regex": f"^{target_month}"}}, {"_id": 0})
    current = await cur_cursor.to_list(5000)

    anomalies = []
    for it in current:
        m = _normalize_merchant(it.get("merchant", ""))
        amt = float(it.get("amount", 0))
        avg = merchant_avg.get(m)
        if avg and avg > 0 and amt >= avg * factor:
            anomalies.append(
                {
                    "id": it.get("id"),
                    "merchant": it.get("merchant"),
                    "amount": round(amt, 2),
                    "average": round(avg, 2),
                    "ratio": round(amt / avg, 2),
                    "category": it.get("category"),
                    "date": it.get("date"),
                    "message": f"\u20B9{int(amt)} is {round(amt / avg, 1)}\u00d7 your usual at {it.get('merchant')} (~\u20B9{int(avg)}).",
                }
            )

    anomalies.sort(key=lambda a: -a["ratio"])
    return {"month": target_month, "anomalies": anomalies, "count": len(anomalies)}


# ---------- CSV Export ----------
@api_router.get("/export/csv", response_class=PlainTextResponse)
async def export_csv(month: Optional[str] = None):
    target_month = month or _current_month()
    cursor = db.expenses.find(
        {"date": {"$regex": f"^{target_month}"}}, {"_id": 0}
    ).sort("date", 1)
    rows = await cursor.to_list(10000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Merchant", "Category", "Amount (INR)", "Source", "Note"])
    for r in rows:
        writer.writerow(
            [
                r.get("date", ""),
                r.get("merchant", ""),
                r.get("category", ""),
                f"{float(r.get('amount', 0)):.2f}",
                r.get("source", ""),
                r.get("note", ""),
            ]
        )

    headers = {
        "Content-Disposition": f'attachment; filename="budgetsnavings-{target_month}.csv"',
        "Content-Type": "text/csv; charset=utf-8",
    }
    return PlainTextResponse(content=buf.getvalue(), headers=headers, media_type="text/csv")


# ---------- Savings Goals ----------
class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[str] = None  # YYYY-MM-DD


class GoalContribute(BaseModel):
    amount: float


@api_router.post("/goals")
async def create_goal(body: GoalCreate):
    goal = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip() or "Untitled goal",
        "target_amount": float(body.target_amount),
        "target_date": body.target_date,
        "contributed": 0.0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.goals.insert_one(goal)
    goal.pop("_id", None)
    goal["created_at"] = goal["created_at"].isoformat()
    return goal


@api_router.get("/goals")
async def list_goals():
    cursor = db.goals.find({}, {"_id": 0}).sort("created_at", -1)
    rows = await cursor.to_list(200)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        t = float(r.get("target_amount", 0))
        c = float(r.get("contributed", 0))
        r["progress_percent"] = round((c / t * 100) if t > 0 else 0, 1)
        r["remaining"] = round(max(t - c, 0), 2)
    return {"goals": rows}


@api_router.post("/goals/{goal_id}/contribute")
async def contribute_goal(goal_id: str, body: GoalContribute):
    amt = float(body.amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    res = await db.goals.update_one(
        {"id": goal_id}, {"$inc": {"contributed": amt}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    doc = await db.goals.find_one({"id": goal_id}, {"_id": 0})
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str):
    res = await db.goals.delete_one({"id": goal_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"success": True}


# ---------- Safe to spend today ----------
@api_router.get("/safe-to-spend")
async def safe_to_spend(month: Optional[str] = None):
    target_month = month or _current_month()
    # Sum this month's spend
    ecursor = db.expenses.find({"date": {"$regex": f"^{target_month}"}}, {"_id": 0})
    expenses = await ecursor.to_list(5000)
    spent = sum(float(e.get("amount", 0)) for e in expenses)

    total_budget = await _get_total_budget(target_month)
    budget_amount = float(total_budget["amount"]) if total_budget else 0

    # Days remaining in target month (today's date if same month, else last day)
    today = datetime.now(timezone.utc).date()
    y, m = map(int, target_month.split("-"))
    last_day = monthrange(y, m)[1]
    if today.year == y and today.month == m:
        day_in_month = today.day
    elif (today.year, today.month) > (y, m):
        day_in_month = last_day
    else:
        day_in_month = 1
    days_remaining = max(1, last_day - day_in_month + 1)

    remaining_budget = max(budget_amount - spent, 0) if budget_amount > 0 else 0
    safe_per_day = remaining_budget / days_remaining if budget_amount > 0 else 0

    return {
        "month": target_month,
        "spent": round(spent, 2),
        "budget": round(budget_amount, 2),
        "remaining_budget": round(remaining_budget, 2),
        "days_remaining": days_remaining,
        "safe_per_day": round(safe_per_day, 2),
        "has_budget": budget_amount > 0,
    }


# ---------- Wire up ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
