CREATE TABLE rooms (
  code TEXT PRIMARY KEY NOT NULL,
  blue_key TEXT NOT NULL,
  pink_key TEXT,
  game TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL DEFAULT 1,
  rematch INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  blue_seen INTEGER NOT NULL,
  pink_seen INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX rooms_expiry ON rooms (expires_at);
