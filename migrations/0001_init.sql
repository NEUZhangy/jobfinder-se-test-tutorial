CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  url          TEXT NOT NULL,
  locations    TEXT NOT NULL,
  active       INTEGER NOT NULL,
  date_posted  INTEGER NOT NULL,
  date_updated INTEGER NOT NULL
);
CREATE INDEX jobs_by_posted ON jobs (active, date_posted DESC);

CREATE TABLE job_pages (
  job_id      TEXT PRIMARY KEY REFERENCES jobs (id),
  status      TEXT NOT NULL CHECK (status IN ('ok', 'closed', 'failed')),
  description TEXT,
  error       TEXT,
  fetched_at  INTEGER NOT NULL
);

CREATE TABLE profile (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text       TEXT,
  resume_version    INTEGER NOT NULL DEFAULT 0,
  categories        TEXT NOT NULL DEFAULT '["Software","AI/ML/Data"]',
  location_keywords TEXT NOT NULL DEFAULT '[]',
  needs_sponsorship INTEGER NOT NULL DEFAULT 1
);
INSERT INTO profile (id) VALUES (1);

CREATE TABLE evaluations (
  job_id         TEXT NOT NULL REFERENCES jobs (id),
  resume_version INTEGER NOT NULL,
  fit            REAL,
  sponsorship    TEXT,
  sponsorship_p  REAL,
  new_grad_p     REAL,
  model          TEXT,
  error          TEXT,
  evaluated_at   INTEGER NOT NULL,
  PRIMARY KEY (job_id, resume_version)
);

CREATE TABLE sync_state (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  etag  TEXT,
  at    INTEGER
);
INSERT INTO sync_state (id) VALUES (1);
