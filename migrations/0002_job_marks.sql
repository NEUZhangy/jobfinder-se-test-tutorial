CREATE TABLE job_marks (
  job_id    TEXT PRIMARY KEY REFERENCES jobs (id),
  mark      TEXT NOT NULL CHECK (mark IN ('saved', 'hidden')),
  marked_at INTEGER NOT NULL
);
