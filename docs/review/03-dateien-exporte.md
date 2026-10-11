# Review 03: Dateien, Exporte, Fehlermeldungen und Änderungsprotokoll

Stand: 11.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

**Geprüft** wurden diese Ordner:

- `apps/api/src/modules/files`
- `apps/api/src/kernel/storage`
- `apps/api/src/modules/exports`
- `apps/api/src/kernel/http`
- `apps/api/src/kernel/audit-log`

Dazu kamen die Upload-Grenzen in `app.factory.ts` und die Stellen im Web-Client, die Downloads,
Druckansichten und Verweise anzeigen, sowie die Tests in `apps/api/test`.

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer
2. Security-Auditor: Er hat Befunde mit kleinen Skripten gegen den gebauten Code nachgewiesen.
3. Test-Engineer: Er hat die Testsuiten ausgeführt und Befunde mit Proben gegen die Testdatenbank
   bestätigt.

Jede Rolle kannte die Befunde der vorherigen. Alle Proben lagen außerhalb des Repositorys. Alle
Zeilenangaben beziehen sich auf die TypeScript-Quellen und sind nachgeprüft. Wo ein Bericht Zeilen
aus dem kompilierten Code nannte, steht hier die richtige Zeile.

Befunde aus [Review 01](01-auth-mandantentrennung.md) und [Review 02](02-datenbank-rechte.md) werden
nur erweitert, nicht wiederholt.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical   | Ein einzelner Nutzer kann die Plattform für alle Mandanten lahmlegen, oder eine Zusage der Suite bricht ohne besondere Voraussetzungen. Vor einem produktiven Einsatz beheben. |
| Important  | Echter Fehler oder Angriffsweg mit begrenzter Wirkung, oder ein Test, der eine wichtige Zusage nicht prüft. Bald beheben.                                                      |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                                                                                   |

## Zusammenfassung nach den Schwerpunkten

| Schwerpunkt                                | Ergebnis                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload-Prüfung                             | Größe und Anzahl der Dateien sind begrenzt. Der Typ wird nur nach der Angabe des Browsers geprüft, nicht nach Inhalt oder Endung (I3). Textfelder neben der Datei sind unbegrenzt (I6). Umlaute im Dateinamen werden zerstört (I9).                                                                                                                                       |
| Pfade und Mandantentrennung im Dateisystem | In Ordnung. Schlüssel erzeugt der Server (`<tenantId>/<hash>/<uuid>`), jeder Pfad wird gegen das Wurzelverzeichnis geprüft (`storage.service.ts:72-78`). Namen im ZIP können nicht aus dem Ordner ausbrechen.                                                                                                                                                             |
| `sql.raw`                                  | Zwei Stellen, beide mit festen Werten aus dem Code. Keine Nutzereingabe (Tabelle unten).                                                                                                                                                                                                                                                                                  |
| Formeln in CSV-Zellen                      | Erste Zeichen werden richtig entschärft. Zellen mit Komma bleiben aber ungequotet. In Excel mit Komma als Trennzeichen entsteht daraus eine Formel (I5).                                                                                                                                                                                                                  |
| HTML-Escaping in Druckdokumenten           | In Ordnung. Jeder Wert läuft durch `escapeHtml`, der Web-Client druckt in einem iframe ohne Skripte.                                                                                                                                                                                                                                                                      |
| Auditpaket                                 | Inhalt und Mandantentrennung sind in Ordnung. Ein fehlerhafter Dateistream kann aber den ganzen API-Prozess beenden (C1). Der Test zur Mandantentrennung kann nicht scheitern (I8).                                                                                                                                                                                       |
| Fehlermeldungen                            | Keine Stacktraces und kein SQL in Antworten. Bei Verstößen gegen Eindeutigkeit und Fremdschlüssel gibt die Datenbankmeldung aber Schlüsselwerte preis. Zu große Anfragen werden zu 500 (I7).                                                                                                                                                                              |
| Kennwörter und Token im Änderungsprotokoll | Bei Anmeldung, Registrierung und Einladung wird kein Inhalt gespeichert. Sonst werden Felder namens `password`, `secret` und `token` geschwärzt, aber nur auf oberster Ebene, und der ungeprüfte Rohinhalt wird gespeichert (I6). Über Groß- und Kleinschreibung im Pfad entgehen Exporte dem Protokoll ganz (I1). Bei normalen Änderungen fehlt die IP vollständig (I2). |

