# Deployment

Wie die ISMS-Suite in Betrieb geht — vom leeren Rechner bis zur laufenden Anwendung, und was
danach zu tun ist: aktualisieren, sichern, zurückspielen, hinter TLS stellen.

Es gibt zwei Wege. **Mit Containern** (empfohlen, ein Befehl) und **ohne** (für einen Server,
auf dem Node und PostgreSQL ohnehin laufen). Beides braucht ausschließlich quelloffene
Bestandteile und keinen Cloud-Dienst: PostgreSQL 16, nginx, Node 22.

---

## 1. Was gestartet wird

```
                      ┌──────────────┐
  Browser  ──:8080──▶ │  web (nginx) │  statisches Bündel + /api weiterreichen
                      └──────┬───────┘
                             │ /api
                      ┌──────▼───────┐        ┌──────────────┐
                      │     api      │◀───────│    worker    │  tägliche Wiedervorlage
                      └──────┬───────┘        └──────┬───────┘
                             │                       │
                      ┌──────▼───────────────────────▼───────┐
                      │            postgres 16               │
                      └──────────────────────────────────────┘
                                     ▲
                             ┌───────┴────────┐
                             │    migrate     │  läuft einmal und beendet sich:
                             └────────────────┘  Schema, Katalog, Demodaten
```

Fünf Dienste, zwei Datenträger (`isms_pgdata` für die Datenbank, `isms_files` für hochgeladene
Nachweise). Die Oberfläche und die API liegen bewusst auf **einem Ursprung** — das
Refresh-Cookie ist `SameSite=strict`, über zwei Ursprünge käme es nie zurück.

---

## 2. Voraussetzungen

|                 |                                                                        |
| --------------- | ---------------------------------------------------------------------- |
| Docker          | Engine ≥ 24 mit Compose v2 (`docker compose version`)                  |
| Arbeitsspeicher | 2 GB reichen für eine Vorführung, 4 GB für den Dauerbetrieb            |
| Plattenplatz    | ~2 GB für die Abbilder, dazu der Platz für Nachweisdateien             |
| Offene Ports    | 8080 (Oberfläche). PostgreSQL wird **nicht** nach außen veröffentlicht |
| Netz beim Bau   | Zugriff auf Docker Hub und die npm-Registry                            |

Für den Weg ohne Container zusätzlich: Node ≥ 22, pnpm ≥ 10, PostgreSQL 16.

---

## 3. Erster Start mit Containern

```bash
# 1. Quellcode holen
git clone https://github.com/Kico-bot/ISMS_SaaS.git
cd ISMS_SaaS

# 2. Eigene Geheimnisse erzeugen (für mehr als eine Vorführung Pflicht)
{
  echo "ISMS_JWT_SECRET=$(openssl rand -base64 48)"
  echo "ISMS_APP_MASTER_KEY=$(openssl rand -base64 32)"
  echo "ISMS_POSTGRES_PASSWORD=$(openssl rand -base64 24)"
} >> .env

# 3. Bauen und starten
docker compose up -d --build

# 4. Zusehen, bis die Migration durch ist (dauert beim ersten Mal ein bis zwei Minuten)
docker compose logs -f migrate

# 5. Prüfen, dass alles läuft
curl -fsS http://localhost:8080/api/v1/health
docker compose ps
```

Danach:

- Oberfläche: **http://localhost:8080**
- Schnittstellendokumentation: http://localhost:8080/api/docs
- Gesundheitsabfrage: http://localhost:8080/api/v1/health

Der `migrate`-Dienst läuft genau einmal durch — er lässt das Schema wandern, sät die
Regelwerkskataloge (ISO 27001, IT-Grundschutz, NIS2, DSGVO samt Querverweisen) und legt den
Demomandanten an. `api`, `worker` und `web` starten erst, wenn er fehlerfrei fertig ist; so
trifft die Anwendung nie auf ein halbes Schema.

### Erste Anmeldung

Mit Demodaten (Standard, `ISMS_SEED_DEMO=true`) steht der erfundene Mandant **Nordlicht
Energiewerke GmbH** bereit. Kennwort für alle Konten: `demo-passwort-2026-nordlicht`

