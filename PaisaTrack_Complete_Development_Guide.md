# PaisaTrack --- Complete Product, Architecture, and Implementation Specification

**Document type:** Implementation guide for an AI coding agent\
**Product:** PaisaTrack --- private personal expense tracker\
**Version:** 1.0\
**Status:** Development specification\
**Primary user:** One individual using an iPhone 17 for daily expense
entry and a Windows laptop for development\
**Primary currency:** Indian Rupee (INR, ₹)\
**Primary timezone:** Device-local timezone; display and date semantics
must be consistent\
**Architecture:** Offline-first Progressive Web App (PWA), no
application backend in the initial release\
**Data policy:** Local-first, manual backup/restore, no automatic cloud
synchronization\
**Language:** English for the initial release, with Indian
number/currency formatting\
**Audience:** Coding agents and developers implementing the product from
this document

------------------------------------------------------------------------

## 0. Instructions to the Coding Agent

This document is the source of truth for the first release. Read it
fully before implementing. Do not replace explicit requirements with
assumptions that change financial semantics, data ownership, privacy, or
backup behavior.

### 0.1 Execution rules

1.  Build the app in small, testable phases. Do not attempt to generate
    the entire application in one unverified code dump.
2.  Inspect the repository before making changes. If it already contains
    work, preserve useful code and reconcile it with this specification
    rather than overwriting it blindly.
3.  Establish a working baseline and run tests after each phase.
4.  Keep TypeScript strict. Avoid `any`; when unavoidable at an external
    boundary, validate and narrow the value immediately.
5.  Keep UI components separate from parsing, transaction rules,
    database access, calculations, and backup logic.
6.  Treat persisted financial data as user-owned and valuable. Never
    silently clear, replace, normalize destructively, or discard
    existing data.
7.  Never invent successful persistence, backup, restore, or import
    status. Show success only after the operation actually completes.
8.  Use deterministic parsing only. No LLM, remote AI, or external
    categorization API in v1.
9.  Do not add analytics, advertising SDKs, telemetry, remote fonts, or
    unnecessary third-party scripts.
10. Do not implement cloud accounts, cloud database synchronization, or
    a backend in v1.
11. Do not expose secrets in frontend code. Prefer no API keys or
    secrets at all in the initial architecture.
12. Write unit tests for financial calculations, transaction parsing,
    data migrations, and backup validation.
13. Keep the interface optimized for touch, narrow screens, and iPhone
    safe areas.
14. Make accessibility and clear error states part of implementation,
    not post-launch cleanup.
15. If a requirement is ambiguous, prefer the safer behavior: ask the
    user, preserve the existing data, and avoid a silent transaction
    mutation.

### 0.2 Definition of done

The product is not complete merely because it renders. It is complete
only when: - transaction data persists across app restarts and page
refreshes; - all monetary calculations use integer paise internally; -
transaction creation, editing, deletion, refunds, and transfers follow
the rules in this document; - the chat parser refuses to silently save
ambiguous input; - calendar and reports agree with transaction
records; - JSON backup can be exported and restored with validation; -
corrupt or incompatible backup files cannot destructively overwrite
valid records; - the PWA app shell and core features work offline after
a successful first load and caching; - the app can be installed on the
iPhone Home Screen from Safari over HTTPS; - tests cover the required
edge cases; - the UI is usable on a real iPhone 17; - known limitations
are documented in the app and this guide.

------------------------------------------------------------------------

# 1. Product Vision

PaisaTrack is a private, reliable, mobile-first expense tracker that
makes daily financial record-keeping fast enough to become a habit.

The main interaction is a chat-like input. The user types short
natural-language messages such as: - `150 food` - `shopping - 2000` -
`200 fuel yesterday` - `salary 36000` - `received 5000 from freelance` -
`250 food cash`

The app interprets the text locally, presents a review card, and saves
the transaction only after the user confirms it. The user can then
review records in a calendar, edit or delete them, inspect spending
charts, set category budgets, and export backups.

## 1.1 Product principles

### Speed

Adding a routine transaction should require only a few seconds and
minimal taps.

### Accuracy over convenience

A guessed category or date is worse than a clarification prompt. The app
must not silently save ambiguous financial data.

### Privacy by default

The first release stores data locally on the device. It does not need an
account, remote database, AI API, or analytics service.

### Offline-first

Core functions must continue to work when the device is offline, after
the app has been loaded and its app shell cached.

### Recoverability

The app must provide explicit export and restore tools. Local browser
storage is not a guaranteed permanent backup.

### One source of truth

Transactions are the canonical financial ledger. Dashboards and reports
are derived from transactions rather than separately maintained totals
that can drift out of sync.

### Transparent behavior

Every save, edit, delete, export, import, and restore operation must
communicate its outcome clearly.

## 1.2 Goals

-   Record income and expenses through a deterministic chat parser.
-   Correctly store transaction amounts and local transaction dates.
-   Review and manage transactions by day, week, month, category, and
    description.
-   Display reliable income, spending, net expenses, budget use, and
    savings summaries.
-   Allow users to create and manage categories.
-   Support manual JSON backup/restore and CSV export.
-   Provide an installable, responsive PWA for iPhone 17.
-   Keep the initial implementation maintainable and testable.

## 1.3 Non-goals for v1

Do not implement these unless explicitly requested after v1: - Native
iOS application built with Swift/Xcode. - App Store distribution. - Bank
account linking or automatic bank transaction imports. - UPI or payment
processing. - Cloud synchronization or multi-device live sync. - User
accounts or authentication server. - AI/LLM-based transaction parsing. -
Receipt OCR or image scanning. - Investment portfolio management. - Tax
filing. - Shared household finances. - Automatic SMS, email, or
notification scraping. - A FastAPI, PostgreSQL, Redis, or other
application backend. - A claim that browser-local data is encrypted at
rest by the app. - Automatic recurring transaction posting unless the
user explicitly approves that feature.

------------------------------------------------------------------------

# 2. Target Environment and Usage

## 2.1 Primary use

-   Daily use on an iPhone 17.
-   Development on a Windows laptop using VS Code.
-   Access through Safari and the iOS Home Screen PWA installation.
-   Initial data storage local to the iPhone's browser origin.
-   Currency INR.
-   Locale `en-IN`.
-   No account registration.

## 2.2 Installation and hosting

The development server may run on Windows for desktop development. To
install a PWA on iPhone: 1. Build the production frontend. 2. Host the
production build on an HTTPS origin. 3. Open that HTTPS URL in Safari on
the iPhone. 4. Use Safari's Share menu and choose **Add to Home
Screen**. 5. Launch the installed icon and test all core workflows.

Do not promise that a `localhost` URL on the Windows laptop is
accessible from the iPhone. For local device testing, the iPhone and
laptop may need to be on the same network and the development server
must bind to a reachable interface; HTTPS and iOS development
constraints should be checked. Production installation should use HTTPS.

## 2.3 Data isolation

Browser storage is associated with the site's origin and browser storage
context. Do not assume data entered in a development origin will appear
in the production origin. Do not assume data entered in Safari will
automatically be shared with another browser or an unrelated installed
app context.

A user may lose local records if they clear website data, remove
relevant browser data, change the origin, or encounter device/browser
storage loss. Backup/restore is therefore mandatory.

------------------------------------------------------------------------

# 3. Product Information Architecture

## 3.1 Primary navigation

Use a fixed or sticky bottom navigation suitable for one-handed use,
with five sections:

1.  **Home** --- current-period summary and recent transactions.
2.  **Quick Add** --- primary chat-like transaction input.
3.  **Calendar** --- date-based history.
4.  **Insights** --- analytics and budgets.
5.  **Settings** --- categories, accounts, backup/restore, preferences,
    and app information.

Use accessible text labels with icons. Do not make icons the only
accessible names. Keep the bottom navigation clear of the iPhone home
indicator by using safe-area insets.

