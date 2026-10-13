# Review 01: Anmeldung, Rechte und Mandantentrennung

Stand: 10.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

**Geprüft** wurden diese Ordner:

- `apps/api/src/kernel/auth`
- `apps/api/src/kernel/db`
- `apps/api/src/kernel/tenancy`
- `apps/api/src/config`
- `apps/web/src/lib`

Dazu kamen die Tests in `apps/api/test`, `packages/db/src/db.test.ts` und
`packages/shared/src/policy.test.ts`. Für die Frage nach Abfragen außerhalb von `dbs.tenant(...)`
wurde ganz `apps/api/src` durchsucht.

**Vorgehen:** Drei Rollen haben nacheinander geprüft:

1. Code-Reviewer: Korrektheit, Lesbarkeit, Architektur
2. Security-Auditor: Angriffswege
3. Test-Engineer: Testabdeckung und Testqualität; er hat dazu alle Testsuiten ausgeführt

Jede Rolle kannte die Befunde der vorherigen und hat sie bestätigt, eingeordnet oder ergänzt.
Alle Zeilenangaben unten sind am Code nachgeprüft. Wo ein Bericht eine andere Zeile nannte, steht
hier die richtige.

**Einstufung:**

| Stufe      | Bedeutung                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | Ausnutzbar, Folge ist Zugriff auf fremde Mandanten oder die Übernahme eines Kontos. Vor einem produktiven Einsatz beheben.         |
| Important  | Echter Fehler oder fehlende Absicherung mit begrenzter Wirkung, oder ein Test, der eine wichtige Zusage nicht prüft. Bald beheben. |
| Suggestion | Härtung, Aufräumen oder Testverbesserung ohne akute Wirkung.                                                                       |

## Zusammenfassung

- **Mandantentrennung:** In den Fachmodulen gibt es keinen Abfluss von Daten zwischen Mandanten. Jede
  Abfrage auf eine Mandantentabelle läuft in `dbs.tenant(...)` oder filtert ausdrücklich nach Mandant.
  60 von 61 Tabellen mit `tenant_id` haben Zeilensicherheit. Die Ausnahme `tenant_membership` ist so
  gewollt.
- **Die zwei kritischen Befunde** liegen davor, in der Anmeldung:
  - ein veröffentlichter Signaturschlüssel im Container-Setup zusammen mit einem Guard, der den
    Mandanten im Token nicht gegen die Mitgliedschaft prüft;
  - die Übernahme eines eingeladenen, noch nicht angemeldeten Kontos durch einen fremden Mandanten.
- **Die meisten wichtigen Befunde** betreffen den Lebenslauf einer Sitzung: Abmelden lässt sich
  rückgängig machen, deaktivierte Nutzer bleiben angemeldet, Rechteentzug wirkt verzögert. Dazu kommt
  eine zu großzügige Rechteprüfung für `_own`-Rechte.
- **Tests:** Alle Testsuiten laufen grün:

  | Suite  | Tests |
  | ------ | ----- |
  | API    | 292   |
  | DB     | 10    |
  | Shared | 3     |
  | Web    | 4     |

  Keiner der Befunde unten würde von einem vorhandenen Test erkannt. Vier Tests prüfen weniger, als ihr
  Name verspricht (I10).

## Critical

### C1 Mit dem Standardschlüssel aus `docker-compose.yml` lassen sich Zugriffstoken für fremde Mandanten fälschen

- **Fundstellen:**
  - `docker-compose.yml:30` setzt `NODE_ENV: production`.
  - `docker-compose.yml:32` setzt `JWT_SECRET` auf einen festen, im Repository veröffentlichten
    Ersatzwert, wenn `ISMS_JWT_SECRET` fehlt. Zeile 33 tut dasselbe für `APP_MASTER_KEY`.
  - `apps/api/src/config/env.ts:29` prüft nur die Länge (mindestens 32 Zeichen).
  - `apps/api/src/kernel/auth/jwt.guard.ts:35-44` lädt die Rechte allein über `claims.mid`, übernimmt
    aber `claims.tid` ungeprüft als Mandanten.
  - `apps/api/src/kernel/auth/auth.module.ts:14` legt weder Algorithmus noch Aussteller oder
    Empfänger fest.