| Konto                               | Rolle                                              |
| ----------------------------------- | -------------------------------------------------- |
| `henrike.sallach@nordlicht.example` | ISMS-Leitung (CISO)                                |
| `jorin.kessler@nordlicht.example`   | Stellvertretung — gibt Dokumente frei (Vier-Augen) |
| `bastian.olwig@nordlicht.example`   | Asset- und Risk-Owner                              |
| `corinna.feldt@nordlicht.example`   | Interne Auditorin                                  |
| `ilka.norgaard@nordlicht.example`   | Datenschutzbeauftragte                             |

**Ohne** Demodaten (`ISMS_SEED_DEMO=false`) ist die Anwendung leer: auf der Anmeldeseite legt
„Mandant anlegen“ die Organisation samt erster ISMS-Managerin an. Dabei wird ISO 27001 als
führendes Regelwerk aktiviert; weitere schaltet man unter **Einstellungen → Normen &
Regelwerke** dazu.

---

## 4. Konfiguration

Alle Stellschrauben tragen das Präfix `ISMS_` und werden aus der `.env` im Projektverzeichnis
gelesen (oder aus der Umgebung). Das Präfix hat einen Grund: Compose liest dieselbe `.env`, die
in diesem Projekt die _Entwicklungs_-Konfiguration enthält — ein unpräfixiertes `WEB_BASE_URL`
darin würde die Einstellung des Behälters still überschreiben.

| Variable                            | Standard           | Wofür                                                  |
| ----------------------------------- | ------------------ | ------------------------------------------------------ |
| `ISMS_WEB_PORT`                     | `8080`             | Port der Oberfläche auf dem Wirt                       |
| `ISMS_JWT_SECRET`                   | Platzhalter        | Signatur der Zugriffstoken, mindestens 32 Zeichen      |
| `ISMS_APP_MASTER_KEY`               | Platzhalter        | Schlüssel für verschlüsselte Felder (pgcrypto)         |
| `ISMS_POSTGRES_PASSWORD`            | `postgres`         | Kennwort des Datenbank-Superusers                      |
| `ISMS_COOKIE_SECURE`                | `false`            | `Secure` am Refresh-Cookie — **hinter TLS auf `true`** |
| `ISMS_SEED_DEMO`                    | `true`             | Demomandanten anlegen; für echten Betrieb `false`      |
| `ISMS_MAIL_DRIVER`                  | `log`              | `log` stellt nichts zu, `smtp` verschickt wirklich     |
| `ISMS_SMTP_HOST` / `ISMS_SMTP_PORT` | `mailpit` / `1025` | Mailserver für die Erinnerungen                        |
| `ISMS_DIGEST_CRON`                  | `0 7 * * 1-5`      | Wann die tägliche Wiedervorlage rausgeht (UTC)         |
| `ISMS_DIGEST_HORIZON_DAYS`          | `14`               | Wie weit sie vorausschaut                              |
| `ISMS_MAILPIT_PORT`                 | `8025`             | Weboberfläche des Testpostfachs                        |

Nach einer Änderung: `docker compose up -d` (neu bauen ist dafür nicht nötig).

### Erinnerungen per E-Mail

Voreingestellt verschickt die Anwendung **nichts** — jede Nachricht landet nur im Protokoll. So
läuft sie ohne SMTP-Entscheidung und ohne Zugangsdaten. Zum Ausprobieren gibt es ein
Testpostfach:

```bash
docker compose --profile mail up -d           # Mailpit auf http://localhost:8025
ISMS_MAIL_DRIVER=smtp docker compose up -d    # Zustellung einschalten
```

Für den echten Betrieb `ISMS_SMTP_HOST`, `ISMS_SMTP_PORT` und die Zugangsdaten
(`SMTP_USER`, `SMTP_PASS` in der Compose-Datei ergänzen) auf den eigenen Relay setzen.

---

## 5. Alltag

```bash
docker compose ps                     # Zustand aller Dienste
docker compose logs -f api            # Protokoll mitlesen (auch: worker, web, migrate)
docker compose restart api            # einen Dienst neu starten
docker compose stop                   # anhalten, Daten bleiben
docker compose start                  # weiterlaufen lassen
docker compose down                   # Behälter entfernen, Datenträger bleiben
docker compose down -v                # Behälter UND Daten entfernen (unwiderruflich)

docker compose exec postgres psql -U postgres isms    # Datenbank direkt
docker compose exec api sh                            # Schale im API-Behälter
```