## 3.2 Global interaction rules

-   Every screen must handle loading, empty, success, and error states.
-   All buttons must perform a real action.
-   Destructive actions require confirmation.
-   Save buttons must be disabled while a save is in progress to avoid
    accidental double submissions.
-   Forms must preserve entered values when validation fails.
-   Focus and keyboard behavior must be usable on mobile.
-   The app must not rely on hover to reveal essential controls.
-   Touch targets should generally be at least 44 by 44 CSS pixels.
-   Avoid horizontal overflow at common iPhone widths.
-   Do not place critical actions underneath the iOS safe area or
    virtual keyboard.

------------------------------------------------------------------------

# 4. Detailed Feature Requirements

## 4.1 Home dashboard

### 4.1.1 Purpose

Show the user a concise and accurate picture of their financial activity
for the selected period.

### 4.1.2 Default period

Current calendar month, using the device-local date. Provide a period
selector to navigate to previous months. If future periods are
supported, show them clearly as future periods and do not fabricate
actual transactions.

### 4.1.3 Summary metrics

Show: - Total income for the selected period. - Total gross expenses for
the selected period. - Total refunds for the selected period. - Net
expenses, calculated as expenses minus refunds. - Remaining from
recorded income, calculated as income minus net expenses. - Savings rate
when income is greater than zero. - Today's spending. - Number of
transactions in the selected period. - Highest-spending categories. -
Recent transactions.

Clearly label "remaining from recorded income" so it is not confused
with an actual bank balance. An account balance is a separate metric
derived from opening balance and account ledger movements.

### 4.1.4 Dashboard rules

-   Derive all figures from the transaction database and active filters.
-   Never hardcode demonstration amounts into the live dashboard.
-   Empty state should explain how to add the first transaction.
-   Use INR formatting, for example `₹1,23,456.78`.
-   If income is zero, savings rate should be shown as unavailable or an
    em dash, not Infinity or NaN.
-   Refunds should reduce net expenses; they should not automatically
    count as new income.
-   Transfers must not count as income or expenses.
-   Editing/deleting a transaction must update all relevant dashboard
    values.

## 4.2 Chat-style Quick Add

### 4.2.1 Purpose

The main entry point for fast daily recording.

### 4.2.2 User flow

1.  User opens Quick Add.
2.  User enters text.
3.  User submits using the send button or keyboard action.
4.  The local parser creates a proposed transaction.
5.  The UI displays a review card.
6.  The user may edit amount, type, category, account, date, and
    description.
7.  The user confirms.
8.  The transaction service validates and persists the record.
9.  The app confirms success and refreshes dependent views.
10. The input is cleared only after successful save.

### 4.2.3 No silent saving

The parser must never write directly to the database. Parsing produces a
draft only. Database writes occur only after explicit user confirmation.

### 4.2.4 Accepted example phrases

-   `150 food`
-   `shopping - 2000`
-   `200 fuel yesterday`
-   `salary 36000`
-   `received 5000 from freelance`
-   `spent 300 on lunch`
-   `refund 250 shopping`
-   `250 food cash`

The parser should support common word order variations, case-insensitive
matching, known category aliases, and clear date words. Do not attempt
unconstrained natural-language understanding in v1.

### 4.2.5 Parsing rules

-   Amounts must be positive and finite.
-   A leading minus sign may be accepted as a separator in a recognized
    pattern such as `shopping - 2000`, but must not be interpreted as a
    negative transaction amount.
-   Store monetary amounts as integer paise.
-   Support rupee amounts with optional decimal places, for example
    `₹150`, `150.50`, and `INR 150.50`.
-   Reject ambiguous multi-amount text unless a defined rule can safely
    parse it.
-   Do not infer a category from a merchant name unless an explicit
    alias or rule maps it.
-   Use category aliases such as `food`, `meal`, and `lunch` only when
    their mapping is unambiguous.
-   `salary` is a strong income keyword.
-   `received` generally signals income, but if the phrase is unclear,
    ask for confirmation.
-   `refund` signals a refund, not ordinary income.
-   `transfer` must trigger a transfer draft that includes source and
    destination accounts.
-   `yesterday` and `today` must resolve against the device-local date
    at the time of entry.
-   Unknown category: ask the user to choose a category or create one.
-   Unknown transaction type: ask whether it is income, expense, refund,
    or transfer.
-   Do not parse arbitrary dates beyond the explicitly supported set
    without confirmation.
-   Preserve the original input text in the draft for context.

### 4.2.6 Parser output

Return a typed parse result, not an unstructured object. Suggested
variants: - `success` with a transaction draft and confidence/ambiguity
notes. - `needs_clarification` with one or more missing fields. -
`invalid` with a user-readable explanation.

Do not use a numerical confidence score to justify silently saving
uncertain financial entries. Explicit ambiguity flags are preferable.

### 4.2.7 Chat interface behavior

-   Keep a visible text input and send action.
-   Show recent entry confirmations in the conversation area.
-   Show review cards for parsed drafts.
-   Allow editing a draft before saving.
-   Preserve the draft after validation errors.
-   Provide a clear cancel action.
-   Do not pretend to be a remote AI chatbot; this is a deterministic
    local command interface.
-   Explain supported patterns through examples in an expandable help
    section.

## 4.3 Transaction list and transaction detail

### Required operations

-   Create transaction.
-   Read transaction details.
-   Edit transaction.
-   Delete transaction after confirmation.
-   Search description.
-   Filter by type.
-   Filter by category.
-   Filter by account.
-   Filter by date range.
-   Sort newest/oldest and amount ascending/descending.
-   Open a transaction from the dashboard or calendar.

### Validation

-   Amount must be greater than zero.
-   Amount must fit the safe supported monetary range.
-   Transaction date must be a valid local date.
-   Category must exist and be compatible with transaction type.
-   Account must exist and be active, unless a deliberate
    historical-account policy permits an archived account.
-   Refund link, if present, must refer to an existing compatible
    expense.
-   Transfer must include a valid source and destination account, and
    they must differ.
-   Description length should be limited to a reasonable size, such as
    300 characters.
-   Invalid records must not be persisted.

### Deletion

Use either a carefully implemented soft-delete strategy or a confirmed
hard delete. If soft delete is used, all reports must exclude deleted
records by default, and backup/export behavior must explicitly state
whether deleted records are included. Do not introduce a partially
implemented deletion system. For v1, hard deletion after a clear
confirmation is acceptable, provided backups remain the user's recovery
path.

## 4.4 Calendar

### Required behavior

-   Display a month grid.
-   Navigate to previous and next months.
-   Highlight the selected day.
-   Indicate dates with transactions.
-   Display a compact daily spending value where space permits.
-   Tap a day to view transactions for that date.
-   Provide daily income, gross expenses, refunds, and net expenses.
-   Add a transaction for the selected date.
-   Edit or delete a transaction from the selected day's list.

### Date rules

-   Use local date strings (`YYYY-MM-DD`) for calendar-day identity.
-   Avoid converting a date-only value through UTC in a way that shifts
    it to the previous or next day.
-   Use the device-local timezone for the default "today."
-   Historical transactions must retain their original transaction date
    after edits to description, amount, category, or account.
-   Month boundaries must be tested across year changes and leap years.

## 4.5 Categories

### Default expense categories

Suggested initial categories: - Food - Groceries - Rent - Fuel -
Transport - Shopping - Bills & Utilities - Phone & EMI - Health -
Fitness - Entertainment - Travel - Education - Personal Care - Gifts -
Miscellaneous

### Default income categories

-   Salary
-   Freelance
-   Business
-   Interest
-   Gift Received
-   Refunds (if represented in category UI; refund transaction semantics
    must remain distinct)
-   Other Income

### Category management

-   Add a category.
-   Edit its name, icon, color, and aliases.
-   Archive a category.
-   Prevent deletion of a category referenced by existing transactions
    unless transactions are reassigned first.