- **Ablauf eines Angriffs:**
  1. Wer den Container ohne eigenen Schlüssel startet, betreibt die Anwendung im Produktionsmodus
     mit einem öffentlich bekannten Schlüssel.
  2. Ein Angreifer legt sich über das öffentliche `register` einen eigenen Mandanten an und ist dort
     ISMS-Manager.
  3. Er signiert ein Token mit seiner eigenen `mid` und der Mandanten-ID des Opfers als `tid`.
  4. Der Guard lädt seine Manager-Rechte, und jede Abfrage läuft unter dem Mandanten des Opfers.
     Die Zeilensicherheit hilft nicht, weil die API den Mandanten selbst setzt.
- **Ergebnis:** Lese- und Schreibzugriff auf einen fremden Mandanten. Voraussetzung ist, dass dessen
  UUID bekannt wird.
- **Vorschlag:**
  - In `loadEnv` den Start verweigern, wenn `NODE_ENV=production` gilt und einer der im Repository
    stehenden Schlüssel gesetzt ist.
  - In Compose `${ISMS_JWT_SECRET:?…}` statt eines Ersatzwerts verwenden.
  - Der Guard soll die Mitgliedschaft samt Mandant und Status laden und das Token ablehnen, wenn der
    Mandant der Mitgliedschaft nicht `tid` ist.
  - `algorithms: ['HS256']`, Aussteller und Empfänger festlegen.

### C2 Ein fremder Mandant kann das Konto einer eingeladenen Person übernehmen

- **Fundstellen:**
  - `apps/api/src/kernel/tenancy/members.service.ts:75-90`: Die Einladung verwendet ein vorhandenes,
    mandantenübergreifendes `user`-Konto per E-Mail wieder.
  - `members.service.ts:128`: Der Einladungstoken geht an die einladende Person zurück.
  - `apps/api/src/kernel/auth/auth.service.ts:167-177`: `acceptInvite` setzt das Passwort, solange am
    Konto noch der Platzhalter steht, egal aus welcher Einladung der Token stammt.
- **Ablauf eines Angriffs:**
  1. Mandant A lädt `opfer@firma.example` ein. Die Person hat noch nicht angenommen.
  2. Der Angreifer legt Mandant B über `register` an, lädt dieselbe Adresse ein und erhält den Token.
  3. Er löst den Token mit einem Passwort seiner Wahl ein.
- **Ergebnis:** Das Passwort des Angreifers gilt jetzt für das Konto der Person auf der ganzen
  Plattform. Die echte Person kann die Einladung von A nicht mehr annehmen, denn dafür wird nun das
  „bestehende Passwort“ verlangt. Ein Zurücksetzen des Passworts gibt es nicht. Über `register`
  lassen sich noch freie Adressen auf dieselbe Weise belegen.
- **Vorschlag:**
  - Das Setzen des Passworts an die Einladung binden, die das Konto angelegt hat.
  - Besser: den Einladungstoken per Mail verschicken statt ihn zurückzugeben, und bei `register` die
    E-Mail-Adresse bestätigen lassen.
  - Bis dahin keine Einladung an eine Adresse zulassen, deren Konto in einem anderen Mandanten noch
    auf Annahme wartet.

## Important

### I1 Abmelden und das Sperren einer Token-Familie lassen sich innerhalb von 20 Sekunden umgehen

- **Fundstellen:**
  - `apps/api/src/kernel/auth/auth.service.ts:214-218`: Gnadenfrist bei der Erneuerung.
  - `auth.service.ts:219-222`: Sperre bei erkannter Wiederverwendung.
  - `auth.service.ts:245-249`: Abmelden.
- **Was falsch ist:**
  - Die Gnadenfrist prüft nur, ob der Token in den letzten 20 Sekunden ersetzt wurde. Sie prüft
    nicht, ob die Familie seitdem gesperrt wurde.
  - Abmelden und die Sperre bei Wiederverwendung ändern nur Zeilen mit `revoked_at IS NULL`. Der
    schon ersetzte Token behält deshalb seinen Ersatzzeitpunkt.
  - Jeder Aufruf in der Frist stellt einen neuen, 30 Tage gültigen Token in derselben Familie aus,
    beliebig oft.
- **Ablauf:**
  1. Ein Tab erneuert R1 zu R2.
  2. Die Person meldet sich 5 Sekunden später ab.
  3. Wer R1 hat, erhält nach weiteren 5 Sekunden einen gültigen R3.
- **Bestätigung:** Der Test-Engineer hat in drei Läufen nachgewiesen, dass der Test „zwei Tabs“ jedes
  Mal zwei lebende Geschwister-Token in einer Familie hinterlässt.
- **Vorschlag:**
  - In der Gnadenfrist nur dann neu ausstellen, wenn die Familie noch einen lebenden Token hat.
  - Höchstens eine Neuausstellung je ersetztem Token zulassen.
  - Den Ersatz in einer eigenen Spalte führen statt in `revoked_at`.
  - Die Gültigkeit (`expiresAt`) auch hier prüfen.

