-- BreakFlow Employee Break Management
-- Run this file while connected to the `breakflow` database.

CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    employee_code VARCHAR(30) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(180) UNIQUE,
    department VARCHAR(100) NOT NULL DEFAULT 'General',
    job_title VARCHAR(100) NOT NULL DEFAULT 'Employee',
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS breaks (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    break_type VARCHAR(30) NOT NULL
        CHECK (break_type IN ('tea', 'lunch', 'personal', 'restroom', 'other')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    notes VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time IS NULL OR end_time >= start_time)
);

-- At most one open break per employee.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_break_per_employee
ON breaks(employee_id) WHERE end_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_breaks_start_time ON breaks(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_breaks_employee_start ON breaks(employee_id, start_time DESC);

-- Sample employees. IDs are generated automatically.
INSERT INTO employees (employee_code, full_name, email, department, job_title)
VALUES
 ('EMP-1001', 'Aarav Sharma', 'aarav.sharma@example.com', 'Engineering', 'Frontend Developer'),
 ('EMP-1002', 'Priya Patel', 'priya.patel@example.com', 'Operations', 'Operations Executive'),
 ('EMP-1003', 'Rohan Desai', 'rohan.desai@example.com', 'Support', 'Support Specialist'),
 ('EMP-1004', 'Ananya Kulkarni', 'ananya.kulkarni@example.com', 'Human Resources', 'HR Associate'),
 ('EMP-1005', 'Kabir Joshi', 'kabir.joshi@example.com', 'Engineering', 'Backend Developer')
ON CONFLICT (employee_code) DO NOTHING;
