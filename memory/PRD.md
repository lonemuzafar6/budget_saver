# SS Spend Tracker — Product Requirements Document

## Vision
A personal expense tracker for India that turns UPI payment screenshots (GPay, PhonePe, Paytm, BHIM, Amazon Pay) into auto-categorised expenses. No data entry — just snap, review, save.

## MVP Scope (delivered)
- **AI screenshot OCR** → Claude Sonnet 4.5 vision (`claude-sonnet-4-5-20250929` via `emergentintegrations`) extracts amount, merchant, date, and suggests a category.
- **Manual fallback** → user can still type expenses by hand.
- **Edit before save** → AI output is always editable.
- **Categories** (fixed 8): Food, Groceries, Shopping, Transport, Bills, Entertainment, Health, Other. Each with its own icon + color.
- **Dashboard** (Home tab) → monthly total + donut chart + recent transactions.
- **Transactions tab** → search, category chip filter (horizontal, sticky), swipe-to-delete, tap to edit.
- **Budgets** (Budgets tab):
  - **Total monthly budget** card with editable amount + alert threshold (50–100% picker).
  - **Per-category budgets** with their own configurable alert thresholds (50–100%), independent of each other.
  - Progress bar coloring adapts to each budget's threshold: green normally → orange at threshold → red at 100%.
- **Alerts**:
  - In-app alert banner on Home (top of dashboard) when any budget crosses its threshold.
  - Bell icon with badge count in Home + Budgets headers.
  - Dedicated `/alerts` screen listing all active alerts (overall + per-category) with severity pill, progress bar, spent-of-limit, and percent.
  - Two severities: `warning` (≥ threshold) and `over` (≥ 100%).
- **Insights tab** → bar chart per category, top-5 with % share.
- **Currency** INR (₹).
- **No authentication** — single-user local app.

## Architecture
- **Frontend**: React Native (Expo SDK 54) + expo-router file-based routing, react-native-gifted-charts, react-native-gesture-handler (swipe), expo-image-picker, expo-blur (tab bar glassmorphism on iOS).
- **Backend**: FastAPI + Motor (MongoDB async).
- **AI**: `emergentintegrations.llm.chat.LlmChat` with Anthropic provider, using shared `EMERGENT_LLM_KEY`.

## API
- `GET /api/categories`
- `GET|POST|PATCH|DELETE /api/expenses[/{id}]` (filters: `?category=&month=&q=`)
- `GET /api/dashboard?month=YYYY-MM`
- `GET|POST|DELETE /api/settings/total-budget?month=YYYY-MM` — overall monthly budget + alert threshold
- `GET /api/alerts?month=YYYY-MM` — list of active alerts (overall + category, severity sorted)
- `GET|POST /api/budgets`, `DELETE /api/budgets/{id}` — per-category budgets now accept `alert_threshold` (50-100)
- `POST /api/scan-screenshot` { image_base64, mime_type } → { amount, merchant, date, category, success }

## Tested
- Backend: 20/20 pytest tests passing (CRUD, dashboard aggregation, budget upsert, scan-screenshot end-to-end with real UPI screenshot — Claude returned amount ≈ 487.5 and merchant "Swiggy" correctly).
- Frontend: navigation, manual add, edit, delete, budget set + progress bar, charts all verified on mobile viewport.

## Out of scope (future)
- Multi-user / cloud sync
- Recurring expenses
- Export to CSV / PDF
- Multi-currency