### I2 Die Rechteprüfung akzeptiert `_own` für jedes Recht, und manche Services prüfen kein Eigentum

- **Fundstellen:**
  - `apps/api/src/kernel/auth/permission.guard.ts:36`: Der Guard akzeptiert `${p}_own` für jedes
    geforderte Recht. Die Prüfung in `policy.ts` erlaubt `_own` dagegen nur für Schreibrechte.
  - `apps/api/src/modules/incidents/playbooks.controller.ts:34-51`: Die Ablaufpläne verlangen
    `CONTINUITY_WRITE`, und `playbooks.service.ts` ruft nie `assertCan` auf.
  - `apps/api/src/modules/files/files.controller.ts:76-79`: `DELETE /files/:id` verlangt
    `MEASURE_WRITE`, und `files.service.ts:107` prüft kein Eigentum.
- **Ablauf:**
  - Eine Person mit der Rolle Risk-Owner (`continuity.write_own`, `measure.write_own`) kann
    Ablaufpläne anlegen, automatisch erzeugen und aktiv oder archiviert setzen.
  - Sie kann außerdem jede noch nicht verknüpfte Datei des Mandanten löschen, auch den frischen
    Upload einer anderen Person.
- **Vorschlag:**
  - Die `_own`-Ausnahme im Guard nur auf ausdrücklichen Wunsch zulassen, etwa mit
    `@RequirePermission(P.X_WRITE, { allowOwn: true })`.
  - Oder in diesen Services `assertCan(ctx, P.X_WRITE)` ohne Ressource aufrufen.
  - Alle Endpunkte mit `…_WRITE` darauf durchsehen.

### I3 Deaktivierte Nutzer bleiben angemeldet oder melden sich über andere Wege wieder an

- **Fundstellen:**
  - `user.is_active` wird nur bei der Anmeldung geprüft (`auth.service.ts:127-136`).
  - Nicht geprüft wird es bei der Ausstellung einer Sitzung (`auth.service.ts:254-279`), bei der
    Erneuerung (`:197-237`), bei `register` für ein vorhandenes Konto (`:78`), bei `accept-invite`
    (`:146-186`) und im Guard (`jwt.guard.ts:35-44`).
- **Ablauf:** Ein Betreiber deaktiviert ein kompromittiertes Konto. Wer das Erneuerungs-Cookie hat,
  bleibt bis zu 30 Tage angemeldet, immer wieder erneuert. Mit dem richtigen Passwort entsteht über
  `register` sogar eine neue Sitzung.
- **Einordnung:** Heute setzt noch kein Endpunkt `is_active=false`. Der Weg ist aber genau der, den
  man bei einem Sicherheitsvorfall braucht.
- **Vorschlag:**
  - `isActive` in `issueSession` lesen und bei `false` mit 401 abweisen. Das deckt Erneuerung,
    Mandantenwechsel, Einladung und `register` zugleich ab.
  - Beim Deaktivieren alle Erneuerungstoken des Kontos sperren.

### I4 Ein Mitglied kann seine eigenen Rollen ändern und den letzten ISMS-Manager entfernen

- **Fundstellen:**
  - `apps/api/src/kernel/tenancy/members.service.ts:132-153` (`setRoles`) prüft nicht, ob die
    handelnde Person ihre eigene Mitgliedschaft ändert.
  - `members.controller.ts:27-32` reicht die handelnde Person gar nicht weiter.
  - Nur das Entfernen der eigenen Mitgliedschaft ist gesperrt (`members.service.ts:155-157`).
- **Ablauf:**
  - Der einzige ISMS-Manager setzt sich selbst auf „Auditor“. Danach kann niemand im Mandanten mehr
    Mitglieder verwalten, und der Plattform-Admin hat dort bewusst keine Rechte.
  - Dieselbe Person kann auch vom Manager zum Auditor wechseln und ihre eigene Arbeit prüfen, ohne
    dass eine zweite Person beteiligt ist.
- **Vorschlag:** `setRoles` auf die eigene Mitgliedschaft ablehnen. Keine Änderung zulassen, nach der
  der Mandant ohne aktiven ISMS-Manager dasteht.

### I5 `register` und `accept-invite` verraten, ob ein Konto existiert, und Versuche sind unbegrenzt

