# PiFi Finance (rebuild)

A modern rebuild of the Thangarathnam Finance ("PiFi") co-operative / NBFC
back-office. Same feature set, new stack and design. See the captured reference
and full analysis in the sibling repo at `../FinanceProject/reference-pifi/`.

**Stack:** React (Vite) + Node/Express + MongoDB. Cookie sessions, admin/staff
roles, **multi-branch in one database** (a branch is chosen at sign-in and scopes
every record).

## Run it

```bash
npm run setup                          # installs root, backend and frontend
cp backend/.env.example backend/.env   # then fill in MONGODB_URI and JWT_SECRET
npm run seed                           # creates the 3 branches + an admin (admin / admin123)
npm run dev                            # API on :4000, React on :5173
```

Open <http://localhost:5173>. Sign in as `admin` / `admin123`, pick a branch.
(Change the admin password after first login.)

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## What's built so far

- **Auth & sessions** — login with branch select, first-run owner setup, logout,
  switch-branch without signing out. JWT in an httpOnly cookie, carries the branch.
- **Branches** — three seeded (201-Nagercoil, 202-Aruppukottai, 203-Kovilpatti),
  admin CRUD.
- **Customers** — full master form (personal, contact, permanent address, two ID
  proofs + PAN, nominee, introducer, SMS/TDS flags, remarks), searchable paginated
  list, per-branch running Customer IDs, create/edit, admin deactivate.
- **Dashboard** — branch summary cards + recent customers.
- **UI shell** — sidebar with the full module map, top-bar branch switcher, modern
  indigo/slate design system in `frontend/src/index.css`.

## Next modules (priority order, from ANALYSIS.md §6)

Jewel Loan → Savings → FD/RD → Share → Vouchers/GL → Reports → Reminders/SMS →
Settings masters (schemes, interest rates, GL, gold rate, users & permissions).

## Project shape

```
backend/src
  config.js db.js index.js seed.js
  models/     Branch, User, Counter, Customer
  routes/     auth, branches, customers, dashboard
  middleware/ auth (JWT + branch scoping)
  lib/        escapeRegex
frontend/src
  App.jsx api.js index.css main.jsx
  components/ Login, Layout, Dashboard, CustomerList, CustomerForm
```