## Critical

### C1 Ein Fehler beim Lesen einer Datei beendet den API-Prozess für alle Mandanten

- **Fundstellen:**
  - `apps/api/src/modules/files/files.controller.ts:73`: `stream.pipe(res)` ohne Fehlerbehandlung.
  - `apps/api/src/modules/exports/package.service.ts:184-185`: Erst prüft `exists()`, dann hängt
    `archive.append(this.storage.stream(...))` den Stream an.
  - `apps/api/src/main.ts` hat keine Behandlung für `uncaughtException`.
- **Warum es bricht:**
  - Ein `fs.ReadStream` öffnet die Datei sofort.
  - archiver reicht Fehler des Quellstreams nicht weiter und hängt seinen Fehler-Listener erst an,
    wenn der Eintrag an der Reihe ist.
  - Das Paket öffnet alle Dateien auf einmal.
  - Ein Fehler beim Öffnen hat damit keinen Empfänger, und Node beendet den Prozess.
- **Ablauf:**
  - Eine Datei wird zwischen `exists()` und dem Öffnen gelöscht. `DELETE /files/:id` darf jede
    Person mit `measure.write` aufrufen, auch mit `_own`.
  - Oder ein Mandant hat mehr Dateien, als der Prozess gleichzeitig öffnen darf (EMFILE).
  - Oder das Speichervolume liefert einen Lesefehler.
- **Nachweis:** Der Test-Engineer hat archiver 7 einen Stream auf eine fehlende Datei gegeben. Das
  Ergebnis war `uncaughtException ENOENT`.
- **Weitere Mängel im Paket:**
  - `archive.on('error')` (`package.service.ts:88`) protokolliert nur. Die Antwort ist da schon mit 200
    gestartet, der Empfänger bekommt ein abgebrochenes oder hängendes ZIP.
  - Bricht der Client ab, wird `archive.abort()` nicht aufgerufen.
- **Vorschlag:**
  - Download mit `stream.pipeline(stream, res, cb)` und im Fehlerfall 404 oder Abbruch der Antwort.
  - Im Paket die Dateien erst beim Verarbeiten öffnen, eine nach der anderen, etwa mit
    `archive.file(...)` oder einem verzögerten Stream.
  - Bei `archive.on('error')` die Antwort beenden, bei `res.on('close')` das Archiv abbrechen.

## Important

### I1 Exporte und Anmeldungen entgehen dem Änderungsprotokoll über die Schreibweise des Pfads

- **Fundstellen:** `apps/api/src/kernel/audit-log/audit-log.interceptor.ts`
  - Zeilen 24-25: `SKIP` und `LOGIN_PATHS` sind Mengen mit exakter Schreibweise.
  - Zeile 53: Vergleich mit `req.path`.
  - Zeilen 107-108: `req.path.startsWith('/api/v1/exports/')`.

  Express und Nest unterscheiden bei Routen nicht zwischen Groß- und Kleinschreibung, der
  Interceptor schon.

- **Nachweis** mit dem echten Interceptor:

  | Anfrage                         | Status      | Eintrag im Protokoll                                               |
  | ------------------------------- | ----------- | ------------------------------------------------------------------ |
  | `GET /api/v1/exports/risks.csv` | 200         | ein Export                                                         |
  | `GET /api/v1/EXPORTS/risks.csv` | 200         | **keiner**                                                         |
  | `GET /API/V1/exports/risks.csv` | 200         | **keiner**                                                         |
  | `POST /api/v1/auth/LOGIN`       | erfolgreich | „Anlegen“ auf `auth`, ohne Person und Mandant, nicht als Anmeldung |

- **Wirkung:** Wer `report.export` hat, kann das ganze Auditpaket samt aller Nachweisdateien
  herunterladen, ohne dass das Protokoll es zeigt. Eine Anmeldung mit gestohlenen Zugangsdaten
  erscheint nicht als Anmeldung der Person. CLAUDE.md nennt genau diese Ereignisse als Grund für das
  Protokoll (A.5.16, A.8.15).