- **Fundstellen:**
  - `apps/api/src/kernel/auth/auth.service.ts:78-82`: 409 „E-Mail bereits registriert“ bei bekannter
    Adresse, sonst 201 und ein neuer Mandant.
  - `auth.service.ts:168-171`: Bei einem vorhandenen Konto prüft die Einladung das Passwort, mit einem
    Token, den sich ein Angreifer über seinen eigenen Mandanten besorgen kann.
- **Was falsch ist:** Die Anmeldung gleicht Antworten und Laufzeit sorgfältig an
  (`auth.service.ts:129-136`). Diese beiden Wege tun das nicht. Sie sind damit unbegrenzte
  Prüfstellen für Adressen und Passwörter, unabhängig von `login`. Eine Begrenzung der Versuche ist
  erst für Phase 2 geplant.
- **Vorschlag:**
  - Für eine vorhandene Adresse dieselbe Antwort geben wie bei einem belegten Kürzel.
  - Oder einen weiteren Mandanten nur nach Anmeldung anlegen lassen.
  - Die geplante Begrenzung muss alle drei Wege abdecken, je Adresse und je IP.

### I6 Entzogene Rechte wirken auf anderen Instanzen erst nach bis zu fünf Minuten

- **Fundstellen:**
  - `apps/api/src/kernel/auth/permission-cache.service.ts:34` vergleicht die `pv` im Token mit der im
    Cache, nie mit der Datenbank. `currentVersion()` (`:41`) wird nirgends aufgerufen.
  - `apps/api/src/kernel/tenancy/members.service.ts:149-150` und `:164-165`: Die Invalidierung läuft
    nur lokal und vor dem Commit.
- **Ablauf:**
  - Mit zwei Instanzen behält ein herabgestufter ISMS-Manager auf der zweiten Instanz seine Rechte bis
    zum Ablauf des Caches (fünf Minuten).
  - Auch auf einer Instanz gilt: Eine Anfrage zwischen Invalidierung und Commit lädt die alten Rollen
    wieder in den Cache.
- **Einordnung:** Gering, solange nur eine Instanz läuft. Mittel, sobald skaliert wird.
- **Vorschlag:** Gegen die `pv` in der Datenbank vergleichen. Ein Lesezugriff je Anfrage reicht, oder
  ein Zwischenspeicher von wenigen Sekunden. Erst nach dem Commit invalidieren.

### I7 Mandant und Nachfolger eines Tokens liegen nur im Speicher des Prozesses

- **Fundstellen:**
  - `apps/api/src/kernel/auth/auth.service.ts:377-378` (`tokenTenant`, `lastIssued`)
  - `auth.service.ts:323` und `:371`
  - `apps/web/src/lib/api.ts:82`
- **Was falsch ist:**
  - Jeder ausgestellte Erneuerungstoken legt Einträge an, die nie gelöscht werden. Der Speicher wächst
    mit der Laufzeit.
  - Nach einem Neustart oder auf einer zweiten Instanz ist der Mandant unbekannt. Wer mehreren
    Mandanten angehört, bekommt dann ein Token ohne `tid`.
  - Jede Mandantenseite antwortet danach mit 403 „Kein Mandant gewählt“, während die Oberfläche
    weiter den alten Mandanten zeigt. Der Web-Client verwirft die Sitzung, die er beim stillen
    Erneuern erhält.
- **Vorschlag:**
  - Den Mandanten als Spalte an `refresh_token` speichern und beide Maps streichen.
  - `issueSession` gibt die neue ID zurück, damit `replacedById` direkt gesetzt werden kann.
  - Der Web-Client reicht eine geänderte Sitzung an den Anmeldekontext weiter.

### I8 Eine Einladung kann eine Person einem anderen Konto zuordnen und so das Vier-Augen-Prinzip umgehen

- **Fundstelle:** `apps/api/src/kernel/tenancy/members.service.ts:119-123` setzt `person.user_id` auf
  das eingeladene Konto. Es prüft nicht, ob die Person schon einem anderen Konto gehört. Eine
  unbekannte `personId` wird stillschweigend übergangen.
- **Ablauf:**
  1. Ein ISMS-Manager besitzt über Person P das Risiko R.
  2. Er lädt eine Wegwerfadresse mit `personId = P` ein. P gehört jetzt dem Wegwerfkonto.
  3. Er übernimmt R selbst. Der Trigger `assert_distinct_actor`
     (`packages/db/migrations/0001_rls_triggers_views.sql:108-118`) sieht einen anderen Besitzer und
     lässt es zu.
- **Nebenwirkung:** Auch ohne böse Absicht verliert die bisher verknüpfte Person still ihre
  `_own`-Rechte und ihre Fristen.