-   Prevent duplicate active category names of the same transaction
    type, case-insensitively.
-   Prevent an income category from being used for a standard expense
    unless explicitly modeled as a compatible category.
-   Category archival must not remove historical reporting data.
-   Parser aliases must not conflict ambiguously across active
    categories. If aliases conflict, require resolution or remove the
    conflict.

## 4.6 Income

Income is a first-class transaction type, not an unstructured note.

Required examples: - Monthly salary. - Freelance income. - Cash
received. - Other legitimate income.

Rules: - Income increases "remaining from recorded income." - Refunds
reduce net expenses and do not count as ordinary income by default. -
Transfers between the user's own accounts are not income. - If the user
receives money from another source, record it as income. - Salary can be
recorded manually or by chat entry. - Do not create automatic recurring
income records in v1 unless the user explicitly confirms each generated
transaction.

## 4.7 Refunds

Refunds should be modeled explicitly.

-   A refund has a positive `amountPaise` and transaction type `refund`.
-   A refund reduces net expenses in overall and category reporting.
-   If a refund links to an original expense, use `refundOfId`.
-   A refund must not exceed the remaining refundable amount of the
    original transaction unless the user explicitly confirms an
    exception and the data model is designed to support it.
-   An unlinked refund can be allowed with a category and description.
-   Refunds should appear in the transaction history and be visibly
    distinguished from income and expenses.
-   If a refund is categorized, use the associated expense category by
    default when possible.

## 4.8 Transfers and accounts

Accounts are included in the schema to prevent future redesign, even if
v1 launches with a single default account.

A transfer is a movement between the user's own accounts: - It has a
source account and a destination account. - It creates a debit movement
from the source and a credit movement to the destination, linked by a
common transfer group ID, or uses an equivalent atomic transfer
representation. - It must not be counted as income or expense. - A
transfer must be saved atomically: both sides are created, or neither
is. - Source and destination must differ. - Account balances must be
derived from opening balance plus ledger movements. - Credit card
purchases and credit card bill payments need distinct treatment to
prevent double-counting. If full credit-card liability accounting is not
implemented in v1, clearly label the account as a basic payment account
and do not claim accurate credit-card debt tracking.

## 4.9 Budgets

### v1 budget features

-   Set a weekly or monthly limit per expense category.
-   Show limit, spent, and remaining amount.
-   Show percent used.
-   Show an alert style when a budget is near or over its limit.
-   Do not block transactions merely because a budget is exceeded.
-   Budget spending uses net expenses for the category, with refunds
    reducing the amount spent.
-   A budget belongs to a specific period start date and category.
-   Validate duplicate budgets for the same category and period.
-   Budget history should remain interpretable if a category is
    archived.

### Formula

`remainingBudgetPaise = limitPaise - netCategoryExpensesPaise`

The result may be negative if the budget is exceeded. Do not clamp it to
zero in the data layer; the UI can show a clear "over budget" amount.

## 4.10 Analytics and insights

### Required reports

-   Daily spending.
-   Weekly spending.
-   Monthly income vs expenses.
-   Category-wise net expense distribution.
-   Monthly spending trend.
-   Current-period budget use.
-   Highest-spending categories.
-   Comparison with previous period.
-   Savings rate when income is positive.

### Rules

-   Use consistent period boundaries.
-   Do not count transfers as income or expenses.
-   Subtract refunds from expense totals.
-   Clearly label gross expenses and net expenses when both are
    displayed.
-   Do not infer financial advice from incomplete records.
-   Empty periods must show zero or a clear empty state, not broken
    charts.
-   Charts need accessible text summaries or labels.
-   Use `Intl.NumberFormat` with `en-IN` and `INR` for display.

## 4.11 Search and filters

Provide: - Text search over description. - Date range. - Category. -
Transaction type. - Account. - Amount range if feasible. - Sort by date
and amount.

Search and filter state should be clear and resettable. Do not make a
filter silently change the global dashboard period without a visible
indication.

## 4.12 Settings

Settings should include: - Currency display (INR fixed for v1;
multi-currency is not in scope). - Theme: light, dark, system. - Week
start preference. - Default account. - Category management. - Backup and
restore. - Export CSV. - Database/app version. - Privacy statement
explaining local storage and its limitations. - Clear all data,
protected by explicit confirmation and a recommendation to export a
backup first. - Optional reminder preference for manual backups;
browser/PWA reminder behavior must be honest about iOS limitations.

## 4.13 Backup and restore

### JSON backup

Include: - Format name and version. - Export timestamp. - App/database
schema version. - Currency and relevant settings. - Categories. -
Accounts. - Transactions. - Budgets. - Any other persistent
configuration needed to restore the user's state.

Do not include runtime caches, service-worker state, or temporary UI
state.

### Backup validation

Before restore: - Parse JSON safely. - Check the expected format
identifier. - Check supported version. - Validate all required fields
and types. - Validate integer paise values. - Validate category/account
references. - Validate transaction types. - Validate dates. - Validate
refund and transfer relationships. - Reject malformed or unsupported
input with a clear error. - Do not mutate the existing database before
validation completes.

### Restore semantics

Offer an explicit choice: 1. **Replace existing data** --- show a
warning, require confirmation, and use an atomic/transactional process
where possible. 2. **Merge/restore without duplicates** --- deduplicate
by stable IDs and validate collisions.

If merge semantics create conflicts (same ID but different contents), do
not silently overwrite. Present a conflict summary or reject the merge
and explain the issue.

Use a database transaction to replace/merge tables where supported. If
the operation fails, roll back to the previous consistent state.

### CSV export

-   Include transaction ID, transaction date, type, amount in INR,
    category, account, description, creation timestamp, and relevant
    links.
-   Define whether refunds and transfers are included; include all
    transaction types and label them explicitly.
-   Escape commas, quotation marks, and newlines according to CSV rules.
-   Use UTF-8 and ensure rupee symbols survive export.
-   Warn that CSV is for analysis and is not a full-fidelity restore
    format.
-   Do not claim that a CSV export includes all category aliases,
    settings, budgets, or database metadata.

### File handling

-   Generate the file locally.
-   Use a user-initiated download/share action compatible with Safari.
-   Show success only after the file generation and initiated
    download/share flow completes as far as the browser can confirm.
-   Explain that the user should save the backup somewhere safe. The app
    cannot guarantee the backup is stored outside the device unless the
    user completes that action.

------------------------------------------------------------------------

# 5. Architecture and Code Organization

## 5.1 Stack

-   React
-   TypeScript with strict mode
-   Vite
-   Vanilla CSS
-   Dexie.js for IndexedDB
-   Recharts for charts
-   date-fns for date operations
-   Zod for runtime validation
-   lucide-react for icons
-   vite-plugin-pwa for manifest/service worker
-   Vitest
-   React Testing Library
-   jsdom or a supported browser-test environment for component tests

Do not install packages that are not needed. Review package health,
licensing, maintenance, and dependencies before adding new packages.

## 5.2 Layer boundaries

### UI layer

React components render state and dispatch user actions. UI components
must not directly manipulate IndexedDB or contain financial formulas.

### Feature layer

Feature modules implement user-facing workflows: chat entry,
transactions, calendar, dashboard, analytics, categories, budgets, and
backup.

### Service layer

Services enforce business rules and coordinate persistence: -
`transactionService` - `reportingService` - `categoryService` -
`budgetService` - `accountService` - `backupService`

### Parsing layer

`parseTransaction.ts` converts raw text into a typed draft or
clarification result. It must be pure wherever possible and must not
access the database or perform writes.

### Data layer

Dexie database definitions, schema versions, repositories, and
transaction-safe persistence.

### Utility layer

Money conversion, currency formatting, date handling, IDs, validation
helpers, and error mapping.

## 5.3 Suggested project tree