### Aktualisieren

```bash
git pull
docker compose up -d --build
```

Der `migrate`-Dienst läuft dabei erneut, und das ist ungefährlich: angewandte Migrationen
werden übersprungen, der Katalog-Seed ist wiederholbar, und der Demo-Seed erkennt den
bestehenden Mandanten und legt nichts ein zweites Mal an. Erst danach starten API und
Oberfläche mit dem neuen Stand.

---

## 6. Datensicherung und Rückspielen

Zwei Dinge sind zu sichern: die Datenbank und die hochgeladenen Nachweisdateien. Ein Register
ohne seine Nachweise ist im Audit wertlos — beides gehört in denselben Sicherungslauf.

```bash
# Sichern
docker compose exec -T postgres pg_dump -U postgres -Fc isms > isms-$(date +%F).dump
docker run --rm -v isms_files:/data:ro -v "$PWD":/sicherung alpine \
  tar czf /sicherung/isms-dateien-$(date +%F).tgz -C /data .
```

```bash
# Zurückspielen
docker compose stop api worker web
docker compose exec -T postgres pg_restore -U postgres -d isms --clean --if-exists \
  < isms-2026-09-17.dump
docker run --rm -v isms_files:/data -v "$PWD":/sicherung alpine \
  sh -c 'rm -rf /data/* && tar xzf /sicherung/isms-dateien-2026-09-17.tgz -C /data'
docker compose start api worker web
```

Zwei Hinweise, die in einem ISMS nicht fehlen dürfen:

- **Die Sicherung ist erst eine, wenn sie zurückgespielt wurde.** Der Rückspieltest gehört in
  die eigene Maßnahmenliste (ISO 27001 A.8.13) — die Anwendung fragt ihn im Nachweisregister
  ohnehin ab.
- Die Sicherungen enthalten personenbezogene Daten und Nachweise. Sie brauchen dieselbe
  Einstufung, dieselbe Verschlüsselung und dieselbe Löschfrist wie die Anwendung selbst.

---

## 7. Vom Vorführ- in den Produktivbetrieb

Die Voreinstellungen sind auf „läuft sofort“ ausgelegt, nicht auf Betrieb. Vor dem ersten
echten Mandanten:

- [ ] **Eigene Geheimnisse**: `ISMS_JWT_SECRET`, `ISMS_APP_MASTER_KEY`,
      `ISMS_POSTGRES_PASSWORD`. Die Standardwerte stehen öffentlich im Quellcode.
- [ ] **TLS davor**: einen Reverse Proxy (nginx, Caddy, Traefik) mit Zertifikat vor
      `ISMS_WEB_PORT` setzen und **`ISMS_COOKIE_SECURE=true`** setzen. Ohne TLS wandern
      Kennwörter und Token im Klartext.
- [ ] **Demodaten aus**: `ISMS_SEED_DEMO=false`. Sonst liegt ein Mandant mit
      veröffentlichtem Kennwort in derselben Datenbank.
- [ ] **Datensicherung eingerichtet** und einmal zurückgespielt (siehe oben).
- [ ] **E-Mail** auf den eigenen Relay gestellt, sonst erreicht keine Erinnerung jemanden.
- [ ] **Protokolle** mit `logging:`-Optionen begrenzen oder an das eigene System übergeben —
      sonst füllt das Änderungsprotokoll irgendwann die Platte.
- [ ] **Datenbankrollen**: Die Anwendung arbeitet als `isms_app` ohne `BYPASSRLS`, Migrationen
      als `isms_migrator`. Wer die Kennwörter ändert, ändert sie in `postgres-init.sql` **und**
      in den beiden `DATABASE_URL`s der Compose-Datei.

Beispiel für einen Reverse Proxy davor:

```nginx
server {
  listen 443 ssl;
  server_name isms.example.org;
  ssl_certificate     /etc/letsencrypt/live/isms.example.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/isms.example.org/privkey.pem;

  client_max_body_size 64m;          # Nachweisdateien

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;          # das Auditpaket wird im Datenstrom erzeugt
  }
}
```