- **Vorschlag:**
  - Mit 409 ablehnen, wenn die Person schon einem anderen Konto zugeordnet ist.
  - Eine unbekannte `personId` mit 404 beantworten.
  - Die Umhängung als eigenes Ereignis protokollieren.

### I9 Die Oberfläche hat keine Sicherheits-Header, und die API-Beschreibung ist öffentlich

- **Fundstellen:**
  - `infra/docker/nginx.conf:39-41` setzt für `/` nur `Cache-Control`. Es fehlen Content Security
    Policy, Schutz vor Einbettung in fremde Seiten, HSTS und `nosniff`.
  - `helmet()` (`apps/api/src/app.factory.ts:16`) wirkt nur auf Antworten der API.
  - Swagger ist immer unter `/api/docs` eingehängt (`app.factory.ts:22`) und über nginx erreichbar.
- **Ablauf:** Jede fremde Seite kann die Anwendung einbetten und Klicks auf Vier-Augen-Schritte
  unterschieben, etwa „Freigeben“ oder „Risiko bewusst tragen“. Ohne CSP gibt es keine zweite Hürde,
  falls doch einmal Skript eingeschleust wird.
- **Vorschlag:**
  - CSP mit `frame-ancestors 'none'`, `X-Frame-Options DENY`, `nosniff` und `Referrer-Policy` im
    `server`-Block von nginx setzen, hinter TLS auch HSTS.
  - Die Header in jedem `location` mit eigenem `add_header` wiederholen, denn nginx vererbt sie dort
    nicht.
  - Swagger nur außerhalb von Produktion einhängen.

### I10 Vier Tests prüfen weniger, als ihr Name verspricht, und ganze Bereiche sind ungetestet

Diese vier Tests geben falsche Sicherheit:

- **`apps/api/test/auth.e2e.test.ts:127-131`:** Der Test heißt „Rechteänderung invalidiert alte
  Tokens sofort“. Er prüft aber nur, dass der unveränderte Manager seine Rechte behält. Er würde auch
  ohne jede Invalidierung grün bleiben (vgl. I6).
- **`auth.e2e.test.ts:165-170`:** Der Test heißt „bereits eingelösten oder unbekannten
  Einladungstoken“. Er schickt aber nur einen unbekannten Token. Der eingelöste wird nie erneut
  gesendet.
- **`apps/api/test/audit-package.e2e.test.ts:311`:** Der Test sucht den Text eines fremden Mandanten
  im komprimierten ZIP. Deflate speichert Text nicht byteweise, ein Abfluss bliebe sehr
  wahrscheinlich unentdeckt. Besser die Einträge entpacken; der Helfer `zipRead` ist schon da.
- **`packages/db/src/db.test.ts:90-95`:** Der Test „ist idempotent“ zählt zweimal nach dem zweiten
  Seed. Die Zahlen sind immer gleich. Er muss vor und nach dem Seed zählen.

Ohne jeden Test sind:

- `POST /auth/logout` und `POST /auth/switch-tenant`
- Erneuerung mit abgelaufenem oder fehlendem Cookie
- die Antwort „Kein Mandant gewählt“
- gefälschte oder abgelaufene Token sowie `tid` passend zu `mid`
- das Herabstufen eines Mitglieds mit altem Token
- Mitgliederoperationen auf fremde IDs (`tenant_membership` hat bewusst keine Zeilensicherheit)
- die Prüfung der Umgebungsvariablen (`config/env.ts`)
- `apps/web/src/lib/api.ts` und `auth-context.tsx`; die Weboberfläche hat nur den Glossar-Test

Bei den Vier-Augen-Triggern ist nur `trg_risk_sod` direkt in der Datenbank getestet, und auch der nur
beim Einfügen.

Die genauen Testvorschläge je Befund stehen unten unter „Fehlende Tests“.

## Suggestion

### Anmeldung und Sitzung

- **`TenantCtx` wirft einen einfachen `Error`** (`apps/api/src/kernel/auth/decorators.ts:29`). Auf
  Endpunkten ohne `@RequirePermission`, etwa `/deadlines`, wird aus einem Token ohne Mandant ein
  500 statt eines 403. Besser `ForbiddenException('Kein Mandant gewählt')`.
- **Die Erneuerung ist nicht atomar** (`auth.service.ts:197-237`). Zwei gleichzeitige Anfragen mit
  demselben gültigen Token erneuern beide. Den Token mit
  `UPDATE … WHERE id = $1 AND revoked_at IS NULL RETURNING` beanspruchen; trifft das keine Zeile,
  greift die Gnadenfrist.
