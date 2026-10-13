-- Wird einmalig beim ersten Start des Postgres-Containers ausgeführt.
-- Zwei Rollen: Migrator (Owner, DDL) und App (DML, unterliegt Row-Level-Security).
CREATE ROLE isms_migrator LOGIN PASSWORD 'isms_migrator' CREATEDB;
CREATE ROLE isms_app LOGIN PASSWORD 'isms_app' NOBYPASSRLS;

CREATE DATABASE isms OWNER isms_migrator;
CREATE DATABASE isms_test OWNER isms_migrator;

-- Keine temporären Objekte für die App-Rolle: Eine temporäre Tabelle verdeckt sonst eine Tabelle
-- gleichen Namens in jeder Funktion ohne festen Suchpfad. TEMPORARY kommt über PUBLIC; die
-- Eigentümerin isms_migrator (auch pg-boss) behält es. Migration 0022 wiederholt das.
REVOKE TEMPORARY ON DATABASE isms FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE isms_test FROM PUBLIC;

\connect isms
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
GRANT USAGE ON SCHEMA public TO isms_app;

\connect isms_test
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
GRANT USAGE ON SCHEMA public TO isms_app;
