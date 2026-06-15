# Privacy Policy — BudgetSnavings

**Last updated:** 14 June 2026
**Effective date:** 14 June 2026

---

## 1. Introduction

Welcome to **BudgetSnavings** ("the App", "we", "us", "our"). BudgetSnavings is a personal-finance mobile application that helps you track your spending by reading payment-confirmation screenshots (from UPI apps such as GPay, PhonePe, Paytm, BHIM and Amazon Pay) and organising them into categories, budgets, alerts and savings goals.

This Privacy Policy explains, in plain language, **what data we collect, why, how it's used, who we share it with, how long we keep it, and the rights you have over it**. By using BudgetSnavings, you agree to the practices described here.

If you do not agree with any part of this policy, please stop using the App and uninstall it.

---

## 2. Who is the data controller

> ⚠️ **Replace before publishing:**
> **[Your full legal name or company]**
> **[Registered address]**
> **Country:** [India / your country]
> **Email:** **[your-email@example.com]** (we recommend `privacy@budgetsnavings.app`)
> **Grievance Officer (India DPDP Act):** **[Name]**, **[email]**

---

## 3. Information we collect

BudgetSnavings is designed to collect as little personal data as possible. **You do not need to create an account or log in to use the App.**

### 3.1 Information you provide directly
- **Expense details** — amount, merchant name, category, transaction date, optional note.
- **Budgets** — per-category limits, total monthly budget, alert thresholds.
- **Savings goals** — goal name, target amount, target date and contributions you record.
- **Payment screenshots** — images you choose to upload or capture for AI-powered text extraction.

### 3.2 Information collected automatically
- **Device permissions you grant** — Camera and Photos access (only used when you explicitly tap "Scan" or "Upload screenshot").
- **Basic diagnostic logs** — non-personally-identifying server logs (HTTP status, endpoint, timestamp, anonymised IP address truncated for security) used to keep the service running and detect abuse.

### 3.3 Information we **do not** collect
- Full name, phone number, email address, postal address, date of birth.
- Bank account numbers, card numbers, UPI VPAs, or any banking credentials.
- Government identifiers (Aadhaar, PAN, passport, etc.).
- Precise location (GPS / Wi-Fi triangulation).
- Contacts, calendar, SMS or call logs.
- Advertising identifiers, cross-app tracking IDs or behavioural-advertising signals.

---

## 4. How we use your information

We use the data above for the following purposes only:

| Purpose | Data used | Legal basis |
|---|---|---|
| Show your expenses, budgets, alerts and insights inside the App | Expense, budget and goal data | Contract (you signed up to use the service) |
| Extract amount / merchant / date from screenshots | The screenshot image you uploaded (sent to our AI vision provider) | Your consent (you tapped to scan) |
| Send in-app alerts when budgets are crossed | Budget thresholds + your spend | Contract |
| Keep the service running, prevent fraud and abuse | Diagnostic logs | Legitimate interest |
| Comply with legal obligations | All categories above | Legal obligation |

**We never sell your data. We never share it for behavioural advertising. We do not use it to train any third-party AI model.**

---

## 5. Third-party processors and sub-processors

To operate BudgetSnavings, we share specific data with the following processors. They act under contractual confidentiality and may not use your data for any purpose other than serving us.