``` text
paisatrack/
├── public/
│   ├── icons/
│   └── favicon.svg
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── navigation.ts
│   ├── components/
│   │   ├── BottomNav.tsx
│   │   ├── AmountDisplay.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorMessage.tsx
│   │   └── LoadingState.tsx
│   ├── features/
│   │   ├── dashboard/
│   │   ├── chat-entry/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TransactionDraftCard.tsx
│   │   │   ├── parseTransaction.ts
│   │   │   └── parseTransaction.test.ts
│   │   ├── transactions/
│   │   ├── calendar/
│   │   ├── categories/
│   │   ├── accounts/
│   │   ├── budgets/
│   │   ├── analytics/
│   │   ├── search/
│   │   └── backup/
│   ├── db/
│   │   ├── database.ts
│   │   ├── schema.ts
│   │   ├── migrations.ts
│   │   └── seed.ts
│   ├── services/
│   │   ├── transactionService.ts
│   │   ├── reportingService.ts
│   │   ├── categoryService.ts
│   │   ├── accountService.ts
│   │   ├── budgetService.ts
│   │   └── backupService.ts
│   ├── hooks/
│   ├── utils/
│   │   ├── money.ts
│   │   ├── dates.ts
│   │   ├── ids.ts
│   │   └── errors.ts
│   ├── styles/
│   │   ├── variables.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   └── components.css
│   ├── types/
│   │   └── index.ts
│   ├── test/
│   │   └── setup.ts
│   └── main.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── index.html
├── manifest.webmanifest
├── vite.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

The exact file tree can evolve, but keep equivalent separation of
responsibilities.

------------------------------------------------------------------------

# 6. Database Design

## 6.1 General rules

-   Database name: `paisatrack`.
-   Storage engine: IndexedDB.
-   Wrapper: Dexie.js.
-   All IDs: UUID strings.
-   Money: integer paise.
-   Transaction dates: `YYYY-MM-DD` local-date strings.
-   Creation/update timestamps: ISO 8601 timestamps.
-   Validate persisted records at service boundaries and import
    boundaries.
-   Use schema version upgrades.
-   Never silently reset the database after an error.

## 6.2 `transactions` table

Recommended fields:

  ---------------------------------------------------------------------------
  Field               Type                          Required Meaning
  ------------------- ---------------- --------------------- ----------------
  `id`                string UUID                        Yes Stable record
                                                             identity

  `type`              enum                               Yes `income`,
                                                             `expense`,
                                                             `refund`,
                                                             `transfer`

  `amountPaise`       safe integer                       Yes Positive
                                                             absolute amount

  `categoryId`        string or null                 Depends Category
                                                             reference

  `accountId`         string or null                 Depends Account
                                                             reference for
                                                             ordinary
                                                             transaction

  `description`       string                             Yes User-provided
                                                             explanation

  `transactionDate`   date string                        Yes Date the
                                                             financial event
                                                             belongs to

  `createdAt`         ISO timestamp                      Yes Record creation
                                                             time

  `updatedAt`         ISO timestamp                      Yes Last
                                                             modification
                                                             time

  `source`            enum                               Yes `chat`, `form`,
                                                             `import`

  `transferGroupId`   string or null           Transfer only Links transfer
                                                             sides

  `refundOfId`        string or null                Optional Original expense
                                                             link

  `deletedAt`         timestamp or                  Optional Only if soft
                      null                                   deletion is
                                                             selected
  ---------------------------------------------------------------------------

### Transaction type semantics

-   `income`: money received from an external source.
-   `expense`: money spent.
-   `refund`: money returned from a previous expense or an unlinked
    refund.
-   `transfer`: money moved between accounts owned by the user.

Prefer an explicit transfer model. If transfers are stored as two
transaction records, make the relationship and account movement
unambiguous, and ensure reports exclude both records from income and
expense totals. If a dedicated `transfers` table is introduced, document
how account balances and exports derive from it. Do not mix two
incompatible representations.

## 6.3 `categories` table

Fields: - `id` - `name` - `type` (`income` or `expense`) - `icon` -
`color` - `aliases` (array of strings) - `isArchived` - `createdAt` -
`updatedAt`

Rules: - Category names are unique case-insensitively within a type
among active categories. - Aliases should be normalized to lowercase and
trimmed. - Conflicting aliases across active categories must be
prevented or explicitly resolved. - Archiving does not delete historical
references. - Default categories are seeded exactly once.

## 6.4 `accounts` table

Fields: - `id` - `name` - `type` (`cash`, `bank`, `credit_card`,
`other`) - `openingBalancePaise` - `openingBalanceDate` - `isArchived` -
`createdAt` - `updatedAt`

Account semantics must be carefully documented. A simple payment account
ledger is not a full accounting treatment of credit card liabilities. Do
not label a basic credit-card record as a fully reconciled liability
ledger unless credit purchases, payments, refunds, and outstanding
balance are all correctly modeled.

## 6.5 `budgets` table

Fields: - `id` - `categoryId` - `period` (`weekly` or `monthly`) -
`periodStart` - `limitPaise` - `createdAt` - `updatedAt`

Validation: - `limitPaise` must be a non-negative safe integer; whether
zero budgets are permitted should be defined consistently. Recommended:
require a positive limit for active budgets. - Category must be an
active or historically valid expense category. - Duplicate budgets for
the same category, period type, and period start are not allowed. -
Budget usage is derived from net category expenses for that period.

## 6.6 `settings` table

A single record can contain: - `id` fixed to a known key such as
`app-settings` - `currency` = `INR` - `locale` = `en-IN` - `theme` =
`system` \| `light` \| `dark` - `weekStartsOn` - `defaultAccountId` -
`schemaVersion` - `backupReminderEnabled` - `lastBackupAt` (only when
the app has evidence of a successful export event; clarify that this
does not prove the user retained the file)

Do not store secrets or authentication tokens in settings.

## 6.7 Indexing strategy

Create indexes appropriate to expected queries: - transaction ID
(primary key) - `transactionDate` - `type` - `categoryId` -
`accountId` - `createdAt` - `transferGroupId` - `refundOfId` - budget
compound index for category + period + period start where supported -
category name/type lookup as appropriate

Do not add unnecessary indexes without a query need. Test that common
date-range queries use indexes effectively.

## 6.8 Example TypeScript types

``` ts
export type TransactionType = "income" | "expense" | "refund" | "transfer";
export type TransactionSource = "chat" | "form" | "import";
export type AccountType = "cash" | "bank" | "credit_card" | "other";
export type CategoryType = "income" | "expense";
export type BudgetPeriod = "weekly" | "monthly";

