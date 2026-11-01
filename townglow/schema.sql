CREATE TABLE spots (id TEXT PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, address TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'Community spot', neighborhood TEXT NOT NULL DEFAULT '', consent_status TEXT NOT NULL DEFAULT 'pending', submitter_sub TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE reviews (id TEXT PRIMARY KEY, spot_id TEXT NOT NULL, event TEXT NOT NULL, user_sub TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL CHECK(length(comment) <= 250), status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (spot_id) REFERENCES spots(id));
CREATE INDEX idx_spots_status ON spots(consent_status);
CREATE INDEX idx_reviews_approved ON reviews(spot_id,event,status);
CREATE INDEX idx_reviews_submitter ON reviews(user_sub);