- **Vorschlag:**
  - Nach der getroffenen Route einordnen, nicht nach dem Rohpfad, etwa mit einem Dekorator
    `@AuditAction('export' | 'login')` an den Handlern.
  - Hilfsweise den Pfad vor dem Vergleich klein schreiben und den Schrägstrich am Ende entfernen.
  - Oder in Express `case sensitive routing` und `strict routing` einschalten.

### I2 Bei normalen Änderungen fehlt die IP im Änderungsprotokoll ganz, hinter nginx stimmt sie nie

- **Fundstellen:**
  - `apps/api/src/kernel/audit-log/audit-log.interceptor.ts:87` speichert `req.ip`. Er liest den
    Wert erst nach dem Handler.
  - Nur die Anmeldung liest `req.ip` früh selbst (`apps/api/src/kernel/auth/auth.controller.ts:106`).
  - `apps/api/src/app.factory.ts` setzt kein `trust proxy`. `infra/docker/nginx.conf:19-24` reicht
    `X-Forwarded-For` weiter.
- **Nachweis:**
  - In der Testdatenbank haben nach dem Testlauf alle Einträge „Anlegen“ (3 von 3) und „Ändern“
    (2 von 2) keine IP. Nur die Anmeldung hat eine.
  - Der Test-Engineer hat gezeigt, dass die IP erscheint, sobald etwas sie vor dem Handler liest.
  - Ein mitgesendetes `X-Forwarded-For` wird ignoriert.
- **Wirkung:**
  - Das Protokoll kann bei Änderungen nicht sagen, woher sie kamen.
  - Im Container steht selbst bei Anmeldungen die Adresse von nginx.
  - Das Auditpaket gibt das in der Spalte „Herkunft“ weiter (`package.service.ts:884`).
- **Vorschlag:**
  - Die IP am Anfang der Anfrage festhalten, im Interceptor vor `next.handle()`.
  - `trust proxy` über eine Umgebungsvariable auf die Zahl der Proxys setzen, nie pauschal auf `true`.

### I3 Der Dateityp wird nur nach der Angabe des Browsers geprüft, Endung und Inhalt nie

- **Fundstellen:**
  - `apps/api/src/modules/files/files.service.ts:35` vergleicht `input.mimetype`. Diesen Wert setzt
    der Client im Multipart-Kopf.
  - `sanitizeFilename` (`files.service.ts:154-164`) entfernt nur Pfadanteile, Steuerzeichen und `"`.
- **Nachweis** gegen die Testdatenbank:
  - `scan.pdf.exe`, angegeben als `application/pdf`, wird mit 201 angenommen. Beim Download kommt die
    Datei als `scan.pdf.exe` mit Typ `application/pdf` zurück.
  - `rechnung‮fdp.exe` mit Steuerzeichen für Rechts-nach-links wird angenommen. Angezeigt wird der
    Name als `rechnungexe.pdf`.
- **Wirkung:**
  - Im eigenen Ursprung der Anwendung ist das harmlos, denn Downloads sind immer Anhang, mit `nosniff`
    und Sandbox-CSP.
  - Der Web-Client speichert die Datei aber unter ihrem Namen (`apps/web/src/lib/api.ts:147`).
  - Das Auditpaket liefert sie als `15-dateien/<hash>-scan.pdf.exe` aus
    (`package.service.ts:183`).
  - Beim externen Auditor landet so eine ausführbare Datei, die Oberfläche und Dateiverzeichnis als PDF
    zeigen.
  - Die Fehlermeldung in `files.service.ts:39` verspricht „Ausführbare Dateien und SVG sind
    ausgeschlossen“. Das hält der Code nicht ein.
- **Vorschlag:**
  - Je erlaubtem Typ die zulässigen Endungen festlegen und Abweichungen ablehnen.
  - Bei Binärformaten die ersten Bytes prüfen (PDF, PNG, JPEG, WEBP, ZIP und OOXML, OLE).
  - Unsichtbare Formatzeichen (`\p{Cf}`) aus Dateinamen entfernen.

### I4 Ein Nachweis-Verweis darf `javascript:` enthalten und wird als Link angezeigt