export interface Transaction {
  id: string;
  type: TransactionType;
  amountPaise: number;
  categoryId: string | null;
  accountId: string | null;
  description: string;
  transactionDate: string; // YYYY-MM-DD in device-local calendar semantics
  createdAt: string;
  updatedAt: string;
  source: TransactionSource;
  transferGroupId: string | null;
  refundOfId: string | null;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  aliases: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalancePaise: number;
  openingBalanceDate: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  period: BudgetPeriod;
  periodStart: string;
  limitPaise: number;
  createdAt: string;
  updatedAt: string;
}
```

These are baseline types. Refine the transfer model and validation
schemas before implementing persistence. Do not use TypeScript types as
a substitute for runtime validation.

------------------------------------------------------------------------

# 7. Monetary and Date Utilities

## 7.1 Monetary storage

Store money in integer paise: - ₹1 = 100 paise. - ₹150.00 = 15000
paise. - ₹150.50 = 15050 paise.

Do not store rupee amounts as binary floating-point values in the
database. Parse decimal strings carefully and reject precision beyond
two decimal places unless a clearly specified rounding policy is
implemented.

Example utility design: - `parseRupeesToPaise(input: string): number` -
`formatPaise(amountPaise: number): string` -
`formatPaiseCompact(amountPaise: number): string` -
`addPaise(a: number, b: number): number` -
`subtractPaise(a: number, b: number): number`

Check `Number.isSafeInteger` for stored and calculated integer amounts.
If a value exceeds the supported safe range, reject it with a clear
message rather than silently losing precision.

### Parsing examples

-   `"150"` → `15000`
-   `"150.5"` → `15050`
-   `"150.50"` → `15050`
-   `"0"` → `0` only for calculations/settings where zero is permitted;
    transaction amounts must be greater than zero.
-   `"150.555"` → reject or ask the user to correct it; do not silently
    round without a documented rule.
-   `"-150"` → reject as a transaction amount; the chat parser may
    recognize a minus sign used as a separator in a known phrase.

## 7.2 Display formatting

Use `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`
or an equivalent tested formatter. Verify behavior for zero, negative
balances, large numbers, and decimal amounts.

## 7.3 Date semantics

-   `transactionDate` is a local date string, not a UTC instant.
-   `createdAt` and `updatedAt` are timestamps.
-   Use a date utility library for date arithmetic.
-   Parse `today` and `yesterday` relative to the device-local date at
    submission time.
-   Keep the transaction date unchanged when editing unrelated fields.
-   Test month/year boundaries, leap years, daylight-saving transitions
    in applicable locales, and invalid date strings.
-   Do not calculate "this month" by assuming every month has 30 days.

------------------------------------------------------------------------

# 8. Reporting and Financial Formula Specification

All formulas must live in a reporting/calculation service and be covered
by unit tests.

## 8.1 Period definitions

For each report, define: - period start date, inclusive; - period end
date, exclusive or inclusive, consistently; - timezone/local date
semantics; - whether archived categories are included; - whether refunds
are netted; - whether transfers are excluded.

Prefer date ranges represented as `[startDate, endDateExclusive)` to
avoid end-of-day timestamp problems.

## 8.2 Required formulas

Let: - `I` = sum of income amounts in the selected period. - `E` = sum
of expense amounts in the selected period. - `R` = sum of refund amounts
in the selected period. - `N` = net expenses. - `L` = remaining from
recorded income.

Then: - `N = E - R` - `L = I - N` - `SavingsRate = L / I * 100` only
when `I > 0`.

All sums are in paise. Convert to display units only at the UI
formatting boundary.

### Important

A period's net expenses can be negative if refunds in that period exceed
expenses in that period. Do not silently clamp it to zero. Show an
appropriate label or explain the situation.

## 8.3 Category reporting

For an expense category: - gross expense = sum of expense transactions
assigned to category; - refunds = sum of refund transactions assigned to
category; - net expense = gross expense minus refunds.

If the refund is linked to an expense in a different category, define
whether the refund follows the original expense category. Recommended:
linked refunds inherit the original expense's category for reporting
unless the user explicitly changes the refund category, in which case
the UI must make the reporting consequence clear.

## 8.4 Account balances

For a basic asset account: - opening balance + credits - debits =
current balance.

Transfers should debit the source and credit the destination. Income
credits the relevant account, expenses debit the relevant account, and
refunds credit the account that received the refund.

Credit card accounts require liability-aware semantics. If this is not
implemented fully in v1, do not show misleading net-worth or
available-cash totals based on incomplete credit card accounting.

## 8.5 Rounding

Perform arithmetic in integer paise. Format values only for display. Do
not repeatedly convert paise to floating-point rupees and back during
calculations.

------------------------------------------------------------------------

# 9. Deterministic Chat Parser Specification

## 9.1 Parser contract

The parser should be a pure function where possible: - input: raw text,
current local date, available categories/aliases, available accounts,
and optional parser preferences; - output: `success`,
`needs_clarification`, or `invalid`; - no database writes; - no network
access; - no hidden defaults that can change financial meaning.

Suggested conceptual types:

``` ts
type ParseResult =
  | { status: "success"; draft: TransactionDraft; notes: string[] }
  | { status: "needs_clarification"; draft: Partial<TransactionDraft>; questions: string[] }
  | { status: "invalid"; message: string };