- **Keine absolute Höchstdauer einer Sitzung.** Jede Erneuerung setzt wieder 30 Tage. Den Beginn der
  Familie speichern und begrenzen.
- **Der Mandantenwechsel beginnt eine neue Familie, ohne die alte zu sperren**
  (`auth.service.ts:188-194`). Jeder Wechsel hinterlässt eine 30 Tage gültige Familie.
- **Die Annahme einer Einladung ist nicht bedingt** (`auth.service.ts:174-183`). Zwei gleichzeitige
  Annahmen setzen beide ein Passwort, die letzte gewinnt. Auf `status = 'invited'` bedingen.
- **`registerTenant` setzt den Mandantenkontext von Hand** (`auth.service.ts:62` und `:97`). Das ist
  korrekt, aber die einzige handgeschriebene Kopie von `withTenant`.
- **JWT ohne festgelegten Algorithmus, Aussteller und Empfänger** (`auth.module.ts:14`). Gehört zu C1,
  ist aber auch für sich eine Härtung.

### Rechte und Datenbank

- **Die Rechte werden ohne Status geladen** (`permission-cache.service.ts:53-60`). Die Abfrage prüft
  weder den Status der Mitgliedschaft noch, ob der Mandant aktiv ist. Heute folgenlos, weil noch
  nichts „gesperrt“ setzt. Jetzt schon filtern.
- **`role_permission` ist für die App-Rolle beschreibbar** und hat keine Zeilensicherheit. Kein Code
  schreibt dort. Das Schreibrecht zu entziehen kostet nichts und schützt die Systemrollen aller
  Mandanten.
- **Sichten ohne `security_invoker`** (`v_skill_gap` in `0001`, `v_audit_coverage` in
  `0005`/`0010`). Sie laufen mit den Rechten des Eigentümers. Alle vier Aufrufer filtern ausdrücklich
  nach Mandant, deshalb fließt heute nichts ab:
  - `competence.service.ts:193` und `:247`
  - `audits.service.ts:167`
  - `package.service.ts:783`

  Der Schutz in der Tiefe fehlt trotzdem. Seit PostgreSQL 15 lässt er sich mit `security_invoker`
  ergänzen.

- **Fremdschlüssel ohne Mandant**, und die Junction-Richtlinie prüft nur eine Seite
  (`0001_rls_triggers_views.sql:83-89`). Die geprüften Schreibwege kontrollieren beide Seiten in der
  Anwendung (`evidence.service.ts:119-120`, `competence.service.ts:121-122`). Weitere Schreibwege
  wurden nicht geprüft.

### Protokoll und Betrieb

- **Kein `trust proxy`** (`apps/api/src/app.factory.ts`). Im Container steht in jedem Protokolleintrag
  und jedem Token die Adresse von nginx statt der des Nutzers. Das schwächt die Nachweise für A.5.16
  und A.8.15.
- **Fehlgeschlagene Anmeldungen werden nicht protokolliert**
  (`apps/api/src/kernel/audit-log/audit-log.interceptor.ts:57-59` schreibt nur bei Erfolg). Ohne
  Begrenzung der Versuche hinterlässt ein Durchprobieren von Passwörtern keine Spur.
- **Die Einladung zeigt den echten Anzeigenamen eines fremden Kontos.**
  `members.service.ts:75-90` übernimmt das vorhandene Konto. Die Mitgliederliste
  (`members.service.ts:36`) zeigt dessen Namen statt des eingegebenen.

### Web-Client

- **`onAuthChange` hat keine Abonnenten** (`apps/web/src/lib/api.ts:44`). Scheitert die stille
  Erneuerung, bleibt die Sitzung in der Oberfläche stehen, und niemand wird zur Anmeldung geschickt.
- **`JSON.parse` wirft bei einer HTML-Fehlerseite** (`api.ts:86`), etwa einem 502 von nginx, einen
  `SyntaxError` statt eines `ApiError`.

### Tests

- **Der Test „zwei Tabs“ hängt vom Zufall ab** (`auth.e2e.test.ts:228-245`). Er prüft nicht, dass die
  Gnadenfrist wirklich lief. Besser denselben Cookie nacheinander zweimal senden.
- **Ein Test schreibt über alle Familien hinweg.** `auth.e2e.test.ts:259-261` datiert alle gesperrten
  Token zurück, statt nur die eigene Familie.
- **Die Tests in `auth.e2e.test.ts` hängen als Kette aneinander.** Ein Fehler zieht alle folgenden
  mit. Vom Cookie wird nur `HttpOnly` geprüft, nicht `SameSite=Strict` und der Pfad.