- **Fundstellen:**
  - `packages/shared/src/dto.ts:798`: `url: z.string().url()`. In Zod 3 prüft das nur, ob
    `new URL(...)` gelingt.
  - `apps/web/src/components/EvidenceSection.tsx:142-147` zeigt den Wert als `<a href={e.url}>`.
    React 18 warnt bei `javascript:` nur, es blockiert nicht.
- **Nachweis:** `javascript:alert(document.cookie)`, `data:text/html,<script>…` und `vbscript:x`
  passieren das Schema. Über die API werden sie mit 201 angenommen.
- **Wirkung:** Wer `measure.write` hat, auch nur für eigene Maßnahmen, legt einen solchen Verweis an.
  Klickt eine ISMS-Leitung oder ein Auditor darauf, kann je nach Browser Skript im Ursprung der
  Anwendung laufen. Der Zugriffstoken liegt im Speicher dieser Seite.
- **Vorschlag:** Im Schema nur `http:` und `https:` zulassen. Im Web-Client nur solche Links anzeigen.

### I5 Zellen mit Komma bleiben ungequotet, in Excel mit Komma-Trennzeichen entsteht daraus eine Formel

- **Fundstelle:** `apps/api/src/modules/exports/csv.ts:25`. Gequotet wird nur bei `"`, `;`, LF
  oder CR. Die Entschärfung (`csv.ts:16-24`) prüft nur das erste Zeichen der ganzen Zelle.
- **Nachweis:**
  - `Backup,=1+1` wird unverändert geschrieben.
  - Ebenso `x,-2+3+cmd|' /C calc'!A0`.
- **Wirkung:**
  - Ein Excel mit Komma als Listentrennzeichen trennt die Zelle am Komma. Das sind englischsprachige
    Einstellungen und damit viele externe Auditoren.
  - Der Teil nach dem Komma wird als Formel ausgewertet.
  - Betroffen sind alle Register, die Anwendbarkeitserklärung und das Dateiverzeichnis im
    Auditpaket, denn es enthält die Originalnamen.
  - Jeder, der einen Titel, eine Notiz oder einen Dateinamen schreiben darf, kann so etwas
    einschleusen.
- **Vorschlag:**
  - Jede Zelle immer in Anführungszeichen setzen. Eine gequotete Zelle wird nie getrennt.
  - Zusätzlich auch nach führenden Leerzeichen und Tabs entschärfen.
  - Zahlen nicht entschärfen: Heute wird aus `-3` die Zeichenfolge `'-3`.

### I6 Das Änderungsprotokoll speichert den ungeprüften Rohinhalt jeder Anfrage, unbegrenzt

- **Fundstellen:**
  - `apps/api/src/kernel/audit-log/audit-log.interceptor.ts:76` speichert `redact(req.body)`. Das ist
    der Inhalt vor der Zod-Prüfung, mit allen unbekannten Feldern.
  - `redact` (`audit-log.interceptor.ts:115-120`) schwärzt nur auf oberster Ebene.
  - `files.controller.ts:51` begrenzt beim Upload nur Dateigröße und Anzahl der Dateien.
  - Textfelder neben der Datei sind unbegrenzt: beliebig viele, je bis 1 MB.
- **Nachweis:**
  - Ein Upload mit 20 Textfeldern zu je 1 MB erzeugt einen Protokolleintrag von rund 20 MB.
  - 5.000 Felder werden angenommen.
  - `{"extra":{"password":"geheim"}}` wird ungeschwärzt gespeichert.
- **Wirkung:**
  - Speicher des API-Prozesses: N mal 1 MB je Anfrage, ohne Begrenzung der Versuche.
  - Dauerhaftes Anwachsen einer Tabelle, die sich bewusst nicht löschen lässt.
  - Beliebiger fremder Text im Protokoll.
  - Heute hat kein Schema ein verschachteltes Geheimnis, deshalb kein Abfluss von Kennwörtern. Der
    Schutz hängt aber an dieser Zufälligkeit.
- **Vorschlag:**
  - Das geprüfte Schema-Ergebnis protokollieren statt des Rohinhalts, etwa indem `ZodPipe` es an der
    Anfrage ablegt.
  - Rekursiv schwärzen und die Größe begrenzen, zum Beispiel auf 16 KB.
  - Beim Upload `fields`, `fieldSize` und `parts` begrenzen und statt des Inhalts die Metadaten der
    Datei protokollieren (Name, Hash, Größe, Typ).