interface TransactionDraft {
  type: "income" | "expense" | "refund" | "transfer";
  amountPaise: number;
  categoryId: string | null;
  accountId: string | null;
  description: string;
  transactionDate: string;
  source: "chat";
  transferToAccountId?: string | null;
  refundOfId?: string | null;
  originalText: string;
}
```

The draft may contain UI-only fields such as `originalText`; strip them
before persistence unless intentionally included in the schema.

## 9.2 Parsing stages

1.  Trim input and normalize whitespace.
2.  Preserve original text.
3.  Detect explicit transaction type keywords.
4.  Identify amount tokens and reject unsupported ambiguity.
5.  Identify explicit date tokens.
6.  Match category names and aliases.
7.  Match account names where account syntax is supported.
8.  Identify description remainder.
9.  Validate type-specific required fields.
10. Return a draft, clarification, or error.

Do not let a later stage overwrite a clear explicit value from an
earlier stage without a defined rule.

## 9.3 Ambiguity examples

-   `150`: amount is known, but type/category are unknown; ask for
    details.
-   `food`: category is known, but amount is missing; ask for amount.
-   `150 amazon`: category is ambiguous unless `amazon` has a configured
    alias.
-   `salary 36000`: likely income, but category should resolve to
    Salary.
-   `200 fuel yesterday`: expense category Fuel, date yesterday.
-   `transfer 500`: requires source and destination accounts.
-   `refund 250`: requires a category or original expense selection if
    not inferable.
-   `150 food 200 fuel`: two amounts; do not save as one transaction.
    Ask whether the user intended two transactions or separate them into
    two entries.
-   `shopping - 2000`: allow this specific recognized separator pattern;
    amount is positive 200000 paise.
-   `-200 food`: reject/clarify; do not treat it as a negative expense.
-   `1,500 food`: support comma grouping if implemented safely; test
    Indian and standard grouping.
-   `1.500 food`: do not guess whether the period is a decimal or
    grouping separator; clarify or reject.
-   `₹150.50 food`: amount is ₹150.50.
-   `150 food tomorrow`: if future-dated actual expenses are not
    intended, ask whether this is a planned expense; v1 may allow a
    future transaction only if it is clearly labeled as planned,
    otherwise restrict actual transactions to dates no later than today.

## 9.4 Category aliases

Aliases should be user-editable. Examples: - Food: `food`, `meal`,
`lunch`, `dinner`, `snack` - Groceries: `grocery`, `groceries`,
`supermarket` - Fuel: `fuel`, `petrol`, `diesel` - Transport:
`transport`, `bus`, `taxi`, `auto` - Rent: `rent` - Phone & EMI:
`phone emi`, `mobile emi` - Salary: `salary`, `payroll` - Freelance:
`freelance`, `side income`

Do not map ambiguous aliases to multiple categories. A phrase like
`supermarket` may be groceries or household shopping; the user must be
able to adjust the category before confirmation.

## 9.5 Parser testing

Create table-driven unit tests for: - every supported phrase; - case
variations; - whitespace variations; - missing amounts; - missing
categories; - unsupported negative amounts; - multiple amounts; -
decimal amounts; - category alias conflicts; - invalid dates; -
today/yesterday at month boundaries; - transfers without both
accounts; - refunds without sufficient information; - unknown
categories; - malicious or extremely long input; - Unicode rupee
symbol; - comma-formatted amounts; - accidental duplicate submissions.

------------------------------------------------------------------------

# 10. UI and Visual Design Specification

## 10.1 Visual direction

Use a clean, premium, calm financial interface: - uncluttered layout; -
restrained color palette; - strong hierarchy for balances and amounts; -
consistent spacing; - subtle borders and surface backgrounds; - readable
typography; - clear positive/negative semantics; - no excessive
gradients, decorative illustrations, or distracting animations.

Use a CSS variable system for: - colors; - spacing; - radii; -
typography; - shadows; - z-index layers; - safe-area values.

## 10.2 Responsive design

Design mobile-first for iPhone 17, but support desktop browser use on
Windows: - narrow mobile viewport; - portrait orientation; - safe-area
insets; - virtual keyboard; - scrollable forms; - bottom navigation; -
tablet and desktop widths; - zoom and larger text settings.

Avoid fixed pixel widths for the main content. Use responsive containers
and sensible maximum widths on desktop.

## 10.3 Accessibility

-   Semantic headings and landmarks.
-   Visible keyboard focus.
-   Labels for every input.
-   Accessible names for icon-only buttons.
-   Sufficient contrast.
-   Error messages associated with fields.
-   Do not use color alone to communicate income/expense or budget
    status.
-   Charts should include text summaries.
-   Respect reduced-motion preferences.
-   Do not trap focus in dialogs.
-   Support keyboard navigation on desktop.

## 10.4 Essential screens

### Home

-   Current period selector.
-   Income, expenses, refunds, net expenses, remaining from recorded
    income.
-   Today total.
-   Category highlights.
-   Recent transactions.
-   Empty state.

### Quick Add

-   Chat-like history.
-   Input and send action.
-   Review card.
-   Inline editing.
-   Clarification prompts.
-   Saved confirmation.

### Calendar

-   Month grid.
-   Date selection.
-   Day totals.
-   Transaction list.
-   Add/edit/delete.

### Insights

-   Income vs expenses.
-   Category distribution.
-   Trend chart.
-   Budget progress.
-   Period comparisons.
-   Empty states.

### Settings

-   Category management.
-   Accounts.
-   Budgets.
-   JSON backup.
-   JSON restore.
-   CSV export.
-   Theme.
-   Privacy and data-loss warning.
-   Clear all data.

------------------------------------------------------------------------

# 11. PWA and Offline Requirements

## 11.1 Manifest

Configure: - app name: `PaisaTrack` - short name: `PaisaTrack` - start
URL - standalone display mode - theme color - background color -
appropriate square app icons, including required sizes - description

## 11.2 Service worker

Cache the app shell and static assets. Do not assume that caching the
app shell alone means every database operation works; IndexedDB and the
service worker have separate responsibilities.

Requirements: - The app can open offline after its first successful load
and caching. - The interface communicates offline status when useful. -
No core transaction feature depends on a network request. - Update
handling must not unexpectedly wipe or replace local data. - The service
worker must not cache private backup files or sensitive transaction
exports. - Handle failed updates gracefully. - Provide a strategy for
new app versions while preserving the IndexedDB database.

## 11.3 PWA limitations

-   Browser storage can be cleared.
-   A PWA does not automatically synchronize between devices.
-   iOS background tasks and notifications have platform-specific
    limitations.
-   Do not promise native-level integrations unless verified.
-   A PWA is not a native iOS app and does not require a native iOS
    build for the intended v1.

------------------------------------------------------------------------

# 12. Security and Privacy

## 12.1 Data flow

There should be no network data flow containing transaction records in
v1. Network activity should be limited to loading/updating the deployed
app shell and static assets, subject to hosting configuration.

## 12.2 Dependencies

-   Use official package registries and trusted package names.
-   Review new dependencies before installing.
-   Avoid abandoned or suspicious packages.
-   Keep dependencies updated carefully.
-   Run `npm audit` as a signal, then assess findings rather than
    blindly applying breaking upgrades.
-   Do not paste private company data or real financial backups into
    public issue trackers.

## 12.3 Frontend limitations

Client-side code is visible to the user. Do not put secrets in it.
Local-only does not automatically mean encrypted. A person with access
to the unlocked device/browser profile may be able to access the app's
stored data.

## 12.4 Clear-data operation

-   Require a confirmation dialog.
-   State exactly what will be deleted.
-   Recommend creating a backup first.
-   Require a deliberate final confirmation.
-   Use a transaction or controlled operation to avoid partial deletion.
-   Do not trigger clear-data behavior from a routine update or
    migration.

## 12.5 Error handling

-   Provide useful, non-technical messages to users.
-   Keep technical details in development diagnostics without leaking
    financial data unnecessarily.
-   Do not show full backup contents in error messages.
-   Do not silently swallow failed database operations.
-   Do not show a "saved" message until persistence succeeds.

------------------------------------------------------------------------

# 13. Error and Edge-Case Requirements

The app must handle: - database unavailable; - transaction save
failure; - duplicate submit; - malformed amount; - too-large amount; -
invalid date; - category archived between draft creation and
confirmation; - account archived between draft creation and
confirmation; - database version mismatch; - migration failure; -
invalid backup; - unsupported backup version; - duplicate IDs in
import; - conflicting records during merge; - interrupted restore; -
export failure; - empty transaction history; - zero-income period; -
refund larger than eligible remaining expense; - invalid transfer
accounts; - source and destination account equal; - category alias
collision; - missing category reference; - app reload during an unsaved
draft; - offline launch before app shell has ever been cached; - user
clearing website data; - device timezone changes; - daylight-saving date
boundaries; - leap day; - month/year rollover; - CSV values containing
commas, quotation marks, or newlines.

For every error, preserve user-entered data where safe and possible.
Never convert a recoverable error into data loss.

------------------------------------------------------------------------

# 14. Testing Strategy

## 14.1 Unit tests

Test pure logic: - rupee-to-paise parsing; - paise formatting; -
arithmetic boundaries; - date utilities; - parser behavior; - category
alias matching; - reporting formulas; - refund allocation; - budget
calculations; - backup validation; - CSV escaping.

## 14.2 Database integration tests

Test: - add/read/update/delete transaction; - indexes and date-range
queries; - category references; - archived categories; - atomic transfer
creation; - failed transfer rollback; - refund relationship
validation; - schema migration; - export/restore round trip; - merge
duplicate behavior; - rollback on failed restore.

Use a test database or isolated IndexedDB test environment. Do not run
tests against real user data.

## 14.3 Component tests

Test: - chat input; - review card; - confirmation flow; - validation
errors; - transaction list; - calendar selection; - dashboard empty
state; - category editor; - budget editor; - export and restore
confirmations; - clear-data confirmation.

## 14.4 End-to-end/manual device tests

On iPhone 17: - install from Safari; - launch from Home Screen; - create
income and expenses; - edit/delete records; - navigate calendar; -
inspect charts; - turn off internet and repeat core workflows; - export
JSON; - save backup to Files; - clear test data and restore; - verify
totals; - rotate device if supported; - open and close keyboard; -
verify safe areas; - verify app update does not reset data.

## 14.5 Required financial test fixtures

Example ledger: - Income: ₹36,000. - Expense: ₹100 Food. - Expense: ₹200
Fuel. - Refund: ₹20 Food.

Expected: - Total income = ₹36,000. - Gross expenses = ₹300. - Refunds =
₹20. - Net expenses = ₹280. - Remaining from recorded income =
₹35,720. - Food net expense = ₹80. - Fuel net expense = ₹200.

Use integer paise in tests and verify UI formatting separately.

------------------------------------------------------------------------

# 15. Development Phases and Deliverables

## Phase 0 --- Repository inspection and project setup

### Tasks

-   Inspect current working directory and existing files.
-   Confirm Node.js and npm versions.
-   Create Vite React TypeScript project if needed.
-   Configure TypeScript strictness.
-   Configure linting/formatting if selected.
-   Add core dependencies.
-   Establish a basic responsive app shell.
-   Add test configuration.
-   Add README with development commands.

### Deliverable

A clean app shell that starts locally, builds successfully, and runs a
trivial test.

### Exit criteria

-   `npm run dev` works.
-   `npm run build` works.
-   `npm test` or equivalent works.
-   No critical TypeScript errors.

## Phase 1 --- Data model and database

### Tasks

-   Define domain types.
-   Define Zod schemas.
-   Configure Dexie tables and indexes.
-   Add schema versioning.
-   Implement seed logic for default categories, account, and settings.
-   Ensure seed logic runs once.
-   Add database error handling.
-   Add unit and integration tests.

### Deliverable

Persistent local data layer.

### Exit criteria

-   Test transaction persists across simulated reload.
-   Seeding does not duplicate records.
-   Migration failure does not silently clear data.

## Phase 2 --- Money, dates, and transaction services

### Tasks

-   Implement integer paise utilities.
-   Implement date-only helpers.
-   Implement transaction CRUD service.
-   Implement category validation.
-   Implement account validation.
-   Implement refund rules.
-   Define transfer representation and atomic writes.
-   Implement reporting functions.
-   Add formula tests.

### Deliverable

Tested financial engine with no UI dependency.

### Exit criteria

-   Financial fixtures produce exact expected paise values.
-   Transfers are excluded from income/expense reports.
-   Refunds reduce net expenses correctly.

## Phase 3 --- Chat parser and Quick Add UI

### Tasks

-   Implement deterministic parser.
-   Add category alias resolution.
-   Add date token handling.
-   Add type-specific validation.
-   Build chat-like entry screen.
-   Build review/confirmation card.
-   Support draft editing.
-   Preserve text after errors.
-   Prevent double submission.
-   Add parser tests and UI tests.

### Deliverable

Reliable chat-first transaction entry.

### Exit criteria

-   Supported patterns parse correctly.
-   Ambiguous inputs never save automatically.
-   Save occurs only after confirmation.
-   Successful save updates history.

## Phase 4 --- Transaction management and calendar

### Tasks

-   Build transaction list and details.
-   Add search and filters.
-   Add edit and delete flows.
-   Build month grid.
-   Add date selection and daily summary.
-   Add transaction creation for selected date.
-   Add empty and error states.

### Deliverable

Full transaction history management.

### Exit criteria

-   Editing and deletion update all dependent views.
-   Local date semantics are correct across month/year boundaries.
-   Filters can be cleared and behave predictably.

## Phase 5 --- Dashboard, analytics, and budgets

### Tasks

-   Build dashboard metrics.
-   Add recent transactions.
-   Add category charts.
-   Add weekly and monthly trends.
-   Add income/expense comparison.
-   Add budget management and progress.
-   Add period navigation.
-   Add chart accessibility summaries.

### Deliverable

Useful financial overview and spending insights.

### Exit criteria

-   Every displayed total matches the underlying ledger.
-   Empty periods render gracefully.
-   No chart uses stale hardcoded values.

## Phase 6 --- Categories, accounts, and settings

### Tasks

-   Add category management.
-   Add alias editing and conflict validation.
-   Add archive behavior.
-   Add account management.
-   Add theme settings.
-   Add week-start preference.
-   Add privacy and data-loss explanation.
-   Add clear-data workflow.

### Deliverable

Configurable personal tracker.

### Exit criteria

-   Historical records remain valid when categories are archived.
-   Clear-data operation requires explicit confirmation.
-   Account and category validation prevents orphaned records.

## Phase 7 --- Backup and restore

### Tasks

-   Define versioned JSON backup schema.
-   Implement JSON export.
-   Implement CSV export.
-   Implement backup validation.
-   Implement replace restore.
-   Implement merge restore if included.
-   Add conflict handling.
-   Add safe restore transactions.
-   Test corrupt files and interrupted operations.

### Deliverable

Recoverable personal data system.

### Exit criteria

-   Full JSON round trip preserves all supported data.
-   Invalid backup does not mutate existing data.
-   CSV is valid and clearly documented as an export, not full restore.

## Phase 8 --- PWA, responsive design, and launch

### Tasks

-   Configure manifest and icons.
-   Configure service worker and app-shell caching.
-   Implement offline status where useful.
-   Test update strategy.
-   Review responsive layouts.
-   Test iPhone safe areas and keyboard behavior.
-   Deploy to HTTPS.
-   Install via Safari Add to Home Screen.
-   Test on actual iPhone 17.

### Deliverable

Installable, offline-first PWA.

### Exit criteria

-   Home Screen launch works.
-   Core functions work offline after initial caching.
-   Existing data survives normal app updates.
-   Backup/restore is tested on the device.

## Phase 9 --- Final QA and release

### Tasks

-   Run full unit, integration, and component tests.
-   Run production build.
-   Check console errors.
-   Review accessibility.
-   Check dependency vulnerabilities.
-   Test database migration from the prior version.
-   Verify no telemetry or transaction upload exists.
-   Review privacy wording.
-   Prepare final README and release notes.

### Deliverable

A stable v1 release.

------------------------------------------------------------------------

# 16. Implementation Commands

From a Windows terminal in VS Code:

``` bash
npm create vite@latest paisatrack -- --template react-ts
cd paisatrack
npm install
npm install dexie date-fns recharts zod lucide-react
npm install -D vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom
npm run dev
```

The coding agent should inspect the generated `package.json` and
configure scripts rather than assuming they are already correct. Add
test and build scripts as needed.

Suggested scripts: - `dev`: run Vite development server. - `build`:
type-check and build production assets. - `preview`: preview production
build. - `test`: run unit/component tests. - `test:watch`: run tests in
watch mode. - `typecheck`: run TypeScript checks. - `lint`: run
configured lint rules if ESLint is included.

Do not introduce a backend just to make the development server work.

------------------------------------------------------------------------

# 17. Suggested Implementation Contracts

The following contracts define responsibilities. The coding agent may
refine names, but must preserve behavior.

## 17.1 Transaction service

Expected responsibilities: - validate create request; - create unique ID
and timestamps; - persist transaction; - update timestamps on edit; -
validate category/account references; - validate refund links; - perform
atomic transfer writes; - delete transaction only after caller
confirmation; - return a typed result or throw a typed domain error; -
never contain UI rendering logic.

## 17.2 Reporting service

Expected responsibilities: - query transactions for a period; -
calculate income, gross expenses, refunds, net expenses, and remaining
from recorded income; - calculate category totals; - calculate
daily/weekly/monthly aggregates; - calculate budget use; - calculate
account balances if account ledger semantics are implemented; - exclude
transfers from income/expense reports; - handle empty periods; - return
typed values in paise.

## 17.3 Category service

Expected responsibilities: - create/update/archive categories; -
validate unique names; - validate alias uniqueness; - prevent invalid
type assignments; - protect historical references; - seed defaults once.

## 17.4 Backup service

Expected responsibilities: - serialize supported persisted state to a
versioned format; - validate imported data; - migrate supported older
backup versions; - reject unsupported versions safely; - detect
duplicates and conflicts; - restore atomically; - export valid CSV; -
never include secrets; - return useful, typed error information.

## 17.5 Parser service

Expected responsibilities: - accept text and explicit parsing context; -
return a typed draft, clarification, or error; - not read or write the
database directly; - never submit a transaction automatically; - never
invoke a network or AI service; - provide tests for all supported
grammar patterns.

------------------------------------------------------------------------

# 18. Versioning and Migration Policy

1.  Every persisted schema change must increment the Dexie database
    version as appropriate.
2.  Migrations must be deterministic and tested.
3.  Never reset the database as a migration shortcut.
4.  Keep backup format version separate from database schema version.
5.  Support the current backup format and explicitly documented older
    formats.
6.  Reject unknown future formats without mutating data.
7.  If a migration fails, show a recoverable error and recommend
    preserving/exporting available data before any repair attempt.
8.  Do not run destructive migration code on every application startup.
9.  Test upgrades using fixtures generated by previous versions.
10. Document changes in release notes.

------------------------------------------------------------------------

# 19. Operational and Maintenance Requirements

-   Keep the dependency list small.
-   Use TypeScript strict mode.
-   Keep domain logic testable without rendering React.
-   Use stable IDs, not array indexes, for persisted entities.
-   Do not store derived totals as independent mutable values unless
    there is a justified, tested cache invalidation strategy.
-   Use a single money utility and a single reporting service.
-   Use a single source of date semantics.
-   Centralize error messages where appropriate.
-   Avoid a custom logging framework for this small local app.
-   Do not log raw financial text unnecessarily.
-   Keep UI copy clear and direct.
-   Document setup, test, build, deployment, backup, and restore
    instructions in `README.md`.

------------------------------------------------------------------------

# 20. Detailed Acceptance Test Matrix

  -------------------------------------------------------------------------------
  ID                Area              Scenario               Expected result
  ----------------- ----------------- ---------------------- --------------------
  AT-001            Entry             Enter `150 food`       Draft shows ₹150,
                                                             expense, Food,
                                                             current local date

  AT-002            Entry             Confirm valid draft    Transaction persists
                                                             and success appears

  AT-003            Entry             Parser gets `150`      Clarification; no
                                                             record saved

  AT-004            Entry             Enter `-200 food`      Reject/clarify; no
                                                             negative expense

  AT-005            Entry             Enter `150.555 food`   Reject or request
                                                             correction

  AT-006            Entry             Enter                  Correct prior local
                                      `200 fuel yesterday`   date

  AT-007            Entry             Enter `salary 36000`   Income draft with
                                                             Salary category

  AT-008            Entry             Enter `transfer 500`   Ask for
                                                             source/destination
                                                             accounts

  AT-009            Entry             Submit twice rapidly   Only one transaction
                                                             created

  AT-010            Ledger            Save ₹100 expense and  Net expenses = ₹80
                                      ₹20 refund             

  AT-011            Ledger            Create internal        Income/expense
                                      transfer               totals unchanged

  AT-012            Ledger            Edit amount            All dependent totals
                                                             refresh

  AT-013            Ledger            Delete transaction     Totals refresh;
                                                             confirmation was
                                                             required

  AT-014            Calendar          Select day with        Correct
                                      transactions           date-specific list
                                                             and totals

  AT-015            Calendar          Navigate December to   Correct year and
                                      January                period

  AT-016            Reports           No income in period    Savings rate is
                                                             unavailable, not NaN

  AT-017            Budget            Spend over limit       Negative remaining
                                                             budget and
                                                             over-budget state

  AT-018            Category          Archive category with  Historical
                                      history                transactions remain
                                                             visible

  AT-019            Category          Duplicate alias        Conflict rejected or
                                      conflict               resolved explicitly

  AT-020            Backup            Export JSON            Valid versioned
                                                             backup generated

  AT-021            Backup            Restore valid backup   All supported
                                                             records restored

  AT-022            Backup            Restore malformed JSON Existing database
                                                             unchanged

  AT-023            Backup            Restore unsupported    Rejected without
                                      version                mutation

  AT-024            Backup            Merge duplicate IDs    Deduplicate
                                                             identical records or
                                                             report conflicts

  AT-025            Backup            Export CSV with        Properly escaped CSV
                                      commas/newlines        

  AT-026            Offline           Reload after app shell Core features
                                      cached with no network continue to work

  AT-027            Offline           First launch without   Explain that initial
                                      network and no prior   load requires
                                      cache                  network

  AT-028            Persistence       Refresh app after save Transaction remains
                                                             available

  AT-029            Security          Inspect network        No transaction data
                                      activity               sent to a remote
                                                             service

  AT-030            Mobile            Open keyboard on Quick Input and
                                      Add                    confirmation
                                                             controls remain
                                                             usable

  AT-031            Mobile            Home Screen launch     App layout fits safe
                                                             areas

  AT-032            Migration         Upgrade database       Existing records
                                      version                retained

  AT-033            Clear data        Attempt to clear all   Explicit
                                      records                confirmation and
                                                             clear warning

  AT-034            Refund            Refund exceeds linked  Rejected or explicit
                                      expense balance        exception flow

  AT-035            Dates             Leap day and month-end Correct local date
                                      inputs                 semantics

  AT-036            Currency          Large Indian currency  Correct paise
                                      amount                 arithmetic and INR
                                                             formatting
  -------------------------------------------------------------------------------

The coding agent should add more tests as edge cases are discovered.
This matrix is a minimum, not a limit.

------------------------------------------------------------------------

# 21. Release Checklist

## Product

-   [ ] Chat entry works.
-   [ ] Income, expenses, refunds, and transfers are distinct.
-   [ ] Calendar works.
-   [ ] Dashboard works.
-   [ ] Analytics work.
-   [ ] Categories can be managed.
-   [ ] Budgets work.
-   [ ] Search and filters work.
-   [ ] Edit and delete work.

## Financial correctness

-   [ ] Integer paise storage used everywhere in persisted monetary
    values.
-   [ ] No floating-point monetary calculations in domain logic.
-   [ ] Refunds reduce net expenses.
-   [ ] Transfers excluded from income and expenses.
-   [ ] Savings rate handles zero income.
-   [ ] Period boundaries are correct.
-   [ ] All dashboard metrics derive from the ledger.

## Privacy and data safety

-   [ ] No backend in v1.
-   [ ] No analytics or transaction telemetry.
-   [ ] No secret values in frontend code.
-   [ ] JSON backup works.
-   [ ] CSV export works.
-   [ ] Restore validation works.
-   [ ] Destructive actions require confirmation.
-   [ ] Data-loss limitations are explained.

## Engineering

-   [ ] TypeScript strict checks pass.
-   [ ] Unit tests pass.
-   [ ] Integration tests pass.
-   [ ] Component tests pass.
-   [ ] Production build succeeds.
-   [ ] No unresolved critical console errors.
-   [ ] Migrations are tested.
-   [ ] README is complete.

## iPhone

-   [ ] HTTPS deployment available.
-   [ ] PWA install tested through Safari.
-   [ ] Home Screen launch works.
-   [ ] Core offline workflows work after caching.
-   [ ] Keyboard and safe-area behavior checked.
-   [ ] Backup/restore tested on device.

------------------------------------------------------------------------

# 22. Future Enhancements --- Explicitly Deferred

These should not delay v1: - optional encrypted cloud backup; -
cross-device synchronization; - passcode/application lock; - local
encrypted database layer; - receipt capture and OCR; - recurring bill
reminders; - recurring income/expense templates; - custom financial
year; - multiple currencies; - advanced credit-card liability
accounting; - native iOS wrapper; - AI-assisted categorization; - import
from bank CSV statements; - import from SMS or email (requires separate
privacy and permission review).

Any future feature that adds network access must be reviewed against the
local-only privacy requirement and must be opt-in.

------------------------------------------------------------------------

# 23. Final Build Instructions for the Coding Agent

Implement PaisaTrack according to this document, in the phases specified
above.

Before each phase: 1. Inspect current code and existing tests. 2.
Identify the files and modules to create or change. 3. Implement the
smallest coherent unit. 4. Run tests and type checks. 5. Fix regressions
before continuing. 6. Summarize changed files, verified behavior, tests
run, and remaining issues.

Never: - fabricate test results; - claim a deployment succeeded without
verifying it; - silently replace the database; - save ambiguous parsed
transactions automatically; - introduce a backend or telemetry without
approval; - store money as floating-point rupees; - count transfers as
spending or income; - treat refunds as ordinary income by default; -
assume browser storage is a permanent backup; - mark a feature complete
when only its visual interface exists.

If a technical conflict arises, preserve these priorities in order: 1.
Financial correctness. 2. Data preservation and recoverability. 3.
Privacy. 4. Deterministic, understandable behavior. 5. Offline
usability. 6. Mobile usability and accessibility. 7. Visual polish. 8.
Optional enhancements.

The target is not simply a good-looking finance dashboard. It is a
dependable personal financial ledger that the user can operate every
day, understand, back up, and recover without relying on a cloud
service.

**End of specification.**