| Processor | What they receive | Purpose | Location |
|---|---|---|---|
| **Emergent Labs Inc.** | All app data (encrypted at rest) | Hosts the backend, database (MongoDB), and AI routing | USA / EU |
| **Anthropic, PBC** (via Emergent's Universal LLM Key) | Payment screenshots you submit + the text prompt to extract amount/merchant/date/category | Claude Sonnet 4.5 vision OCR | USA |
| **Google LLC** (Gemini, used only one-off by us during development) | None of your data — used by the developer to generate the app's icon and splash, not at runtime | Brand asset generation | USA |
| **Apple Inc. / Google LLC** (when you install from the store) | Standard app-store telemetry | Crash reporting, install metrics | USA |

Anthropic states that data submitted via API is **not used to train its models** and is retained only for abuse-monitoring per its Trust Center. You can read Anthropic's policy at <https://www.anthropic.com/legal/privacy>.

---

## 6. Where your data is stored and security

- All persistent data is stored in **MongoDB** managed by Emergent Labs, encrypted at rest (AES-256) and in transit (TLS 1.2+).
- The App uses HTTPS for every network call.
- We follow industry-standard practices: least-privilege access, rotated credentials, automated backups, intrusion monitoring.
- Despite these measures, no system is 100 % secure. If we ever detect a personal-data breach, we will notify affected users and the relevant data-protection authority within **72 hours** as required by law.

---

## 7. Data retention

- **Expenses, budgets, goals and merchant memory** — retained as long as you keep the App installed and have not requested deletion.
- **Payment screenshots** — the image is sent to the AI vision provider for OCR and is **not stored on our servers after extraction completes**. Only the extracted text fields (amount, merchant, date, category) are saved with your expense.
- **Diagnostic logs** — rotated and deleted within **30 days**.
- **Backups** — encrypted daily backups retained for **30 days**, then permanently destroyed.

If you uninstall the App without first triggering deletion (see Section 8), your data may remain in our backups for up to 30 days before being purged automatically.

---

## 8. Your rights

Subject to local law, you have the right to:

- **Access** — request a copy of your data. We offer this in-App via the **Export CSV** feature (Insights tab → Export). It returns every expense in the chosen month as a downloadable CSV.
- **Correct** — edit any expense, budget or goal directly inside the App.
- **Delete** — delete any individual expense, budget, goal, or your **entire dataset** by writing to the email in Section 2 with the subject line "Delete my data". We will action this within **30 days** and confirm by email.
- **Portability** — receive your data in a machine-readable format (CSV via the Export feature, or JSON on request).
- **Object / restrict processing** — write to us to limit how we use your data.
- **Withdraw consent** — stop using the AI screenshot scan at any time by simply not uploading screenshots; manual entry remains available.
- **Lodge a complaint** — with your local data-protection authority:
  - **India** — Data Protection Board of India (under the DPDP Act, 2023).
  - **EU/EEA** — your national supervisory authority under the GDPR.
  - **UK** — the Information Commissioner's Office (ICO).
  - **California** — California Privacy Protection Agency (CPPA) under the CCPA / CPRA.

We do not discriminate against users who exercise their privacy rights.

---

## 9. Permissions explained

The App requests two device permissions, and only when you actively use the related feature:

| Permission | When asked | Why |
|---|---|---|
| **Photos / Gallery** | When you tap "Upload screenshot" or "Bulk import" | To let you pick the payment screenshot you want to log |
| **Camera** | When you tap "Scan with camera" | To capture a fresh photo of a receipt or payment screen |

You may deny or revoke either permission at any time from your device Settings. Denying them only disables the screenshot-scan feature — manual expense entry continues to work normally.

---

## 10. Children's privacy

BudgetSnavings is **not directed to children under 13** (or under 18, where local law sets a higher age, e.g. India's DPDP Act treats users under 18 as children). We do not knowingly collect data from children. If you believe a child has provided us data, please contact us and we will delete it.

---

## 11. International data transfers

Your data may be transferred to and stored in countries outside India (primarily the United States) where our processors operate. We rely on the following safeguards:

- **EU Standard Contractual Clauses (SCCs)** with all U.S. processors.
- **India DPDP Act compliance** — only countries on the central-government white-list (where issued) are used for storage.
- **Encryption in transit and at rest** as described in Section 6.

---

## 12. Automated decision-making and AI

The App uses an AI model (Claude Sonnet 4.5 by Anthropic) to read text from your payment screenshots. **The AI only suggests** the amount, merchant, date and category — **you remain in full control** and can edit any field before saving. The App does **not** make automated decisions that produce legal or similarly significant effects about you (such as creditworthiness, employment, etc.).

---

## 13. Cookies and tracking

The mobile App does not use web cookies. We do not use third-party analytics SDKs, advertising SDKs, or cross-app tracking identifiers (no Apple ATT prompt is required — we do not track you across other apps or websites).

---

## 14. Changes to this policy

We may update this Privacy Policy from time to time. When we make material changes, we will:
1. Update the "Last updated" date at the top.
2. Surface an in-App notice on your next launch.
3. (For substantial changes) notify you 30 days before the change takes effect via the in-App banner.

Continued use of the App after the changes take effect constitutes acceptance of the revised policy.

---

## 15. Contact us

If you have questions, requests or complaints, please contact:

> **BudgetSnavings — Privacy Team**
> Email: **[privacy@budgetsnavings.app]** *(replace with your real address)*
> Postal: **[your company address]**
> Grievance Officer: **[Name, Title]**, **[email]**

We aim to respond to every request within **15 business days**.

---

## 16. Jurisdiction and governing law

This Privacy Policy is governed by the laws of **[India / your country]**. Any dispute arising out of or in connection with this Policy shall be subject to the exclusive jurisdiction of the courts of **[city, India]**.

---

*BudgetSnavings — Snap. Spend. Save.*

---

### ⚠️ Important legal notes before publishing
1. **Replace every `[bracketed]` placeholder** with your real legal entity, address, email and grievance officer details.
2. **Host this policy at a public URL** (e.g. `https://budgetsnavings.app/privacy`). Both Apple App Store Connect and Google Play Console require a publicly accessible privacy-policy URL.
3. **Have a lawyer review the final version** for compliance with: India DPDP Act 2023, GDPR (if you serve EU users), CCPA/CPRA (California), Apple App Store Review Guideline 5.1, and Google Play Developer Policy.
4. **Update Section 5 if you add any new third-party SDKs** (analytics, crash reporting, ads, etc.) after launch.
5. If you decide to **add user accounts / Google Sign-In** later, this policy will need a new section on authentication data and you'll need to update the App Store privacy labels.