### I7 Fehlermeldungen geben Schlüsselwerte aus der Datenbank preis, zu große Anfragen werden zu 500

- **Fundstellen:**
  - `apps/api/src/kernel/http/problem.filter.ts:57-62` (23505) und `:64-70` (23503) geben
    `e.detail` von PostgreSQL an den Client, zum Beispiel `Key (email)=(x@y) already exists`.
    Review 01 nannte nur 23503.
  - Bei einer global eindeutigen Spalte verrät das Werte über Mandanten hinweg.
  - Ein zu großer JSON-Inhalt löst im Body-Parser `PayloadTooLargeError` aus (Status 413). Das ist
    weder eine `HttpException` noch ein Datenbankfehler. Der Filter macht daraus 500 „Interner
    Fehler“ und schreibt einen Stacktrace ins Log, auch ohne Anmeldung.
- **Nachweis:** Ein JSON-Inhalt von 200 KB ergibt `500 {"title":"Interner Fehler"}`. Ungültiges JSON
  wird dagegen sauber mit 400 beantwortet, ohne den Inhalt zu wiederholen.
- **Positiv:** Unbekannte Fehler ergeben eine allgemeine 500, Stacktraces bleiben auf dem Server, und
  `ZodPipe` gibt nur Pfad und Meldung zurück.
- **Vorschlag:**
  - Für 23505 und 23503 eine eigene Meldung ohne `detail`.
  - 4xx-Status aus Body-Parser-Fehlern übernehmen, also 413 „Anfrage ist zu groß“ und 400
    „Ungültiges JSON“, ohne Stacktrace.

### I8 Tests prüfen weniger, als ihr Name verspricht

- **`apps/api/test/audit-package.e2e.test.ts:308-312`:**
  - Der Test sucht den Text des fremden Mandanten im komprimierten ZIP. Deflate speichert Text nicht
    byteweise. Der Test-Engineer hat bei den Stufen 1, 6 und 9 gezeigt, dass der Klartext nie
    vorkommt.
  - Der Test kann nicht scheitern, der Kommentar in Zeile 309-310 ist falsch.
  - Der fremde Mandant hat außerdem keine Dateien, die Trennung in `15-dateien/` wird gar nicht
    geprüft.
- **`audit-package.e2e.test.ts:301-306`:** Der Test heißt „mit ihrem Hash“, prüft aber nur, dass die
  Spaltenüberschrift `SHA-256` existiert, nicht den Wert.
- **`audit-package.e2e.test.ts:274-279`:** „im Original“ wird nur über die Größe geprüft, nicht über
  den Inhalt.
- **`apps/api/test/auditlog.e2e.test.ts:110-120`:** Der Test heißt „niemals das Kennwort“. Er
  besteht, weil Anmeldungen gar keinen Inhalt speichern (`interceptor.ts:76`), nicht wegen `redact`.
  `redact` selbst hat keinen Test.
- **`apps/api/test/files.e2e.test.ts:103-113`:** Der Test heißt „weist Dateitypen ab, die Skripte
  tragen können“. Er prüft nur die Angabe des Browsers; dasselbe SVG als `text/plain` wird
  angenommen. `text/html` fehlt.
- **`apps/api/test/exports.e2e.test.ts:104-152`:** Die Druckansicht ist nur sicher wegen `nosniff`
  und CSP (`exports.controller.ts:89-94`). Keiner der beiden Header wird geprüft.
- **Keine Unit-Tests** für `csv.ts`, `document.ts`, `problem.filter.ts`, `zod.pipe.ts`,
  `storage.service.ts`, `sanitizeFilename`, `safeName` und `redact`.

### I9 Umlaute in Dateinamen werden beim Upload zerstört

- **Fundstelle:** `apps/api/src/modules/files/files.controller.ts:51`. multer 2 liest Parameter im
  Multipart-Kopf standardmäßig als Latin-1.
- **Nachweis:** `Prüfbericht.pdf` wird als `PrÃ¼fbericht.pdf` gespeichert.
- **Wirkung:** Bei einer deutschen Anwendung betrifft das fast jeden Nachweis. Die falschen Namen
  stehen im Nachweisregister, im Dateiverzeichnis und im ZIP für den Auditor.
