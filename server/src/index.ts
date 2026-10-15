import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "5mb" }));

type BreakType = "tea" | "lunch" | "personal" | "restroom" | "other";
const validBreakTypes: BreakType[] = ["tea", "lunch", "personal", "restroom", "other"];

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "BreakFlow API" });
});


type AuthSession = { role: "admin" | "employee"; employeeId?: number; name: string };
const sessions = new Map<string, AuthSession>();

app.post("/api/login/admin", asyncRoute(async (req, res) => {
  const username = String(req.body?.username ?? "");
  const password = String(req.body?.password ?? "");
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";
  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ error: "Invalid administrator username or password." });
  }
  const token = randomUUID();
  sessions.set(token, { role: "admin", name: "Admin User" });
  return res.json({ token, role: "admin", name: "Admin User" });
}));

app.post("/api/login/employee", asyncRoute(async (req, res) => {
  const employeeCode = String(req.body?.employeeCode ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!employeeCode || !email) return res.status(400).json({ error: "Employee code and registered email are required." });
  const result = await pool.query(
    `SELECT id, full_name FROM employees
     WHERE employee_code = $1 AND LOWER(COALESCE(email, '')) = $2 AND status = 'active'`,
    [employeeCode, email]
  );
  if (!result.rowCount) return res.status(401).json({ error: "Employee code and registered email did not match an active employee." });
  const token = randomUUID();
  sessions.set(token, { role: "employee", employeeId: Number(result.rows[0].id), name: result.rows[0].full_name });
  return res.json({ token, role: "employee", employeeId: Number(result.rows[0].id), name: result.rows[0].full_name });
}));

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/login/admin" || req.path === "/login/employee") return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: "Please log in to continue." });
  (req as any).auth = session;
  next();
});

function requireAdmin(req: Request, res: Response): boolean {
  if ((req as any).auth?.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required for this action." });
    return false;
  }
  return true;
}

app.get("/api/me", asyncRoute(async (req, res) => {
  const auth = (req as any).auth as AuthSession;
  if (auth.role !== "employee" || !auth.employeeId) return res.status(403).json({ error: "This endpoint is for employee accounts." });
  const result = await pool.query(`
    SELECT e.id, e.employee_code, e.full_name, e.email, e.department, e.job_title,
           e.status, b.id AS open_break_id, b.break_type AS open_break_type, b.start_time AS open_break_start
    FROM employees e LEFT JOIN breaks b ON b.employee_id = e.id AND b.end_time IS NULL
    WHERE e.id = $1
  `, [auth.employeeId]);
  if (!result.rowCount) return res.status(404).json({ error: "Employee account not found." });
  res.json(result.rows[0]);
}));

app.get("/api/dashboard", asyncRoute(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM employees WHERE status = 'active') AS active_employees,
      (SELECT COUNT(*)::int FROM breaks WHERE end_time IS NULL) AS on_break_now,
      (SELECT COUNT(*)::int FROM breaks WHERE start_time >= CURRENT_DATE AND start_time < CURRENT_DATE + INTERVAL '1 day') AS breaks_today,
      (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 60), 0)
       FROM breaks WHERE start_time >= CURRENT_DATE AND start_time < CURRENT_DATE + INTERVAL '1 day') AS break_minutes_today
  `);
  const active = await pool.query(`
    SELECT b.id, b.employee_id, e.employee_code, e.full_name, e.department,
           b.break_type, b.start_time,
           FLOOR(EXTRACT(EPOCH FROM (NOW() - b.start_time)) / 60)::int AS elapsed_minutes
    FROM breaks b JOIN employees e ON e.id = b.employee_id
    WHERE b.end_time IS NULL ORDER BY b.start_time ASC
  `);
  res.json({ stats: result.rows[0], currentlyOnBreak: active.rows });
}));

app.get("/api/employees", asyncRoute(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = await pool.query(`
    SELECT e.id, e.employee_code, e.full_name, e.email, e.department, e.job_title,
           e.status, e.created_at,
           b.id AS open_break_id, b.break_type AS open_break_type, b.start_time AS open_break_start
    FROM employees e
    LEFT JOIN breaks b ON b.employee_id = e.id AND b.end_time IS NULL
    ORDER BY e.created_at DESC
  `);
  res.json(result.rows);
}));

app.post("/api/employees", asyncRoute(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { employeeCode, fullName, email, department, jobTitle } = req.body ?? {};
  if (!employeeCode?.trim() || !fullName?.trim()) {
    return res.status(400).json({ error: "Employee code and full name are required." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO employees (employee_code, full_name, email, department, job_title)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, employee_code, full_name, email, department, job_title, status, created_at`,
      [employeeCode.trim(), fullName.trim(), email?.trim() || null,
       department?.trim() || "General", jobTitle?.trim() || "Employee"]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") return res.status(409).json({ error: "Employee code or email already exists." });
    throw error;
  }
}));

