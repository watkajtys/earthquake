-- migrations/0011_create_notes_table.sql

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  note TEXT NOT NULL
);