- **Vorschlag:** `FileInterceptor('file', { defParamCharset: 'utf8', … })` und ein Test mit Umlaut.

## Suggestion

### Dateien und Speicher

- **Einzelne Downloads werden nicht protokolliert.** Nur `GET` unter `/exports/` gilt als Export
  (`audit-log.interceptor.ts:108`). Nachweise können personenbezogene Daten enthalten, etwa
  Zertifikate oder Teilnahmebestätigungen. Das Herunterladen Datei für Datei bleibt ohne Spur, das
  ZIP dagegen nicht. `GET /files/:id` als Export oder eigenen Typ protokollieren.
- **Die Datenbank schützt verknüpfte Dateien nicht vor dem Löschen.** Alle sechs Fremdschlüssel auf
  `file.id` stehen auf `ON DELETE SET NULL`:
  - `packages/db/src/schema/measures.ts:121`
  - `core.ts:272`, `:411`, `:452`
  - `audit.ts:52`, `:131`

  Die Sperre steckt nur im Service (`files.service.ts:107-126`). Kommt eine Verknüpfung zwischen
  Zählung und Löschen hinzu, verliert der neue Nachweis still seine Datei. Besser `ON DELETE RESTRICT`
  und den Fehler als 409 melden.

- **Die Antwort auf den Upload enthält interne Spalten** (`files.service.ts:54`, `:67-68`), darunter
  `storageKey` und `tenantId`. Bei einer Doppelung bekommt die zweite Person still Namen und Typ der
  ersten Datei. Einen eindeutigen Index auf Mandant und Hash gibt es nicht, zwei gleichzeitige
  Uploads ergeben zwei Zeilen.
- **Kein Speicherkontingent je Mandant, Uploads liegen im Arbeitsspeicher, nicht verknüpfte Dateien
  bleiben liegen.**
  - multer nutzt den Speicher des Prozesses, bis 25 MB je Anfrage.
  - Jede Rolle mit Upload-Recht kann beliebig viele Dateien ohne Bezug hochladen.
  - Diese Dateien gehen in jedes Auditpaket ein.
  - Vorschlag: ein Kontingent, Upload auf die Platte statt in den Speicher, und ein Job, der alte,
    nicht verknüpfte Dateien entfernt.
- **`StorageService.pathOf` prüft das Wurzelverzeichnis, nicht das Mandantenpräfix**
  (`storage.service.ts:72-78`). Die Schlüssel stammen heute nur vom Server. Vor dem geplanten
  Blob-Treiber wäre die zusätzliche Prüfung `storageKey.startsWith(tenantId + '/')` billig.
- **Die Freigabeliste erlaubt `application/zip` und `text/csv`** (`packages/shared/src/enums.ts:351-365`).
  Beide gehen unverändert ins Auditpaket. Hochgeladene CSV-Dateien werden nicht entschärft, ZIPs sind
  undurchsichtig. ZIP streichen oder im Dateiverzeichnis kennzeichnen. Varianten wie
  `text/plain; charset=…` und andere Schreibweisen werden richtig abgelehnt.

### Exporte

- **Die Druckansicht hat keine Sandbox in der CSP** (`exports.controller.ts:94`). Heute ist alles
  escaped, der Endpunkt verlangt ein Token, und der Web-Client druckt in einem iframe ohne Skripte.
  `sandbox` würde zu `/files/:id` passen.
- **Die Register des Pakets werden in getrennten Transaktionen gelesen** (`package.service.ts:93-97`).
  Ändern sich Daten während des Aufbaus, passen die Register nicht zueinander. Eine Transaktion mit
  `REPEATABLE READ` für das ganze Paket würde das verhindern.
- **zlib-Stufe 9 für schon komprimierte Dateien** (`package.service.ts:86`) kostet vor allem
  Rechenzeit.

### Tests

- **Die Tests in `files.e2e.test.ts` hängen aneinander.** `fileId` wird in Zeile 87 gesetzt,
  `evidenceId` in Zeile 182, und beide werden in späteren Blöcken verwendet. Ein einzeln gestarteter
  Test scheitert mit leerer UUID. Dasselbe Muster gibt es in `auditlog.e2e.test.ts`.
