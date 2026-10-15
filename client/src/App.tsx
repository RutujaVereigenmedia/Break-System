import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  Activity, AlarmClock, ArrowDownRight, ArrowUpRight, Coffee, Download, Upload,
  LayoutDashboard, Menu, Plus, Search, Users, X, CheckCircle2, Clock3,
  CalendarDays, Building2, ChevronDown, CircleUserRound, RefreshCw,
  Utensils, UserRound, Toilet, MoreHorizontal
} from "lucide-react";

const API = "http://localhost:4000/api";
type Employee = {
  id: number; employee_code: string; full_name: string; email: string | null;
  department: string; job_title: string; status: "active" | "inactive";
  open_break_id: number | null; open_break_type: string | null; open_break_start: string | null;
};
type BreakRecord = {
  id: number; employee_id: number; employee_code: string; full_name: string;
  department: string; break_type: string; start_time: string; end_time: string | null;
  notes: string | null; duration_minutes: number;
};
type Session = { token: string; role: "admin" | "employee"; name: string; employeeId?: number };
type Dashboard = {
  stats: { active_employees: number; on_break_now: number; breaks_today: number; break_minutes_today: number };
  currentlyOnBreak: (BreakRecord & { elapsed_minutes: number })[];
};
const breakLabels: Record<string, string> = { tea: "Tea break", lunch: "Lunch", personal: "Personal", restroom: "Restroom", other: "Other" };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(localStorage.getItem("breakflow-session") ? { Authorization: `Bearer ${JSON.parse(localStorage.getItem("breakflow-session")!).token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}
function formatTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}
function duration(mins: number) {
  const safe = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(safe / 60), m = safe % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
}
function initials(name: string) {
  return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
}
function breakIcon(type: string) {
  if (type === "lunch") return <Utensils size={16} />;
  if (type === "restroom") return <Toilet size={16} />;
  if (type === "personal") return <UserRound size={16} />;
  if (type === "other") return <MoreHorizontal size={16} />;
  return <Coffee size={16} />;
}
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem("breakflow-session") || "null") as Session | null; } catch { return null; }
  });
  const [loginMode, setLoginMode] = useState<"employee" | "admin">("employee");
  const [loginCode, setLoginCode] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [page, setPage] = useState<"Overview" | "Employees" | "Break history">("Overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [breaks, setBreaks] = useState<BreakRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterDate, setFilterDate] = useState(todayString());
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showStartBreak, setShowStartBreak] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [breakType, setBreakType] = useState("tea");
  const [employeeForm, setEmployeeForm] = useState({ employeeCode: "", fullName: "", email: "", department: "Engineering", jobTitle: "Employee" });
  const [mobileNav, setMobileNav] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ insertedCount: number; skippedCount: number; skipped: { row: number; employeeCode: string; reason: string }[] } | null>(null);

  const loadAll = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setError("");
    try {
      if (session.role === "employee") {
        const [me, b] = await Promise.all([
          api<Employee>("/me"),
          api<BreakRecord[]>("/breaks")
        ]);
        setEmployees([me]); setBreaks(b); setDashboard(null);
      } else {
        const [d, e, b] = await Promise.all([
          api<Dashboard>("/dashboard"),
          api<Employee[]>("/employees"),
          api<BreakRecord[]>(`/breaks?date=${filterDate}`)
        ]);
        setDashboard(d); setEmployees(e); setBreaks(b);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to connect to API";
      setError(message);
      if (message.toLowerCase().includes("log in")) logout();
    } finally { setLoading(false); }
  }, [filterDate, session]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredEmployees = useMemo(() => employees.filter(e =>
    `${e.full_name} ${e.employee_code} ${e.department} ${e.email || ""}`.toLowerCase().includes(search.toLowerCase())
  ), [employees, search]);
  const filteredBreaks = useMemo(() => breaks.filter(b =>
    !filterEmployee || String(b.employee_id) === filterEmployee
  ), [breaks, filterEmployee]);

  function logout() {
    localStorage.removeItem("breakflow-session");
    setSession(null); setDashboard(null); setEmployees([]); setBreaks([]);
    setError(""); setLoading(false); setPage("Overview");
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    try {
      const path = loginMode === "admin" ? "/login/admin" : "/login/employee";
      const body = loginMode === "admin"
        ? { username: loginUsername, password: loginPassword }
        : { employeeCode: loginCode, email: loginEmail };
      const result = await api<Session>(path, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem("breakflow-session", JSON.stringify(result));
      setSession(result); setLoading(true); setPage("Overview");
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Unable to log in.");
    } finally { setLoginBusy(false); }
  }

  async function startBreak(employeeId: string, type = breakType) {
    try {
      await api("/breaks/start", { method: "POST", body: JSON.stringify({ employeeId: Number(employeeId), breakType: type }) });
      setToast("Break started successfully");
      setShowStartBreak(false); setSelectedEmployee("");
      await loadAll();
    } catch (e) { setToast(e instanceof Error ? e.message : "Could not start break"); }
  }
  async function endBreak(id: number) {
    try {
      await api(`/breaks/${id}/end`, { method: "POST", body: JSON.stringify({}) });
      setToast("Break ended and duration recorded");
      await loadAll();
    } catch (e) { setToast(e instanceof Error ? e.message : "Could not end break"); }
  }
  async function addEmployee(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/employees", { method: "POST", body: JSON.stringify(employeeForm) });
      setToast("Employee added successfully");
      setShowAddEmployee(false);
      setEmployeeForm({ employeeCode: "", fullName: "", email: "", department: "Engineering", jobTitle: "Employee" });
      await loadAll();
    } catch (e) { setToast(e instanceof Error ? e.message : "Could not add employee"); }
  }
  async function importEmployees(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportReport(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The workbook does not contain a worksheet.");
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!rawRows.length) throw new Error("The first worksheet is empty. Use the employee import template.");
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const employeesToImport = rawRows.map(row => {
        const values = new Map(Object.entries(row).map(([key, value]) => [normalize(key), value]));
        const get = (...keys: string[]) => {
          for (const key of keys) {
            const value = values.get(normalize(key));
            if (value !== undefined && value !== null) return String(value).trim();
          }
          return "";
        };
        return {
          employeeCode: get("Employee Code", "EmployeeCode", "Code", "Employee ID", "EmployeeId"),
          fullName: get("Full Name", "FullName", "Employee Name", "Name"),
          email: get("Email", "Email Address", "EmailAddress"),
          department: get("Department", "Team"),
          jobTitle: get("Job Title", "JobTitle", "Designation", "Role")
        };
      });
      const report = await api<{ insertedCount: number; skippedCount: number; skipped: { row: number; employeeCode: string; reason: string }[] }>(
        "/employees/import", { method: "POST", body: JSON.stringify({ employees: employeesToImport }) }
      );
      setImportReport(report);
      setToast(`Excel import complete: ${report.insertedCount} inserted, ${report.skippedCount} skipped`);
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not import Excel file");
    } finally { setImporting(false); }
  }

  async function toggleEmployee(e: Employee) {
    try {
      await api(`/employees/${e.id}/status`, { method: "PATCH", body: JSON.stringify({ status: e.status === "active" ? "inactive" : "active" }) });
      setToast(`${e.full_name} marked ${e.status === "active" ? "inactive" : "active"}`);
      await loadAll();
    } catch (err) { setToast(err instanceof Error ? err.message : "Could not update employee"); }
  }
  function exportCsv() {
    const rows = [["Employee", "Code", "Department", "Break type", "Start", "End", "Duration minutes", "Status"],
      ...filteredBreaks.map(b => [b.full_name, b.employee_code, b.department, breakLabels[b.break_type] || b.break_type,
        new Date(b.start_time).toISOString(), b.end_time ? new Date(b.end_time).toISOString() : "",
        String(b.duration_minutes), b.end_time ? "Completed" : "In progress"])];
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `break-history-${filterDate}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const nav = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Employees", icon: Users },
    { label: "Break history", icon: AlarmClock }
  ] as const;

  if (!session) return <div className="auth-screen">
    <div className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><Activity size={22}/></div><div><b>breakflow</b><small>WORKFORCE CARE</small></div></div>
      <div className="eyebrow">SECURE WORKSPACE <span className="eyebrow-line"/></div>
      <h1>Welcome back</h1><p className="auth-intro">Sign in to manage your breaks or view your personal break dashboard.</p>
      <div className="auth-tabs"><button className={loginMode==="employee"?"selected":""} onClick={()=>{setLoginMode("employee");setLoginError("");}}>Employee login</button><button className={loginMode==="admin"?"selected":""} onClick={()=>{setLoginMode("admin");setLoginError("");}}>Admin login</button></div>
      <form className="modal-form auth-form" onSubmit={handleLogin}>
        {loginMode==="employee" ? <><label>Employee code<input required autoComplete="username" placeholder="e.g. EMP-1001" value={loginCode} onChange={e=>setLoginCode(e.target.value)}/></label><label>Registered work email<input required type="email" autoComplete="email" placeholder="name@company.com" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/></label><div className="modal-info"><Users size={16}/> Use the employee code and email recorded in the directory.</div></> : <><label>Admin username<input required autoComplete="username" value={loginUsername} onChange={e=>setLoginUsername(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}/></label><div className="modal-info"><CheckCircle2 size={16}/> Default starter login: admin / admin123. Change it in server/.env.</div></>}
        {loginError && <div className="error-banner">{loginError}</div>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={loginBusy}>{loginBusy?"Signing in…":"Sign in"} <ArrowUpRight size={16}/></button>
      </form>
      <small className="auth-foot">BreakFlow · Employee Break Management</small>
    </div>
  </div>;

  if (session.role === "employee") {
    const me = employees[0];
    const activeBreak = me?.open_break_id ? breaks.find(b => b.id === me.open_break_id) : null;
    return <div className="employee-screen">
      <header className="employee-topbar"><div className="auth-brand"><div className="brand-mark"><Activity size={20}/></div><div><b>breakflow</b><small>EMPLOYEE PORTAL</small></div></div><div className="employee-top-actions"><span className="employee-greeting">{session.name}</span><button className="btn btn-secondary" onClick={logout}>Log out</button></div></header>
      <main className="employee-main">
        <div className="page-heading"><div><div className="eyebrow">MY WORKDAY <span className="eyebrow-line"/></div><h1>Hello, {session.name.split(" ")[0]} 👋</h1><p>Start or end your break with one click. Only your own activity is shown here.</p></div><button className="btn btn-secondary" onClick={()=>{setLoading(true);void loadAll();}}><RefreshCw size={16}/> Refresh</button></div>
        <div className="employee-summary-grid">
          <div className="employee-summary-card"><span>EMPLOYEE CODE</span><b>{me?.employee_code || "—"}</b></div>
          <div className="employee-summary-card"><span>DEPARTMENT</span><b>{me?.department || "—"}</b></div>
          <div className="employee-summary-card"><span>TODAY'S BREAKS</span><b>{breaks.filter(b=>todayString()===new Date(b.start_time).getFullYear()+"-"+String(new Date(b.start_time).getMonth()+1).padStart(2,"0")+"-"+String(new Date(b.start_time).getDate()).padStart(2,"0")).length}</b></div>
        </div>
        <section className="panel employee-break-panel">
          <div className="panel-heading"><div><h2>{activeBreak ? "Your break is in progress" : "Take a break"}</h2><p>{activeBreak ? `${breakLabels[activeBreak.break_type] || activeBreak.break_type} started at ${formatTime(activeBreak.start_time)}` : "Choose a break type. The server records the exact start time."}</p></div><span className={`status-pill ${activeBreak?"inactive":"active"}`}>{activeBreak?"On break":"At desk"}</span></div>
          {activeBreak ? <div className="employee-active-break"><div className={`break-type-icon ${activeBreak.break_type}`}>{breakIcon(activeBreak.break_type)}</div><div><b>{breakLabels[activeBreak.break_type] || activeBreak.break_type}</b><small>Started {formatDate(activeBreak.start_time)} at {formatTime(activeBreak.start_time)}</small></div><button className="btn btn-primary" onClick={()=>void endBreak(activeBreak.id)}><Clock3 size={17}/> End break now</button></div> :
            <div className="employee-break-options">{Object.entries(breakLabels).map(([type,label])=><button key={type} className="employee-break-option" disabled={!me || me.status!=="active"} onClick={()=>void startBreak(String(me.id),type)}><span className={`break-type-icon ${type}`}>{breakIcon(type)}</span><b>{label}</b><small>Start with one click</small><span className="one-click-arrow"><ArrowUpRight size={16}/></span></button>)}</div>}
        </section>
        <section className="panel table-panel employee-history"><div className="table-toolbar"><div><h2>My break activity</h2><p>Only break sessions associated with your login are listed.</p></div><span className="live-pill"><span className="live-dot"/> PRIVATE VIEW</span></div><BreakTable records={breaks} onEnd={endBreak}/></section>
        {error && <div className="error-banner">{error}</div>}
        {loading && <div className="loading-line"><span className="spinner"/> Loading your activity…</div>}
        <footer className="page-footer"><span>© 2026 BreakFlow · Employee Break Management</span><span>Times are recorded by the server and saved to PostgreSQL.</span></footer>
      </main>
      {toast && <div className={`toast ${toast.toLowerCase().includes("success")||toast.toLowerCase().includes("recorded")?"success":""}`}><CheckCircle2 size={18}/>{toast}<button onClick={()=>setToast("")}><X size={15}/></button></div>}
    </div>;
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><b>breakflow</b><small>WORKFORCE CARE</small></div><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.label} className={`nav-item ${page === item.label ? "active" : ""}`} onClick={() => {setPage(item.label); setMobileNav(false);}}><item.icon size={18}/><span>{item.label}</span>{item.label === "Break history" && <span className="nav-count">{breaks.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CheckCircle2 size={18}/></div><b>Healthy habits,<br/>better work.</b><p>Small breaks make a big difference to your team's day.</p></div>
        <div className="profile"><div className="avatar admin">{initials(session?.name || "Admin")}</div><div className="profile-info"><b>{session?.name || "Admin"}</b><small>{session?.role === "admin" ? "Workspace admin" : "Employee account"}</small></div><button className="small-action subtle" onClick={logout}>Log out</button></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)}><Menu size={21}/></button>
        <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div>
        <div className="topbar-right"><div className="live-pill"><span className="live-dot"></span> System live</div><div className="top-date"><CalendarDays size={15}/>{new Date().toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"})}</div><button className="small-action subtle" onClick={logout}>Log out</button><div className="avatar admin top-avatar">{initials(session?.name || "Admin")}</div></div>
      </header>

      <div className="page-wrap">
        {error && <div className="error-banner"><b>Could not load live data.</b> {error}. Check PostgreSQL, the server, and the API URL. <button onClick={() => {setLoading(true); void loadAll();}}>Retry</button></div>}
        {page === "Overview" && <>
          <div className="page-heading"><div><div className="eyebrow">TEAM PULSE <span className="eyebrow-line"></span></div><h1>Good morning, Admin <span className="wave">✳</span></h1><p>Here's what's happening with your team today.</p></div><div className="heading-actions"><button className="btn btn-secondary" onClick={() => {setLoading(true); void loadAll();}}><RefreshCw size={16}/> Refresh</button><button className="btn btn-primary" onClick={() => setShowStartBreak(true)}><Plus size={17}/> Start a break</button></div></div>
          <div className="stats-grid">
            <StatCard title="Active employees" value={dashboard?.stats.active_employees ?? "—"} icon={<Users size={19}/>} tone="purple" note="Currently active in workspace" />
            <StatCard title="On break now" value={dashboard?.stats.on_break_now ?? "—"} icon={<Coffee size={19}/>} tone="orange" note="Employees taking a break" />
            <StatCard title="Breaks taken today" value={dashboard?.stats.breaks_today ?? "—"} icon={<AlarmClock size={19}/>} tone="blue" note="All break sessions today" />
            <StatCard title="Break time today" value={dashboard ? duration(Math.round(Number(dashboard.stats.break_minutes_today))) : "—"} icon={<Clock3 size={19}/>} tone="green" note="Total team break duration" />
          </div>
          <div className="content-grid">
            <section className="panel on-break-panel"><div className="panel-heading"><div><h2>On break right now <span className="heading-count">{dashboard?.currentlyOnBreak.length ?? 0}</span></h2><p>Live view of your team's active breaks</p></div><span className="live-indicator"><span className="live-dot"></span> LIVE</span></div>
              {dashboard?.currentlyOnBreak.length ? <div className="break-live-list">{dashboard.currentlyOnBreak.map(b => <div className="live-row" key={b.id}><div className={`break-type-icon ${b.break_type}`}>{breakIcon(b.break_type)}</div><div className="live-person"><b>{b.full_name}</b><small>{b.employee_code} · {b.department}</small></div><div className="live-break-kind"><b>{breakLabels[b.break_type] || b.break_type}</b><small>Started {formatTime(b.start_time)}</small></div><div className="elapsed"><Clock3 size={14}/>{duration(b.elapsed_minutes)}</div><button className="btn btn-end" onClick={() => void endBreak(b.id)}>End break</button></div>)}</div>
              : <EmptyState icon={<Coffee size={23}/>} title="Everyone is at their desk" message="When someone starts a break, they'll appear here."/>}
              <div className="panel-footer"><span><span className="live-dot"></span> Updates when you refresh</span><button className="text-button" onClick={() => setPage("Break history")}>View break history <ArrowUpRight size={14}/></button></div>
            </section>
            <section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Common tasks, one click away</p></div></div>
              <button className="quick-action" onClick={() => setShowAddEmployee(true)}><div className="quick-icon violet"><Users size={18}/></div><div><b>Add an employee</b><small>Grow your team directory</small></div><ArrowDownRight size={16}/></button>
              <button className="quick-action" onClick={() => setShowStartBreak(true)}><div className="quick-icon peach"><Coffee size={18}/></div><div><b>Start a break</b><small>Record a new break session</small></div><ArrowDownRight size={16}/></button>
              <button className="quick-action" onClick={() => setPage("Break history")}><div className="quick-icon mint"><AlarmClock size={18}/></div><div><b>Review break history</b><small>See recorded team activity</small></div><ArrowDownRight size={16}/></button>
              <div className="wellbeing-note"><div className="note-spark">✳</div><div><b>A little reminder</b><p>Regular short breaks can help improve focus and reduce fatigue.</p></div></div>
            </section>
          </div>
          <section className="panel recent-panel"><div className="panel-heading"><div><h2>Today's break activity</h2><p>Recent break sessions recorded in the system</p></div><button className="text-button" onClick={() => setPage("Break history")}>See all <ArrowUpRight size={14}/></button></div><BreakTable records={breaks.slice(0, 5)} onEnd={endBreak}/></section>
        </>}

        {page === "Employees" && <>
          <div className="page-heading"><div><div className="eyebrow">PEOPLE DIRECTORY <span className="eyebrow-line"></span></div><h1>Employees</h1><p>Manage your people and their break status.</p></div><div className="heading-actions"><a className="btn btn-secondary" href="/employee-import-template.xlsx" download><Download size={16}/> Excel template</a><label className={`btn btn-secondary ${importing ? "disabled" : ""}`} style={{cursor: importing ? "wait" : "pointer"}}><Upload size={16}/>{importing ? "Importing…" : "Import Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={importEmployees} disabled={importing} style={{display:"none"}} /></label><button className="btn btn-primary" onClick={() => setShowAddEmployee(true)}><Plus size={17}/> Add employee</button></div></div>
          <div className="stats-grid compact-stats"><StatCard title="Total employees" value={employees.length} icon={<Users size={19}/>} tone="purple" note="In the directory"/><StatCard title="Active" value={employees.filter(e=>e.status==="active").length} icon={<CheckCircle2 size={19}/>} tone="green" note="Can start a break"/><StatCard title="Currently on break" value={employees.filter(e=>e.open_break_id).length} icon={<Coffee size={19}/>} tone="orange" note="Open break sessions"/><StatCard title="Departments" value={new Set(employees.map(e=>e.department)).size} icon={<Building2 size={19}/>} tone="blue" note="Across your team"/></div>
          <section className="panel table-panel"><div className="table-toolbar"><div><h2>Team directory</h2><p>{filteredEmployees.length} employees listed</p></div><div className="toolbar-actions"><div className="search-box"><Search size={16}/><input placeholder="Search people..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div></div>
            <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>DEPARTMENT</th><th>ROLE</th><th>STATUS</th><th>BREAK STATUS</th><th>ACTION</th></tr></thead><tbody>
              {filteredEmployees.map(e=><tr key={e.id}><td><div className="employee-cell"><div className="avatar person">{initials(e.full_name)}</div><div><b>{e.full_name}</b><small>{e.employee_code} · {e.email || "No email"}</small></div></div></td><td>{e.department}</td><td>{e.job_title}</td><td><span className={`status-pill ${e.status}`}>{e.status}</span></td><td>{e.open_break_id?<span className="break-status on"><span className="live-dot"/>{breakLabels[e.open_break_type || ""] || "On break"}</span>:<span className="break-status">At desk</span>}</td><td><div className="row-actions">{e.status==="active" && !e.open_break_id && <button className="small-action" onClick={()=>{setSelectedEmployee(String(e.id));setShowStartBreak(true);}}>Start break</button>}<button className="small-action subtle" onClick={()=>void toggleEmployee(e)}>{e.status==="active"?"Deactivate":"Activate"}</button></div></td></tr>)}
            </tbody></table>{!filteredEmployees.length && <EmptyState icon={<Users size={22}/>} title="No employees found" message="Try a different search or add an employee."/>}</div>
          </section>
          {importReport && <section className="panel" style={{marginTop:16,padding:20}}><div className="panel-heading"><div><h2>Latest Excel import</h2><p>{importReport.insertedCount} employee(s) added to PostgreSQL; {importReport.skippedCount} row(s) skipped.</p></div><button className="icon-button" onClick={() => setImportReport(null)} aria-label="Dismiss import report"><X size={17}/></button></div>{importReport.skipped.length > 0 && <div className="table-scroll"><table><thead><tr><th>Excel row</th><th>Employee code</th><th>Reason skipped</th></tr></thead><tbody>{importReport.skipped.map((item,index)=><tr key={`${item.row}-${index}`}><td>{item.row}</td><td>{item.employeeCode || "—"}</td><td>{item.reason}</td></tr>)}</tbody></table></div>}</section>}
        </>}

        {page === "Break history" && <>
          <div className="page-heading"><div><div className="eyebrow">ACTIVITY LOG <span className="eyebrow-line"></span></div><h1>Break history</h1><p>A clear record of every break session logged in your workspace.</p></div><div className="heading-actions"><button className="btn btn-secondary" onClick={exportCsv}><Download size={16}/> Export CSV</button></div></div>
          <section className="panel table-panel"><div className="table-toolbar"><div><h2>Break records</h2><p>{filteredBreaks.length} sessions · Maximum 500 records per query</p></div><div className="toolbar-actions"><select value={filterEmployee} onChange={e=>setFilterEmployee(e.target.value)}><option value="">All employees</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select><input aria-label="Filter date" type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/></div></div><BreakTable records={filteredBreaks} onEnd={endBreak}/></section>
          <div className="history-footnote"><CheckCircle2 size={16}/> Break start and end times are recorded by the server and saved in PostgreSQL.</div>
        </>}
        {loading && <div className="loading-line"><span className="spinner"></span> Loading workspace data…</div>}
        <footer className="page-footer"><span>© 2026 BreakFlow · Employee Break Management</span><span>Made for healthier workdays <span className="footer-heart">✳</span></span></footer>
      </div>
    </main>

    {showAddEmployee && <Modal title="Add an employee" subtitle="Add a person to your team directory." onClose={() => setShowAddEmployee(false)}><form className="modal-form" onSubmit={addEmployee}>
      <label>Employee code *<input required placeholder="e.g. EMP-1006" value={employeeForm.employeeCode} onChange={e=>setEmployeeForm({...employeeForm,employeeCode:e.target.value})}/></label>
      <label>Full name *<input required placeholder="e.g. Maya Shah" value={employeeForm.fullName} onChange={e=>setEmployeeForm({...employeeForm,fullName:e.target.value})}/></label>
      <label>Email address<input type="email" placeholder="maya@company.com" value={employeeForm.email} onChange={e=>setEmployeeForm({...employeeForm,email:e.target.value})}/></label>
      <div className="form-two"><label>Department<input placeholder="Engineering" value={employeeForm.department} onChange={e=>setEmployeeForm({...employeeForm,department:e.target.value})}/></label><label>Job title<input placeholder="Employee" value={employeeForm.jobTitle} onChange={e=>setEmployeeForm({...employeeForm,jobTitle:e.target.value})}/></label></div>
      <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setShowAddEmployee(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Plus size={16}/> Add employee</button></div>
    </form></Modal>}

    {showStartBreak && <Modal title="Start a break" subtitle="Choose an employee and break type to create a record." onClose={() => {setShowStartBreak(false);setSelectedEmployee("");}}><form className="modal-form" onSubmit={e=>{e.preventDefault();if(selectedEmployee)void startBreak(selectedEmployee);}}>
      <label>Employee *<select required value={selectedEmployee} onChange={e=>setSelectedEmployee(e.target.value)}><option value="">Select an employee</option>{employees.filter(e=>e.status==="active"&&!e.open_break_id).map(e=><option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}</select></label>
      <label>Break type *</label><div className="break-type-options">{Object.entries(breakLabels).map(([value,label])=><button type="button" key={value} className={`break-type-option ${breakType===value?"selected":""}`} onClick={()=>setBreakType(value)}>{breakIcon(value)}<span>{label}</span>{breakType===value&&<CheckCircle2 size={15} className="selected-check"/>}</button>)}</div>
      <div className="modal-info"><Clock3 size={16}/> The start time will be recorded automatically by the server.</div>
      <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setShowStartBreak(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!selectedEmployee}><Coffee size={16}/> Start break</button></div>
    </form></Modal>}
    {toast && <div className={`toast ${toast.toLowerCase().includes("success")||toast.toLowerCase().includes("recorded")||toast.toLowerCase().includes("marked")?"success":""}`}><CheckCircle2 size={18}/>{toast}<button onClick={()=>setToast("")}><X size={15}/></button></div>}
  </div>;
}

function StatCard({title,value,icon,tone,note}:{title:string;value:ReactNode;icon:ReactNode;tone:string;note:string}) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}
function EmptyState({icon,title,message}:{icon:ReactNode;title:string;message:string}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><b>{title}</b><p>{message}</p></div>;
}
function BreakTable({records,onEnd}:{records:BreakRecord[];onEnd:(id:number)=>void}) {
  if (!records.length) return <EmptyState icon={<AlarmClock size={22}/>} title="No break records yet" message="Break sessions will show up here once someone starts a break."/>;
  return <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>BREAK TYPE</th><th>START TIME</th><th>END TIME</th><th>DURATION</th><th>STATUS</th></tr></thead><tbody>{records.map(b=><tr key={b.id}><td><div className="employee-cell"><div className="avatar person">{initials(b.full_name)}</div><div><b>{b.full_name}</b><small>{b.employee_code} · {b.department}</small></div></div></td><td><span className={`type-badge ${b.break_type}`}>{breakIcon(b.break_type)}{breakLabels[b.break_type]||b.break_type}</span></td><td><b className="time-value">{formatTime(b.start_time)}</b><small className="table-sub">{formatDate(b.start_time)}</small></td><td><b className="time-value">{formatTime(b.end_time)}</b><small className="table-sub">{b.end_time?formatDate(b.end_time):"Not ended yet"}</small></td><td><b>{duration(b.duration_minutes)}</b></td><td>{b.end_time?<span className="status-pill completed">Completed</span>:<button className="small-action end-inline" onClick={()=>onEnd(b.id)}>End break</button>}</td></tr>)}</tbody></table></div>;
}
function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:ReactNode}) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal"><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>{children}</div></div>;
}