- **`risks.e2e.test.ts:209-212` heißt Funktionstrennung, prüft aber ein fehlendes Recht.** Den echten
  Vier-Augen-Fall deckt `:213-235` ab.

## Datenbankabfragen außerhalb von `dbs.tenant(...)`

Ganz `apps/api/src` wurde nach direktem Zugriff auf die Datenbank durchsucht. Jede Fundstelle ist
vertretbar. Keine liest oder schreibt Fachdaten eines Mandanten ohne Mandantenkontext.

| Fundstelle                                                                   | Tabellen                                                                                    | Urteil                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `kernel/auth/auth.service.ts:56-59`                                          | `tenant` (Kürzel prüfen)                                                                    | in Ordnung, Plattformtabelle                      |
| `auth.service.ts:62-119` (`registerTenant`)                                  | Mandant, Konto, Mitgliedschaft, Rollen; danach Mandantentabellen nach `set_config` in `:97` | in Ordnung, aber von Hand (siehe Suggestion)      |
| `auth.service.ts:126-137` (Anmeldung)                                        | `user`                                                                                      | in Ordnung                                        |
| `auth.service.ts:146-186` (Einladung annehmen)                               | Mitgliedschaft, Konto, Mandant                                                              | in Ordnung, keine Zeilensicherheit vorgesehen     |
| `auth.service.ts:197-252` (Erneuern, Abmelden)                               | `refresh_token`                                                                             | in Ordnung                                        |
| `auth.service.ts:254-372` (Sitzung, Mitgliedschaften)                        | Konto, Mandant, Mitgliedschaft, Rolle, `refresh_token`                                      | in Ordnung, Person wird über `dbs.tenant` gelesen |
| `kernel/auth/permission-cache.service.ts:41-61`                              | Rollen, Rechte, Mitgliedschaft, Mandant                                                     | in Ordnung, siehe Suggestion zum Status           |
| `modules/catalog/catalog.service.ts:149-167`                                 | globaler Katalog, Systemrollen                                                              | in Ordnung                                        |
| `modules/notifications/notifications.service.ts:59`, `:173` (`dbs.platform`) | `tenant`                                                                                    | in Ordnung                                        |
| `kernel/audit-log/audit-log.interceptor.ts:90` (`dbs.platform`)              | `audit_log` ohne Mandant (Anmeldung)                                                        | in Ordnung, Richtlinie mit `IS NOT DISTINCT FROM` |
| `demo-seed.ts:126` (`dbs.platform`)                                          | `tenant`                                                                                    | in Ordnung                                        |
| `health.controller.ts:15`                                                    | `SELECT 1`                                                                                  | in Ordnung                                        |
| `kernel/jobs/jobs.service.ts:23-29`                                          | pg-boss mit eigener Verbindung und eigenem Schema                                           | in Ordnung, so entschieden                        |

**Zeilensicherheit in der Datenbank:**

- 60 von 61 Tabellen mit `tenant_id` haben eine aktive Richtlinie. Die Ausnahme `tenant_membership`
  ist bewusst so gewählt (`0001_rls_triggers_views.sql:51`).
- Ohne Zeilensicherheit sind außerdem `tenant`, `user`, `refresh_token`, `membership_role`,
  `role_permission`, `permission` und der globale Katalog. Die Trennung von Mitgliedschaften und
  Rollen hängt damit allein an den `WHERE`-Bedingungen in `members.service.ts`. Diese sind
  vorhanden, aber ungetestet (I10).
- Alle Tabellen ab Migration 0010 haben ihre Richtlinie von Hand bekommen. Ein Test, der das für jede
  künftige Tabelle prüft, fehlt (siehe unten).

## Fehlende Tests nach Priorität

Für jeden Befund ein Test, der ihn heute rot machen würde:

