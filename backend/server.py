from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None


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
    return {"message": "SS Spend Tracker API"}


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

    return {
        "month": target_month,
        "total": round(total, 2),
        "count": len(items),
        "by_category": breakdown,
        "recent": recent,
        "budgets": budgets,
    }


# ----- Budgets -----
@api_router.post("/budgets")
async def upsert_budget(body: BudgetCreate):
    month = body.month or _current_month()
    category = body.category if body.category in CATEGORIES else "Other"
    existing = await db.budgets.find_one({"category": category, "month": month})
    if existing:
        await db.budgets.update_one(
            {"category": category, "month": month},
            {"$set": {"amount": float(body.amount)}},
        )
        doc = await db.budgets.find_one({"category": category, "month": month}, {"_id": 0})
    else:
        budget = Budget(category=category, amount=float(body.amount), month=month)
        await db.budgets.insert_one(budget.model_dump())
        doc = budget.model_dump()
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
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
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()

    return {"month": target_month, "budgets": budgets}


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str):
    res = await db.budgets.delete_one({"id": budget_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"success": True}


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