Dazu in der `.env`: `ISMS_COOKIE_SECURE=true`.

---

## 8. Betrieb ohne Container

Für einen Server, auf dem Node und PostgreSQL schon laufen.

```bash
# 1. Datenbankrollen und Datenbank anlegen (einmalig, als postgres-Superuser)
psql -f infra/docker/postgres-init.sql

# 2. Quellcode, Abhängigkeiten, Bau
git clone https://github.com/Kico-bot/ISMS_SaaS.git /opt/isms && cd /opt/isms
pnpm install --frozen-lockfile
pnpm -r build

# 3. Konfiguration
cp .env.example .env     # DATABASE_URL, JWT_SECRET, APP_MASTER_KEY, STORAGE_LOCAL_DIR setzen

# 4. Schema und Kataloge
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo        # optional

# 5. Starten
pnpm --filter @isms/api start     # API auf API_PORT
pnpm --filter @isms/api worker    # Hintergrundprozess, braucht JOBS_ENABLED=true
```

Die Oberfläche ist nach `pnpm -r build` ein statisches Bündel in `apps/web/dist` — es wird von
nginx (oder jedem anderen Webserver) ausgeliefert, der `/api` an die API weiterreicht; die
fertige Konfiguration dafür steht in `infra/docker/nginx.conf`.

Als systemd-Dienst:

```ini
# /etc/systemd/system/isms-api.service
[Unit]
Description=ISMS API
After=network.target postgresql.service

[Service]
User=isms
WorkingDirectory=/opt/isms
EnvironmentFile=/opt/isms/.env
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Für den Hintergrundprozess dieselbe Datei mit `ExecStart=/usr/bin/node apps/api/dist/worker.js`
und `Environment=JOBS_ENABLED=true`.

---

## 9. Fehlersuche

| Symptom                                                       | Ursache                                             | Abhilfe                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `docker compose up` bricht mit „port is already allocated“ ab | 8080 ist belegt                                     | `ISMS_WEB_PORT=8090 docker compose up -d`                                                       |
| `migrate` endet mit Fehler, API startet nicht                 | Datenbank noch nicht bereit oder Rollen fehlen      | `docker compose logs migrate`; bei verkorkstem Zustand `docker compose down -v` und neu starten |
| Anmeldung klappt, nach dem Neuladen ist man abgemeldet        | `Secure`-Cookie über `http`                         | `ISMS_COOKIE_SECURE=false` (ohne TLS) bzw. TLS einrichten                                       |
| „Ungültige Umgebungskonfiguration: JWT_SECRET …“              | Geheimnis kürzer als 32 Zeichen                     | längeren Wert setzen, `docker compose up -d`                                                    |
| Oberfläche lädt, jede Anfrage endet in 502                    | API läuft nicht                                     | `docker compose ps`, `docker compose logs api`                                                  |
| Nachweisregister zeigt „Datei fehlt im Speicher“              | Datenträger `isms_files` fehlt oder wurde verworfen | Dateisicherung zurückspielen (Abschnitt 6)                                                      |
| Keine Erinnerungen im Postfach                                | `MAIL_DRIVER=log` (Standard)                        | `ISMS_MAIL_DRIVER=smtp` und Relay eintragen                                                     |
| Nach `git pull` fehlen neue Felder                            | `migrate` lief nicht mit                            | `docker compose up -d --build` statt `start`                                                    |

Die Gesundheitsabfrage `GET /api/v1/health` prüft auch die Datenbankverbindung und eignet sich
für die Überwachung.

---

## 10. Was hier bewusst nicht steht

Kein Kubernetes, kein Terraform, keine verwaltete Datenbank. Der MVP soll auf einem Rechner
laufen und ohne laufende Kosten vorführbar sein; alles darüber hinaus wäre Infrastruktur, für
die es noch keinen Betreiber gibt. Der Dateispeicher schreibt lokal — die Schnittstelle in
`StorageService` ist absichtlich drei Methoden groß, damit ein Azure-Blob- oder S3-Treiber
später nur diese drei füllen muss, ohne dass sich an der Anwendung etwas ändert.