app.post("/api/employees/import", asyncRoute(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = req.body?.employees;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Upload an Excel file containing at least one employee row." });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: "A maximum of 2,000 employees can be imported at once." });
  }

  const inserted: unknown[] = [];
  const skipped: { row: number; employeeCode: string; reason: string }[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const employeeCode = typeof row.employeeCode === "string" ? row.employeeCode.trim() : String(row.employeeCode ?? "").trim();
      const fullName = typeof row.fullName === "string" ? row.fullName.trim() : String(row.fullName ?? "").trim();
      const email = typeof row.email === "string" ? row.email.trim() : String(row.email ?? "").trim();
      const department = typeof row.department === "string" ? row.department.trim() : String(row.department ?? "").trim();
      const jobTitle = typeof row.jobTitle === "string" ? row.jobTitle.trim() : String(row.jobTitle ?? "").trim();
      const excelRow = i + 2;
      if (!employeeCode || !fullName) {
        skipped.push({ row: excelRow, employeeCode, reason: "Employee Code and Full Name are required." });
        continue;
      }
      if (employeeCode.length > 30 || fullName.length > 120 || email.length > 180 || department.length > 100 || jobTitle.length > 100) {
        skipped.push({ row: excelRow, employeeCode, reason: "One or more fields exceed the maximum allowed length." });
        continue;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ row: excelRow, employeeCode, reason: "Email address is not valid." });
        continue;
      }
      const result = await client.query(
        `INSERT INTO employees (employee_code, full_name, email, department, job_title)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id, employee_code, full_name, email, department, job_title, status, created_at`,
        [employeeCode, fullName, email || null, department || "General", jobTitle || "Employee"]
      );
      if (result.rowCount) inserted.push(result.rows[0]);
      else skipped.push({ row: excelRow, employeeCode, reason: "Employee Code or Email already exists in the database (or duplicates another row in this file)." });
    }
    await client.query("COMMIT");
    return res.status(200).json({ insertedCount: inserted.length, skippedCount: skipped.length, inserted, skipped });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.patch("/api/employees/:id/status", asyncRoute(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { status } = req.body ?? {};
  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({ error: "Status must be active or inactive." });
  }
  const result = await pool.query(
    "UPDATE employees SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status",
    [status, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Employee not found." });
  res.json(result.rows[0]);
}));

app.get("/api/breaks", asyncRoute(async (req, res) => {
  const auth = (req as any).auth as AuthSession;
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (auth.role === "employee" && auth.employeeId) {
    values.push(auth.employeeId);
    conditions.push(`b.employee_id = $${values.length}`);
  } else if (req.query.employeeId) {
    values.push(req.query.employeeId);
    conditions.push(`b.employee_id = $${values.length}`);
  }
  if (req.query.date) {
    values.push(req.query.date);
    conditions.push(`b.start_time >= $${values.length}::date AND b.start_time < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(`
    SELECT b.id, b.employee_id, e.employee_code, e.full_name, e.department,
           b.break_type, b.start_time, b.end_time, b.notes,
           FLOOR(EXTRACT(EPOCH FROM (COALESCE(b.end_time, NOW()) - b.start_time)) / 60)::int AS duration_minutes
    FROM breaks b JOIN employees e ON e.id = b.employee_id
    ${where}
    ORDER BY b.start_time DESC LIMIT 500
  `, values);
  res.json(result.rows);
}));

app.post("/api/breaks/start", asyncRoute(async (req, res) => {
  const auth = (req as any).auth as AuthSession;
  let { employeeId, breakType, notes } = req.body ?? {};
  if (auth.role === "employee") employeeId = auth.employeeId;
  if (!employeeId || !validBreakTypes.includes(breakType)) {
    return res.status(400).json({ error: "A valid employeeId and breakType are required." });
  }
  const employee = await pool.query("SELECT id FROM employees WHERE id = $1 AND status = 'active'", [employeeId]);
  if (!employee.rowCount) return res.status(404).json({ error: "Active employee not found." });

  try {
    const result = await pool.query(
      `INSERT INTO breaks (employee_id, break_type, notes)
       VALUES ($1, $2, $3)
       RETURNING id, employee_id, break_type, start_time, end_time, notes`,
      [employeeId, breakType, notes?.trim() || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") return res.status(409).json({ error: "This employee is already on a break." });
    throw error;
  }
}));

app.post("/api/breaks/:id/end", asyncRoute(async (req, res) => {
  const auth = (req as any).auth as AuthSession;
  const values: unknown[] = [req.params.id];
  let ownerCondition = "";
  if (auth.role === "employee" && auth.employeeId) { values.push(auth.employeeId); ownerCondition = " AND employee_id = $2"; }
  const result = await pool.query(
    `UPDATE breaks SET end_time = NOW()
     WHERE id = $1 AND end_time IS NULL${ownerCondition}
     RETURNING id, employee_id, break_type, start_time, end_time,
       FLOOR(EXTRACT(EPOCH FROM (NOW() - start_time)) / 60)::int AS duration_minutes`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: "Open break not found. It may already be ended." });
  res.json(result.rows[0]);
}));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error. Check the server terminal for details." });
});

app.listen(port, () => {
  console.log(`BreakFlow API running at http://localhost:${port}`);
});