| Prio       | Schützt vor      | Datei                                                               | Kern des Tests                                                                                                                                                                                |
| ---------- | ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | C1               | `apps/api/test/auth.e2e.test.ts`                                    | Token mit eigener `mid` und fremder `tid` signieren (`JWT_SECRET` aus `setup.ts`). `GET /risks` muss 401 oder 403 liefern. Dazu: falscher Schlüssel und abgelaufenes Token führen zu 401.     |
| Critical   | C2               | `auth.e2e.test.ts`                                                  | Mandant X und Y laden dieselbe Adresse ein, Y löst ein. Danach darf das Passwort von Y keinen Zugang zu X geben, und X's Token muss weiter mit dem eigenen Passwort funktionieren.            |
| Critical   | I1               | `auth.e2e.test.ts`                                                  | Erneuern, abmelden, alten Cookie innerhalb von 20 Sekunden senden: 401, kein lebender Token in der Familie. Fünfmal denselben ersetzten Cookie senden: höchstens ein weiterer lebender Token. |
| Critical   | I2               | `incidents.e2e.test.ts`, `files.e2e.test.ts`                        | Risk-Owner ruft `POST /playbooks`, `PUT /playbooks/:id/status`, `DELETE /files/:id` auf fremde Datensätze auf: jeweils 403.                                                                   |
| Critical   | I3               | `auth.e2e.test.ts`                                                  | Konto über die Migrator-Verbindung deaktivieren. Erneuern, `register` und `accept-invite` müssen 401 liefern.                                                                                 |
| Important  | I4               | `auth.e2e.test.ts`                                                  | Einziger ISMS-Manager ändert seine eigenen Rollen: 400 oder 409, Rollen bleiben.                                                                                                              |
| Important  | I5               | `auth.e2e.test.ts`                                                  | `register` mit bekannter und unbekannter Adresse liefert dieselbe Antwort, und es bleibt kein Mandant zurück.                                                                                 |
| Important  | I6               | `auth.e2e.test.ts` und Unit-Test `permission-cache.service.test.ts` | Rollen über die Datenbank ändern, ohne `invalidate`. Das alte Token darf `tenant.members` nicht mehr haben.                                                                                   |
| Important  | I8               | `auth.e2e.test.ts`                                                  | Einladung mit `personId` einer schon verknüpften Person: 409, Verknüpfung bleibt.                                                                                                             |
| Important  | Zeilensicherheit | `packages/db/src/db.test.ts`                                        | Jede Tabelle mit `tenant_id` hat Zeilensicherheit und eine Richtlinie, mit `tenant_membership` als ausdrücklicher Ausnahme. `isms_app` hat kein `BYPASSRLS` und besitzt keine Tabelle.        |
| Important  | Lücken           | `auth.e2e.test.ts`                                                  | Abmelden (Cookie gelöscht, alter Cookie 401). „Kein Mandant gewählt“ und Mandantenwechsel. Rollen und Löschen auf eine fremde Mitgliedschaft: 404.                                            |
| Important  | Trigger          | `packages/db/src/db.test.ts`                                        | Je ein direkter SQL-Test für `trg_measure_sod`, `trg_action_sod`, `trg_finding_sod`, `trg_finding_verify_sod` und die Vier-Augen-Prüfung bei Dokumenten, auch beim Ändern.                    |
| Important  | Konfiguration    | neu: `apps/api/src/config/env.test.ts`                              | `'false'` ergibt false. Ein 31 Zeichen langer Schlüssel wird abgelehnt. `loadEnv(overrides)` darf den Zwischenspeicher nicht überschreiben (`env.ts:80-81`).                                  |
| Important  | Web-Client       | neu: `apps/web/src/lib/api.test.ts`                                 | Zwei gleichzeitige 401 lösen genau eine Erneuerung aus. Eine gescheiterte Erneuerung löscht den Token. Eine HTML-Fehlerseite wird zu `ApiError`.                                              |
| Suggestion | Einladung        | `auth.e2e.test.ts`                                                  | Eingelösten Token erneut senden: 401. Abgelaufene Einladung: 401. Vorhandenes Konto mit falschem Passwort: 401, Passwort unverändert.                                                         |

## Was gut gelöst ist

- **Anmeldung:** argon2id. Bei unbekannter Adresse oder offener Einladung wird gegen einen
  Dummy-Hash geprüft. Antwort und Laufzeit verraten bei `login` nichts
  (`auth.service.ts:129-136`).
- **Token:** Erneuerungstoken (384 Bit) und Einladungstoken (256 Bit) stammen aus `randomBytes` und
  werden nur als SHA-256 gespeichert. Einladungen laufen nach sieben Tagen ab und gelten einmal.
- **Cookie und Client:** Das Erneuerungs-Cookie ist `httpOnly`, `SameSite=strict` und auf
  `/api/v1/auth` begrenzt. Der Zugriffstoken liegt nur im Speicher. CORS ist auf einen Ursprung
  festgelegt.
- **Mandantenkontext:** `withTenant` setzt den Mandanten nur für die Transaktion. Ohne Mandant liefert
  die Datenbank keine Zeilen, sie versagt also sicher.
- **Änderungsprotokoll:** Es entfernt Kennwörter und Token, speichert bei Anmeldungen keinen Inhalt
  und lässt sich nur ergänzen.