- **`files.e2e.test.ts:120`** prüft `default-src 'none'`, aber nicht `sandbox`. Gerade `sandbox`
  entschärft eine Datei vom Typ HTML.
- **`audit-package.e2e.test.ts:314`** heißt „bleibt der Funktionstrennung treu“, prüft aber ein
  Recht.

## `sql.raw` in `apps/api/src`

| Fundstelle                                                                         | Herkunft des Werts                                                                                    | Urteil                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/api/src/modules/files/files.service.ts:131-136` (`referenceCountSql(alias)`) | `'f'` als Standard (Aufruf in `:92`) oder fest `'f2'` (`:111`); private Methode                       | sicher, nie Nutzereingabe. Der Typ ließe sich auf `'f' \| 'f2'` einschränken. |
| `apps/api/src/modules/exports/package.service.ts:309` (`label(column, map)`)       | `column` ist ein fester Text in der Tabelle `REGISTERS`; die Werte gehen als Parameter in die Abfrage | sicher                                                                        |

Sonst gibt es in `apps/api/src` kein `sql.raw`. Der Parameter `framework` der Exporte geht als
gebundener Parameter in die Abfrage (`exports.service.ts:47`, `:81`).

## Testlauf

| Datei                       | Tests | Ergebnis  |
| --------------------------- | ----- | --------- |
| `files.e2e.test.ts`         | 14    | bestanden |
| `exports.e2e.test.ts`       | 9     | bestanden |
| `audit-package.e2e.test.ts` | 9     | bestanden |
| `auditlog.e2e.test.ts`      | 9     | bestanden |

Keiner der Befunde C1 bis I9 wird von einem vorhandenen Test erkannt.

## Fehlende Tests nach Priorität

| Prio       | Schützt vor        | Datei                                                            | Art          | Kern des Tests                                                                                                                                                                                              |
| ---------- | ------------------ | ---------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | C1                 | `apps/api/test/files.e2e.test.ts`                                | E2E          | Datei nach dem Upload unlesbar machen, `GET /files/:id` endet mit Fehler oder Abbruch, danach antwortet `GET /health` weiter mit 200. Unit-Test: Stream mit Fehler führt zu keinem `uncaughtException`.     |
| Critical   | C1                 | `audit-package.e2e.test.ts`                                      | E2E          | Stream einer Datei schlägt beim Paket fehl: gültiges ZIP mit Vermerk oder sauberer Abbruch, kein Hängen, kein Absturz. Dateien werden erst beim Verarbeiten geöffnet.                                       |
| Critical   | I8                 | `audit-package.e2e.test.ts:308-312` umschreiben                  | E2E          | Alle Einträge entpacken (Helfer `zipRead`), Gegenprobe mit eigenem Text, fremder Mandant mit Datei und Nachweis.                                                                                            |
| Important  | I1                 | `auditlog.e2e.test.ts`                                           | E2E          | `GET /api/v1/EXPORTS/risks.csv` erzeugt einen Export-Eintrag. `POST /api/v1/auth/LOGIN` wird als Anmeldung der Person protokolliert.                                                                        |
| Important  | I2                 | `auditlog.e2e.test.ts`                                           | E2E          | Nach `POST /risks` ist `audit_log.ip` gesetzt. Mit eingestelltem `trust proxy` gilt die Adresse aus `X-Forwarded-For`, ohne nicht.                                                                          |
| Important  | I3                 | `files.e2e.test.ts`                                              | E2E          | `MZ…` oder `<html>` als `application/pdf` mit Namen `scan.pdf.exe` wird abgelehnt oder normalisiert. Steuerzeichen für Rechts-nach-links werden entfernt. Unit-Tests für `sanitizeFilename` und `safeName`. |
| Important  | I4                 | neu: `packages/shared/src/dto.test.ts`, dazu `files.e2e.test.ts` | Unit und E2E | `javascript:`, `JAVASCRIPT:`, `data:`, `vbscript:` und `file:` werden abgelehnt, `https://` angenommen.                                                                                                     |
| Important  | I5                 | neu: `apps/api/src/modules/exports/csv.test.ts`                  | Unit         | `Backup,=1+1` wird gequotet. Jedes Formelzeichen wird entschärft. `-5` bleibt `-5`. Anführungszeichen werden verdoppelt. BOM am Anfang, CRLF am Ende.                                                       |
| Important  | I6                 | `auditlog.e2e.test.ts`, Unit-Test für `redact`                   | E2E und Unit | Verschachtelte Geheimnisse werden geschwärzt. Unbekannte Felder werden nicht gespeichert. Ein Textfeld von 1 MB beim Upload führt zu 400 oder 413, oder der Eintrag bleibt unter der Grenze.                |
| Important  | I7                 | neu: `apps/api/src/kernel/http/problem.filter.test.ts`           | Unit         | 23505 und 23503 geben keine Schlüsselwerte preis. 413 bleibt 413. Ein unbekannter Fehler ergibt 500 ohne Stacktrace. Prüfung der Form von `ZodPipe`-Fehlern.                                                |
| Important  | I8                 | `exports.e2e.test.ts`                                            | E2E          | Druckansichten haben `nosniff` und genau die erwartete CSP, jede CSV ist ein Anhang. Unit-Test für `escapeHtml` mit Mandantennamen in `<title>` und `<h1>`.                                                 |
| Important  | I9                 | `files.e2e.test.ts`                                              | E2E          | `Prüfbericht.pdf` bleibt `Prüfbericht.pdf`, der Download nennt `Pr%C3%BCfbericht.pdf`.                                                                                                                      |
| Suggestion | Downloads          | `auditlog.e2e.test.ts`                                           | E2E          | `GET /files/:id` erzeugt einen Eintrag mit Datei-ID und Person.                                                                                                                                             |
| Suggestion | Löschen            | `files.e2e.test.ts`                                              | E2E          | `DELETE FROM file` bei bestehender Verknüpfung wird von der Datenbank abgelehnt.                                                                                                                            |
| Suggestion | Mandantentrennung  | `files.e2e.test.ts`                                              | E2E          | Fremdes Löschen ergibt 404, die Datei bleibt. Die Liste zeigt keine fremden Dateien. Verknüpfen einer fremden Datei ergibt 400.                                                                             |
| Suggestion | Pfade              | neu: `apps/api/src/kernel/storage/storage.service.test.ts`       | Unit         | `../../etc/passwd` und absolute Pfade werden abgelehnt. `put` schreibt unter `<root>/<tenantId>/`.                                                                                                          |
| Suggestion | Änderungsprotokoll | `auditlog.e2e.test.ts`                                           | E2E          | `TRUNCATE audit_log` als `isms_app` wird abgelehnt.                                                                                                                                                         |

