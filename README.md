# PiFi Finance (rebuild)

A rebuild of the Thangarathnam Finance ("PiFi") co-operative / NBFC back-office.
Same flow and same data as the system it replaces, in a new design. The captured
reference and the full analysis are in the sibling repo at
`../FinanceProject/reference-pifi/`.

**Stack:** React (Vite) + Node/Express + MongoDB Atlas. Cookie sessions,
admin/staff roles, **multi-branch in one database** — a branch is chosen at
sign-in and scopes every record.

---

## First time on a new computer

```bash
npm run setup                          # installs root, backend and frontend
cp backend/.env.example backend/.env   # then fill it in — see below
npm run seed                           # 3 branches + an admin (admin / admin123)
npm run seed-settings                  # the Settings masters, 345 rows
npm run dev
```

`npm run dev` starts both halves at once: the API on **:4000** and the React app
on **:5173**. Open <http://localhost:5173>, sign in as `admin` / `admin123` and
pick a branch. Change that password after the first sign-in
(Settings → Change Password).

**`backend/` and `frontend/` are two completely independent projects.** Each has
its own `package.json`, its own `node_modules` and its own lockfile, and neither
can reach the other's packages. The root `package.json` only exists to start both
with one command.

So either half runs perfectly well on its own:

```bash
cd backend  && npm install && npm run dev    # API only
cd frontend && npm install && npm run dev    # React only (needs the API running)
```

### The .env file — backend/.env

```ini
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/pifi_finance
JWT_SECRET=<a long random string>
PORT=4000
NODE_ENV=development
TOKEN_HOURS=12
```

Generate a fresh `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

This file belongs to the backend only — the React app never sees it. It is in
`.gitignore` and must never be committed or shared. Changing `JWT_SECRET` signs
everybody out.

---

## What is built

**Customer** — the whole flow, screen for screen:

- **Customer List** — one keyword over the whole row, Add New, the record count,
  and the same columns the old list had.
- **Customer Master** — every field of the old form, its exact option lists,
  Copy Address, the introducer lookup, photo and the pledged-jewel photo.
- **Customer Enquiry** — the customer beside their photo, then their accounts.
- **List of A/c's for Customer** — four reports, filtered by A/c status and
  scheme type, issued as PDF, Excel or Word laid out like the Crystal reports
  they replace.

**Settings** — all nineteen screens, in the order the old menu lists them:
Branch Master, Schedule Master, GL Master, GL Opening Balance, Scheme Master,
Interest Slab, General Settings, List of Bank Accounts, Jewel Description,
JL Market Rate, Deposit Period Master, Id Proof Master, Bank Master, Calendar
Settings, Report Settings, User Registration, Change Password, Permission
Settings, Interest Provision.

**Dashboard** — the branch totals as a slider, a card per module, new customers
over six months, and the customers added most recently.

Every other menu entry reaches a *Coming soon* page, so the shape of the whole
system is visible from the first day.

### Still to build

Jewel Loan → Savings → Term Deposit → Share → Vouchers → Admin. A product
module registers itself in [backend/src/lib/accounts.js](backend/src/lib/accounts.js);
the Customer Enquiry grid and the account reports then pick it up without either
of them changing.

---

## Seeding

| Command | What it does |
| --- | --- |
| `npm run seed` | The three branches and the first admin. Safe to re-run. |
| `npm run seed-settings` | The Settings masters — schedules, chart of accounts, schemes, slabs, deposit periods, jewel descriptions, id proofs, banks, gold rate, report groups. Safe to re-run. |
| `npm run seed-customers` | Real customers, from `backend/src/data/` (not in git). |
| `npm run fetch-photos -- --branch 201 --all` | Pulls customer photos from the old system and stores them resized. Needs `REF_URL`, `REF_USER`, `REF_PASS`. |

---

## Putting it online

The Express server serves the API *and* the built React app from one place, so
one service is all you need.

```bash
npm run build     # installs what is missing, then builds into frontend/dist/
npm start         # serves the API and that build on PORT
```

[render.yaml](render.yaml) is a Render blueprint for exactly that: **New →
Blueprint → pick this repository**. It asks for `MONGODB_URI` and sets
everything else, including a generated `JWT_SECRET`.

**Two things to set in MongoDB Atlas before deploying:**

1. **Network Access** — add the host's IP, or `0.0.0.0/0` if it has no fixed one.
   Without this the server cannot connect.
2. **Database Access** — the database user's password. Rotate it if it has ever
   been pasted into a chat, an email or a screenshot.

In production the session cookie is set `secure`, so the site must be served
over HTTPS. Render gives you that automatically.

---

## Project layout

```
package.json              only starts both halves with one command
render.yaml               Render blueprint — one web service
scripts/build.mjs         installs whatever is missing, then builds the frontend

backend/                  Node + Express + MongoDB — standalone project
  .env                    ← secrets, never committed
  src/
    index.js              Express app, security headers, serves the built site
    start.js              production entry point (sets NODE_ENV)
    config.js             reads backend/.env, refuses to start if anything is missing
    db.js                 MongoDB connection
    seed.js               branches + first admin
    seed-settings.js      the Settings masters
    seed-customers.js     real customers, from src/data/ (not in git)
    seed-data/            the master data read out of the old system
    models/               Branch, User, Counter, Customer, and the Settings masters
    middleware/auth.js    cookie sessions, requireAuth / requireAdmin, branch scoping
    lib/
      accounts.js         where product modules register their accounts
      httpError.js        errors carrying the status to answer with
      escapeRegex.js
    routes/               auth, branches, customers, dashboard, settings
  tools/                  one-off crawlers for the system being replaced

frontend/                 React + Vite — standalone project
  index.html
  vite.config.js          dev server, proxies /api to the backend
  src/
    App.jsx               session, and which screen is showing
    api.js                every call to the server
    index.css             the whole design system
    components/
      Layout.jsx          sidebar, branch switcher, the icon rail
      Dashboard.jsx       totals slider, module cards, chart
      Customer*.jsx       list, master, enquiry, reports
      settings/           MasterScreen + the nineteen Settings screens
    lib/
      format.js           dates, money, ages
      report.js           PDF / Excel / Word, laid out like the old reports
```
