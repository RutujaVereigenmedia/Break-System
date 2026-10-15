# BreakFlow — Employee Break Management System

A full-stack starter project built with React + TypeScript, Node.js + Express + TypeScript, and PostgreSQL.

## Features
- Dashboard with employee count, employees currently on break, breaks today, and today's break minutes.
- Employee directory: add employees, list employees, activate/deactivate employees.
- Import employees from Excel (.xlsx/.xls) or CSV; successful rows are saved to PostgreSQL.
- Downloadable Excel import template included in the project and available from the Employees page.
- Import report lists skipped rows and explains duplicates/validation issues.
- Start and end breaks with types: Tea, Lunch, Personal, Restroom, Other.
- Prevents an employee from starting a second break while already on one.
- Break history with employee, type, start/end timestamps, duration, and status.
- Filter break history by employee and date.
- PostgreSQL schema and sample seed data.
- Separate employee and administrator dashboards with login and role-based API access.
- Employees see only their own break history and can start/end their own breaks with one click.
- Administrators can view all employee activity, manage the directory, import Excel, and review break history.
- Employee login uses employee code + registered email; admin login uses environment-configured credentials.
- Responsive dashboard UI.

## Requirements
- Node.js 20+ recommended
- PostgreSQL 14+
- npm

## 1. Create the database
In pgAdmin Query Tool, or with `psql`, run:

```sql
CREATE DATABASE breakflow;
```

Then connect to the `breakflow` database and execute `database/schema.sql`.
You can also import the `database/schema.sql` file through pgAdmin's Query Tool.
The SQL creates tables and inserts sample employees.

## 2. Configure backend
```bash
cd server
copy .env.example .env
```
On macOS/Linux, use `cp .env.example .env`.
Edit `.env` and set your PostgreSQL username/password/database.

Example:
```env
PORT=4000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/breakflow
CLIENT_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password
```

Install and run:
```bash
npm install
npm run dev
```
The API runs at http://localhost:4000 and health check is http://localhost:4000/api/health.

## 3. Configure frontend
Open a second terminal:
```bash
cd client
npm install
npm run dev
```
Open the URL printed by Vite (normally http://localhost:5173).

## API overview
- `GET /api/health` (public)
- `POST /api/login/admin` (admin login)
- `POST /api/login/employee` (employee code + registered email login)
- `GET /api/me` (employee profile and current break; employee only)
- `GET /api/dashboard`
- `GET /api/employees`
- `POST /api/employees`
- `POST /api/employees/import` (bulk import; body: `{ "employees": [{ "employeeCode": "EMP-2001", "fullName": "Example Person", "email": "person@example.com", "department": "IT", "jobTitle": "Developer" }] }`)
- `PATCH /api/employees/:id/status`
- `GET /api/breaks?employeeId=&date=YYYY-MM-DD`
- `POST /api/breaks/start`
- `POST /api/breaks/:id/end`

## Notes
- This is a learning/MVP project, not a hardened production deployment.
- Admin starter login is `admin` / `admin123` unless changed in `server/.env`. Change it before use.
- Employee login matches the employee code and registered email. This is convenient for a demo but is not strong authentication; for production, add employee passwords or SSO and use durable signed sessions/JWTs with expiration.
- API session tokens are held in server memory and will be invalidated when the server restarts. Log in again after a restart.
- Admin-only endpoints are restricted on the server. Employee break-history queries and end-break actions are scoped to the authenticated employee.
- Durations are computed from timestamps; PostgreSQL stores timestamps with time zone.
- API validation is intentionally straightforward so the code is approachable for beginners.


## PostgreSQL password troubleshooting

The backend now loads `server/.env` using an explicit path, whether started in development or from compiled output. Copy `server/.env.example` to `server/.env` and replace `YOUR_PASSWORD` with the password you use for PostgreSQL. The file must be named exactly `.env` and sit beside `server/package.json`.

If your password contains URL-reserved characters such as `@`, `:`, `/`, `#` or `%`, URL-encode those characters in `DATABASE_URL`, or use the separate `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` settings shown in `.env.example`. Never share or commit your real `.env` file.


## Import employees from Excel
1. Start the server and client as described above.
2. Open **Employees** in the app and click **Excel template** to download `employee-import-template.xlsx`, or use the same template in the project root.
3. Fill one employee per row. Required columns are `Employee Code` and `Full Name`. Optional columns are `Email`, `Department`, and `Job Title`. Keep the first header row unchanged.
4. Click **Import Excel** and select the filled workbook (`.xlsx`, `.xls`, or `.csv`).
5. The server validates rows and inserts valid new employees into PostgreSQL. Existing employee codes/emails and invalid rows are skipped and shown in the import report. The API accepts up to 2,000 rows per import.

The import does not delete or overwrite existing employee records. It adds new records only. If a row is skipped, correct it in Excel and import again.