## Was gut gelöst ist

- **Downloads:** immer als Anhang mit `filename*` nach RFC 5987, `nosniff` und
  `default-src 'none'; sandbox`. Der Typ stammt aus der Freigabeliste. Header lassen sich über den
  Dateinamen nicht einschleusen. Der Web-Client lädt über einen Blob herunter, nichts wird im eigenen
  Ursprung angezeigt.
- **Dateisystem:** Die Schlüssel erzeugt der Server, mit Mandant vorne. Jeder Pfad wird gegen das
  Wurzelverzeichnis aufgelöst, geschrieben wird exklusiv (`wx`). Namen im ZIP haben einen festen
  Hash-Vorspann, und `/` sowie `\` werden ersetzt.
- **Druckdokumente:** Jeder Wert aus dem Mandanten läuft durch `escapeHtml` (`& < > " '`). Die
  Antwort trägt `nosniff` und eine CSP ohne Skripte. Der Web-Client druckt im iframe ohne
  `allow-scripts`.
- **Auditpaket:** Jedes Register filtert ausdrücklich nach Mandant und läuft zusätzlich unter
  Zeilensicherheit. Das Paket enthält keine Token, Passwort-Hashes oder Inhalte des
  Änderungsprotokolls. Jede Datei steht mit SHA-256 und Bezug im Dateiverzeichnis.
- **Änderungsprotokoll und Uploads:** Anmeldung, Registrierung und Einladung speichern keinen
  Inhalt. Felder namens Kennwort, Geheimnis und Token werden geschwärzt. Scheitert das Einfügen in
  der Datenbank oder ist die Datei doppelt, räumt der Upload die abgelegte Datei wieder weg
  (`files.service.ts:53`, `:70-73`).
