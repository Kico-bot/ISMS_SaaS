# Review 07: Oberfläche und Container

Stand: 12.10.2026, Branch `main` (Commit `dd4dd4b`). Am Code wurde nichts geändert.

Geprüft wurden:

- `apps/web/src/pages` (26 Seiten, rund 14.000 Zeilen)
- `apps/web/src/components`
- `infra/docker` (Dockerfile, `nginx.conf`, `postgres-init.sql`, `docker-compose.yml` für die
  Entwicklung)
- `docker-compose.yml` im Wurzelverzeichnis

**Vorgehen:** Der Code-Reviewer hat die Dateien gelesen, mit einem Skript über den Syntaxbaum nach
Formularfeldern ohne Beschriftung und nach klickbaren Elementen ohne Schaltfläche gesucht und jeden
Treffer von Hand nachgesehen. Für die Barrierefreiheit diente `.claude/references/accessibility-checklist.md`
als Prüfliste. `pnpm --filter @isms/web typecheck` läuft fehlerfrei, die einzige Testdatei der
Oberfläche (Glossar, 4 Tests) ist grün. Die Docker-Images wurden nicht gebaut. Die wichtigsten
Zeilenangaben habe ich selbst nachgeprüft.

Befunde aus den Reviews 01 bis 06 werden nur erwähnt, nicht wiederholt: voreingestelltes
JWT-Geheimnis (01 C1), Zugangsdaten des Migrators im API-Behälter (02 I5), fehlende IP im Protokoll
(03 I2), Maskierung in Exporten (03), Demodaten in Compose (06 I6).

**Einstufung:**

| Stufe      | Bedeutung                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Critical   | Fremder Code läuft in der Anwendung, oder Daten liegen ohne Anmeldung offen. Vor einem Einsatz beheben.  |
| Important  | Echter Fehler mit begrenzter Wirkung, oder eine Funktion ist für einen Teil der Nutzer nicht erreichbar. |
| Suggestion | Härtung, Aufräumen oder Vereinheitlichung ohne akute Wirkung.                                            |

Es gibt keinen Critical-Befund.

## Antworten auf die Schwerpunkte

1. **Werden Nutzereingaben als HTML dargestellt?**
   - Nein. `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write` und
     `window.open` kommen nicht vor. React maskiert alle übrigen Ausgaben.
   - Eine Lücke gibt es bei Adressen: Ein Nachweis-Verweis nimmt auch `javascript:` an und wird als
     Link gerendert (I1).
2. **Ist die Druckansicht im iframe sicher?**
   - Ja. Der Rahmen hat `sandbox="allow-same-origin allow-modals"` ohne `allow-scripts`, das HTML
     kommt maskiert von der API, `print()` ruft die Elternseite auf.
   - Durch `srcdoc` geht die CSP der API-Antwort verloren, die Sicherheit hängt allein an der
     Sandbox. Der Rahmen bleibt fest 120 Sekunden stehen (S1).
3. **Werden fehlgeschlagene Anfragen sichtbar?**
   - Meist ja: Die meisten Änderungen laufen in ein `ErrorNote` mit `role="alert"`, das Titel und
     Detail der Problemantwort zeigt.
   - Aber: Detailansichten drehen bei einem Fehler endlos (I4), einige Änderungen und alle
     Dateidownloads scheitern still (I5), und eine Fehlerseite des Proxys erscheint als englischer
     `SyntaxError` (I6).
4. **Sind die Formulare barrierefrei?**
   - Teilweise. Sprache, Fokusrahmen, Navigation und Anmeldung sind in Ordnung.
   - Ohne Maus lässt sich in 13 Registern kein Datensatz öffnen (I2), Entfernen-Schaltflächen
     erscheinen nur beim Überfahren (I3), die Seitenfenster sind keine echten Dialoge (I7), und rund
     35 Felder haben keinen zugänglichen Namen (I8).
5. **Gibt es doppelten Code zwischen den Seiten?**
   - Ja, deutlich. Das Seitenfenster ist 13-mal von Hand gebaut, die Datumsformatierung 12-mal, und
     die Statustexte weichen inzwischen von `packages/shared/src/labels.ts` ab (I11, Tabelle D).
6. **Docker: Geheimnisse, root, offene Ports?**
   - Geheimnisse: Keine in den Images. `.dockerignore` schließt `.env` aus, es gibt keine
     Build-Argumente mit Geheimnissen. In den Compose-Dateien stehen aber feste Kennwörter und
     Standardwerte (S9, bekannt aus 01 C1).
   - root: API, Worker und Migration laufen als `node`. nginx läuft im Hauptprozess als root (S9).
   - Ports: Alle veröffentlichten Ports binden an jede Netzwerkschnittstelle. In der
     Entwicklungsumgebung ist das die Datenbank mit Superuser `postgres/postgres` (I10).

## Important

### I1 Ein Nachweis-Verweis nimmt `javascript:`-Adressen an und rendert sie als Link

- **Wo:**
  - `packages/shared/src/dto.ts:798`: `url: z.string().url()` prüft das Schema nicht.
  - `apps/web/src/components/EvidenceSection.tsx:143-149`: `<a href={e.url} target="_blank" rel="noreferrer noopener">`.
- **Nachweis:** Mit dem installierten Zod 3.25.76 ist
  `z.string().url().safeParse('javascript:alert(document.domain)').success` gleich `true`. Ebenso
  passieren `data:` und `file:`. React 18.3 warnt bei `javascript:` nur, es blockiert nicht.
- **Folge:** Wer einen Nachweis anlegen darf (`measure.write` oder `finding.write`, also auch der
  Auditor), hinterlegt Skriptcode als Verweis. Klickt die ISMS-Leitung darauf, verhindert heute
  wahrscheinlich nur `target="_blank"` mit `noopener` die Ausführung im eigenen Ursprung. Das ist
  eine Nebenwirkung eines Attributs, keine Prüfung. Fällt `target` bei einer Überarbeitung weg,
  ist es gespeichertes XSS, das über das Refresh-Cookie ein Zugriffstoken holen kann. Ob der Link in
  einem echten Browser ausgeführt wird, wurde nicht getestet.
- **Behebung:** Im DTO nur `http:` und `https:` zulassen, beim Rendern dasselbe prüfen. Eine CSP für
  die Oberfläche (I9) blockiert `javascript:`-Adressen zusätzlich.

### I2 Ohne Maus lässt sich in 13 Registern kein Datensatz öffnen

- **Wo:** Tabellenzeilen mit `onClick`, ohne `tabIndex`, ohne Tastaturbehandlung und ohne
  Schaltfläche oder Link darin:
  - `AiSystems.tsx:180`, `Audits.tsx:219`, `Cockpit.tsx:249` (Aufklappen, ohne `aria-expanded`)
  - `Competence.tsx:316` und `:975`, `Continuity.tsx:371` und `:1003`
  - `Documents.tsx:322`, `Findings.tsx:271`, `Incidents.tsx:293`
  - `Measures.tsx:153`, `Privacy.tsx:306`, `Risks.tsx:247`
- **Folge:** Das Seitenfenster ist der einzige Ort, an dem ein Risiko bewertet oder getragen, eine
  Maßnahme zugeordnet oder eine Feststellung geschlossen wird. Per Tastatur ist das nicht
  erreichbar. Verstößt gegen WCAG 2.1.1 (Stufe A).
- **Behebung:** Die Titelzelle als `<button>` oder als `<Link>` rendern. Eine gemeinsame Komponente
  deckt alle 13 Stellen ab.

### I3 Entfernen und Lösen erscheinen nur beim Überfahren, ohne Rückfrage

- **Wo:** `className="hidden … group-hover:inline"` an diesen Stellen:
  - `EvidenceSection.tsx:155`
  - `Competence.tsx:736` und `:845`, `Context.tsx:446`
  - `Continuity.tsx:702` und `:1196`
  - `Planning.tsx:235` und `:505`, `Privacy.tsx:687`
- **Folge:**
  - `display:none` nimmt die Schaltflächen aus der Tab-Reihenfolge, Touch-Geräte kennen kein
    Überfahren. Per Tastatur und auf dem Tablet lässt sich weder ein Nachweis lösen noch eine TOM
    entfernen.
  - Mit der Maus löscht ein einziger Klick in `Planning.tsx:503-507` einen Knoten des Organigramms
    samt allem darunter. In der ganzen Oberfläche gibt es nur eine Rückfrage (`Incidents.tsx:479`).
- **Behebung:** `opacity-0 group-hover:opacity-100 focus:opacity-100` statt `hidden`, dazu ein
  `aria-label`, das den Eintrag nennt. Eine gemeinsame Rückfrage für Löschvorgänge, beim
  Organigramm mit der Zahl der betroffenen Unterknoten.

### I4 Seitenfenster zeigen bei einem Fehler endlos „Lädt …“

- **Wo:** Der Fehler der Detailabfrage wird nie angezeigt, das Fenster zeigt `{!d ? <Spinner/> : …}`:
  - `Risks.tsx:298` (Anzeige `:355`), `Measures.tsx:199`, `Documents.tsx:381`, `Findings.tsx:325`
  - `Reviews.tsx:487`, `Incidents.tsx:362`, `Audits.tsx:418`, `AiSystems.tsx:255`
  - `Competence.tsx:382` und `:1032`
- **Folge:** Ist der Datensatz inzwischen gelöscht, fehlt das Recht oder ist das Netz weg, dreht
  sich nach einem Wiederholversuch (`main.tsx:37`) das Symbol ohne Meldung weiter.
- **Behebung:** `detail.isError ? <ErrorNote error={detail.error}/> : …`, am besten einmal in einem
  gemeinsamen Seitenfenster (D1).

### I5 Einige Änderungen und alle Dateidownloads scheitern still

| Stelle                                                                                                                                    | Was scheitert                                                                                               | Was die Nutzerin sieht                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Members.tsx:44-66`                                                                                                                       | `onError` behandelt nur die Warnung der Funktionstrennung. Eine Sperre (409) oder ein 403 wird verschluckt. | Die Rollenauswahl springt ohne Grund zurück, genau die Meldung fehlt. |
| `Incidents.tsx:395`, `:403`, `:408`                                                                                                       | Schritt, Ablaufplan und Status sind nicht an das `ErrorNote` in `:461` angeschlossen.                       | Auswahl und Häkchen springen still zurück.                            |
| `Continuity.tsx:482`, `:1079`                                                                                                             | Entfernen von Ressource und Schritt ohne Fehleranzeige.                                                     | Es passiert nichts.                                                   |
| `FileField.tsx:65`, `EvidenceSection.tsx:136`, `Audits.tsx:543`, `Reviews.tsx:580`, `Documents.tsx:490`, `Competence.tsx:527` und `:1148` | `onClick={() => void downloadFile(...)}`, die Ablehnung des Promise wird nicht behandelt.                   | Bei 403 oder 404 passiert nichts.                                     |

Zusätzlich bleiben viele Auswahllisten bei einem Fehler still leer, etwa die Personenauswahl
(`ui.tsx:305`), die dann nur „noch niemand“ anbietet. Einen globalen `onError` für Abfragen oder
Änderungen gibt es nicht (`main.tsx:36-38`).

- **Behebung:** In `main.tsx` einen `MutationCache({ onError })` als Auffangnetz, ein gemeinsames
  `useDownload()` mit Fehlerzustand, in `Members.tsx` jede Nicht-Warnung mit `err.detail` zeigen.

### I6 Der API-Client wirft bei einer Fehlerseite einen englischen `SyntaxError`

- **Wo:** `apps/web/src/lib/api.ts:86` und `:121` rufen `JSON.parse(text)` ohne Schutz auf.
- **Folge:** Startet der API-Behälter neu, antwortet nginx mit einer HTML-Seite 502. Das
  `ErrorNote` zeigt dann `Unexpected token '<', "<html>…" is not valid JSON`. Ohne Netz erscheint
  `Failed to fetch`. Beides bricht die Regel, dass die Oberfläche in einfachem Deutsch spricht.
- **Behebung:** Das Parsen absichern und bei fehlendem JSON „Der Server ist nicht erreichbar
  (Fehler 502)“ melden. Den `TypeError` aus `fetch` als deutsche Netzwerkmeldung weitergeben.

### I7 Die 13 Seitenfenster sind keine modalen Dialoge

- **Wo:** `role="dialog"` mit `aria-label`, aber ohne `aria-modal`, ohne Escape, ohne Fokusführung:
  `AiSystems.tsx:632`, `Audits.tsx:454`, `Competence.tsx:424` und `:1073`, `Continuity.tsx:516` und
  `:1101`, `Documents.tsx:424`, `Findings.tsx:363`, `Incidents.tsx:426`, `Measures.tsx:256`,
  `Privacy.tsx:433`, `Reviews.tsx:524`, `Risks.tsx:352`. Schließen nur per Klick auf den Hintergrund.
- **Folge:** Mit Tastatur oder Bildschirmleser bleibt der Fokus nach dem Öffnen in der Seite
  dahinter. Man tabbt durch das verdeckte Register und kann das Fenster nicht mit Escape schließen.
- **Behebung:** Ein gemeinsames Seitenfenster (D1) mit `aria-modal="true"`, Fokus auf der Überschrift
  beim Öffnen, Fokusfalle, Escape und Rückgabe des Fokus. Das native `<dialog>` mit `showModal()`
  bringt das meiste mit.

### I8 Formularfelder ohne Beschriftung oder nur mit Platzhalter

- **Nur Platzhalter:**
  - `Context.tsx:394`, `:395`, `:397`, `:401`
  - `EvidenceSection.tsx:183`, `:191`
  - `Competence.tsx:703`, `:711`, `:777`, `:785`, `:795`
  - `Continuity.tsx:797`, `:805`, `:810`
  - `Planning.tsx:318`, `:326`, `:327`
  - `Privacy.tsx:933`, `:1074`, `:1083`
- **Ganz ohne zugänglichen Namen:**
  - Auswahllisten in Tabellen: `Soa.tsx:274` und `:307`, `Members.tsx:191`, `Incidents.tsx:443` und
    `:583`
  - `Continuity.tsx:639` (BIA-Raster) und `:1118`, `Context.tsx:864`, `Privacy.tsx:699` und `:742`
  - `Privacy.tsx:941` und `:956`: Eintrittswahrscheinlichkeit und Schwere in der DSFA. Ein
    Bildschirmleser sagt zweimal „3, Auswahlfeld“.
- **Behebung:** Sichtbares `<label htmlFor>` oder, in Tabellen, ein `aria-label` wie
  `Anwendbarkeit A.5.1`.

### I9 nginx sendet für die Oberfläche keine Sicherheits-Header

- **Wo:** `infra/docker/nginx.conf`: keine CSP, kein `X-Content-Type-Options`, keine
  `Referrer-Policy`, kein Schutz gegen Einbetten (`frame-ancestors`), kein `server_tokens off`.
  Helmet (`apps/api/src/app.factory.ts:16`) wirkt nur auf `/api`.
- **Folge:** Nichts begrenzt, was im Ursprung läuft, der das Zugriffstoken hält und das
  Refresh-Cookie bekommt. `script-src 'self'` allein würde I1 entschärfen. Einbetten in fremde
  Seiten ist dank `SameSite=strict` wenig ergiebig, sollte aber abgelehnt werden.
- **Behebung:** Auf Serverebene CSP (`default-src 'self'; script-src 'self'; style-src 'self'
'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'`), `nosniff`,
  `Referrer-Policy no-referrer`, `server_tokens off`. Achtung: Die Blöcke `location /assets/`
  (`:31-34`) und `location /` (`:39-42`) setzen eigene `add_header` und heben damit geerbte auf. Die
  Header dort wiederholen oder über ein `include` einbinden.

### I10 Veröffentlichte Ports binden an alle Netzwerkschnittstellen

- **Entwicklung (`infra/docker/docker-compose.yml`):**
  - `:10-11`: PostgreSQL auf `0.0.0.0:5432` mit Superuser `postgres/postgres` (`:7-8`), dazu
    `isms_migrator/isms_migrator` mit `CREATEDB` (`postgres-init.sql:3`).
  - `:23-25`: Mailpit mit SMTP und Weboberfläche auf `0.0.0.0:1025` und `:8025`.
  - Im Café- oder Büro-WLAN kann sich jeder als Superuser an der Entwicklungsdatenbank anmelden und
    jede Erinnerungsmail mit Fristen, Risiken und Vorfällen lesen. Von Docker veröffentlichte Ports
    umgehen `ufw` und `firewalld`.
- **Server (`docker-compose.yml`):** `:140-141` (`8080:80`) und `:152-153` (Mailpit, nur im Profil
  `mail`). Zusammen mit dem veröffentlichten Demo-Kennwort (06 I6) und reinem HTTP weitet das den
  bekannten Befund vom Laptop auf das ganze Netz aus.
- **Behebung:** Standardmäßig an `127.0.0.1` binden, etwa
  `'${ISMS_BIND:-127.0.0.1}:${ISMS_WEB_PORT:-8080}:80'`, und das bewusste Öffnen dokumentieren.

### I11 Statustexte der Oberfläche weichen von `packages/shared/src/labels.ts` ab

- **Wo:**
  - `apps/web/src/components/ui.tsx:140-167` (`STATUS_LABEL`) gegenüber `packages/shared/src/labels.ts`:
    - `published`: „Freigegeben“ gegenüber „veröffentlicht“ (`:137`)
    - `triage`: „In Bewertung“ gegenüber „in Ersteinschätzung“ (`:162`)
    - `done`: „Umgesetzt“ gegenüber „erledigt“ (`:253`)
    - `verified`: „Wirksam bestätigt“ gegenüber „verifiziert“ (`:41`)
  - `Incidents.tsx:60-69`: `supplier` heißt „Dienstleister“ statt „Lieferant“, `physical`
    „Physisch“ statt „physischer Vorfall“ (`:151`).
  - `apps/web/src/lib/labels.ts:73-106` ist eine zweite, bereits abweichende Kopie der Texte zum
    AI Act (`packages/shared/src/labels.ts:190-224`).
- **Folge:** Der Auditor sieht am Bildschirm „Freigegeben“ und im Auditpaket „veröffentlicht“ für
  dasselbe Dokument. CLAUDE.md nennt `labels.ts` als einzigen Ort für deutsche Begriffe.
- **Behebung:** `@isms/shared` ist bereits eine Abhängigkeit der Oberfläche. Die Texte von dort
  importieren und nur die Farben lokal halten. Welcher Begriff der richtige ist, ist fachlich zu
  entscheiden; „Wirksam bestätigt“ wurde bewusst gewählt.

## Suggestion

- **S1 Druckansicht.** Durch `srcdoc` (`api.ts:207`) gilt die CSP der API-Antwort nicht mehr. Die
  API sollte dieselbe Richtlinie als `<meta http-equiv="Content-Security-Policy">` in den Kopf des
  Dokuments schreiben. Den Rahmen nach `afterprint` entfernen statt nach festen 120 Sekunden
  (`api.ts:212`); wiederholte Klicks stapeln derzeit unsichtbare Rahmen.
- **S2 Info-Symbol (`ui.tsx:347-428`).**
  - Ein Klick nach dem Überfahren schließt die Blase wieder, weil das Überfahren sie schon geöffnet
    hat (`:393`). Auf Touch-Geräten kann ein Tippen öffnen und sofort schließen; auf einem Gerät
    prüfen.
  - Die Blase hat `pointer-events-none` (`:403`) und schließt beim Verlassen, man kann sie also nicht
    selbst überfahren (WCAG 1.4.13).
  - `role="tooltip"` ist nicht über `aria-describedby` verbunden. Ein Bildschirmleser hört nur das
    `aria-label`, nicht den Kurztitel und nicht die ausgeschriebenen Abkürzungen.
  - Das „i“ in `text-slate-400` erreicht 2,56:1, der Ring 1,48:1. Gefordert sind 3:1.
- **S3 Reiter ohne ARIA.** `Context.tsx:138`, `Cockpit.tsx:139`, `Competence.tsx:221`,
  `Continuity.tsx:321`, `Planning.tsx:73`, `Privacy.tsx:481`, `Soa.tsx:94`: kein
  `role="tablist"`/`tab`, kein `aria-selected`, der aktive Reiter ist nur farblich erkennbar.
- **S4 Kontrast.** `text-slate-400` auf Weiß hat 2,56:1 und kommt 86-mal vor, etwa
  `Measures.tsx:160` („nicht zugewiesen“). Die Abschnittsüberschriften der Navigation haben 3,65:1
  bei 10 Pixel (`Layout.tsx:106`). Plaketten und Markenfarbe bestehen alle.
- **S5 Fehler am Feld.** Kein `aria-invalid`, kein `aria-describedby`. Validierungsfehler des
  Servers kommen als englischer Zod-Text mit Pfad an (`api.ts:93`, `zod.pipe.ts:15`), etwa
  `title: String must contain at least 3 character(s)`. Der Spinner (`ui.tsx:260`) hat kein
  `role="status"`; die Fehlerzeilen in `FileField.tsx:82`, `ExportButtons.tsx:61` und
  `AuditPackageButton.tsx:40` haben kein `role="alert"`.
- **S6 Rollen.** `Layout.tsx:134` zeigt technische Rollenschlüssel (`roles.join(', ')`) statt der
  Bezeichnungen aus `Members.tsx:14`.
- **S7 `window.prompt` für Begründungen.** `Soa.tsx:280` (Pflichtbegründung für „nicht
  anwendbar“), `Actions.tsx:222`, `Findings.tsx:523`, `Incidents.tsx:546`, `Kpis.tsx:330`. Prüft
  keine Mindestlänge, zeigt keinen Normbezug und wird in manchen eingebetteten Umgebungen
  unterdrückt. Ein Formular im Fenster wäre besser.
- **S8 Export-Downloads.** `downloadExport` puffert das ganze Auditpaket mit `res.blob()`
  (`api.ts:169`), obwohl der Server streamt; Hunderte Megabyte landen im Speicher des Tabs.
  `fetchExport` (`api.ts:163-166`) verwirft das Detail der Problemantwort, 403 und 500 lesen sich
  gleich.
- **S9 Container.**
  - nginx läuft im Hauptprozess als root (`infra/docker/Dockerfile:63`). Besser
    `nginxinc/nginx-unprivileged` auf Port 8080.
  - Basis-Images nur mit Tag, ohne Digest (`Dockerfile:11`, `:63`); `axllent/mailpit:latest` in
    beiden Compose-Dateien.
  - `worker` und `web` haben keinen Healthcheck.
  - Die Kennwörter von `isms_app` und `isms_migrator` stehen fest in `docker-compose.yml:22-23` und
    `postgres-init.sql:3-4`; `ISMS_POSTGRES_PASSWORD` ändert nur den Superuser.
  - `APP_MASTER_KEY` hat in `docker-compose.yml:33` einen eingebauten Standardwert, gleiche Klasse
    wie 01 C1.
  - `nginx.conf:23` hängt ein vom Client gesendetes `X-Forwarded-For` an. Vor der Behebung von
    03 I2 mit `trust proxy` auf `$remote_addr` umstellen, sonst ist die protokollierte IP fälschbar.
  - `/api/docs` (Swagger, `app.factory.ts:22`) ist über nginx auch im Betrieb erreichbar.
- **S10 Kein Linter.** `lint` ist in `apps/web/package.json` nur `echo skip`. ESLint mit
  `jsx-a11y` und `react-hooks` hätte I2 und I8 gefunden. Außer dem Glossar gibt es keine Tests für
  die Oberfläche, auch keinen für den API-Client bei Fehlerantworten.

## Tabellen

### A Stellen, an denen Daten zu HTML, Adresse oder Navigation werden

| Stelle                                                                  | Was passiert                                                | Bewertung                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `window.open` | kommen nicht vor                                            | in Ordnung                     |
| `EvidenceSection.tsx:144-146`                                           | Adresse aus Nutzereingabe als `href`, Schema nicht begrenzt | **I1** (`rel` ist richtig)     |
| `api.ts:207` `frame.srcdoc = html`                                      | maskiertes HTML der API, Sandbox ohne `allow-scripts`       | sicher, CSP geht verloren (S1) |
| `api.ts:143-153` und `:180-191`                                         | Blob-Download über `createObjectURL`, Freigabe in `finally` | in Ordnung                     |
| `AcceptInvite.tsx:20`                                                   | `window.location.href = '/'`, konstant                      | in Ordnung                     |
| `Dashboard.tsx:244`, `Deadlines.tsx:197`, `Layout.tsx:113`              | `<Link to>` aus Enum-Schlüsseln und Konstanten              | in Ordnung                     |

### B Prüfliste Barrierefreiheit

| Punkt                                          | Ergebnis  | Beispiel                                                       |
| ---------------------------------------------- | --------- | -------------------------------------------------------------- |
| Sprache der Seite                              | erfüllt   | `index.html:2` `lang="de"`                                     |
| Seitentitel je Seite                           | teilweise | immer „ISMS Suite“                                             |
| Sichtbarer Fokus                               | erfüllt   | `index.css:16-18` globaler `:focus-visible`-Rahmen             |
| Sprunglink zum Inhalt                          | fehlt     | `Layout.tsx`                                                   |
| Alles per Tastatur erreichbar                  | **fehlt** | 13 Zeilen (I2), 9 Schaltflächen nur beim Überfahren (I3)       |
| Dialoge mit Fokusfalle, Escape, `aria-modal`   | **fehlt** | 13 Seitenfenster (I7)                                          |
| Felder beschriftet                             | teilweise | meist `label htmlFor` oder `Field`, rund 35 Felder fehlen (I8) |
| Symbol-Schaltflächen benannt                   | erfüllt   | Info-Symbol mit `aria-label`                                   |
| Hinweisblase per Tastatur, Escape, überfahrbar | teilweise | fokussierbar, nicht überfahrbar, Inhalt nicht verbunden (S2)   |
| Reiter mit Rollen und Zustand                  | fehlt     | S3                                                             |
| Tabellenköpfe                                  | erfüllt   | `thead` mit `.th`                                              |
| Fehler am Feld                                 | fehlt     | kein `aria-invalid` (S5)                                       |
| Statusmeldungen für Bildschirmleser            | teilweise | `ErrorNote` mit `role="alert"`, sonst kein `aria-live`         |
| Pflichtfelder gekennzeichnet                   | teilweise | `required` und „Pflicht“                                       |
| Autovervollständigung bei der Anmeldung        | erfüllt   | `Login.tsx:141`, `:155`, `AcceptInvite.tsx:53`                 |
| Kontrast Plaketten                             | erfüllt   | alle mindestens 6,49:1                                         |
| Kontrast Nebentext und Navigation              | fehlt     | `text-slate-400` 2,56:1, `Layout.tsx:106` 3,65:1 (S4)          |
| Aktuelle Seite in der Navigation               | erfüllt   | `NavLink` setzt `aria-current`                                 |

### C Container

| Dienst                    | läuft als               | veröffentlichte Ports  | Geheimnisse und Hinweise                                           |
| ------------------------- | ----------------------- | ---------------------- | ------------------------------------------------------------------ |
| `postgres` (Server)       | postgres                | keine                  | App- und Migrator-Kennwort fest (S9), Healthcheck vorhanden        |
| `migrate`                 | node                    | keine                  | `NODE_ENV=development` und Demodaten (06 I6), JWT-Standard (01 C1) |
| `api`                     | node                    | keine (intern 3000)    | JWT und `APP_MASTER_KEY` mit Standardwert, Migrator-URL (02 I5)    |
| `worker`                  | node                    | keine                  | wie `api`, **kein Healthcheck**                                    |
| `web` (nginx 1.27-alpine) | **root** (Hauptprozess) | **0.0.0.0:8080**       | keine Sicherheits-Header (I9), kein Healthcheck                    |
| `mailpit` (Profil `mail`) | Image-Standard          | **0.0.0.0:8025**       | `:latest`                                                          |
| `postgres` (Entwicklung)  | postgres                | **0.0.0.0:5432**       | Superuser `postgres/postgres` (I10)                                |
| `mailpit` (Entwicklung)   | Image-Standard          | **0.0.0.0:1025, 8025** | `:latest`, offenes SMTP und Postfach                               |

In den Images liegen keine Geheimnisse: `.dockerignore` schließt `.env`, `.env.*`, `node_modules`,
`.git` und `var` aus, das API-Image enthält nur Produktionsabhängigkeiten und `dist`.

### D Doppelter Code

| Nr. | Muster                                                           | Stellen                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Seitenfenster (`fixed inset-0 … role="dialog"` mit Spinner)      | `AiSystems.tsx:625`, `Audits.tsx:447`, `Competence.tsx:417` und `:1066`, `Continuity.tsx:509` und `:1094`, `Documents.tsx:417`, `Findings.tsx:356`, `Incidents.tsx:419`, `Measures.tsx:249`, `Privacy.tsx:426`, `Reviews.tsx:517`, `Risks.tsx:345`. Eine Komponente behebt I4 und I7 an einer Stelle. |
| D2  | `date = (v) => … toLocaleDateString('de-DE')`                    | `Audits.tsx:67`, `Competence.tsx:122`, `Context.tsx:69`, `Continuity.tsx:164`, `Deadlines.tsx:63`, `Documents.tsx:89`, `Findings.tsx:69`, `Kpis.tsx:48`, `Planning.tsx:53`, `Privacy.tsx:126`, `Reviews.tsx:100`, `EvidenceSection.tsx:21`                                                            |
| D3  | Texte zu Enum-Werten, doppelt zu `packages/shared/src/labels.ts` | `ui.tsx:90`, `:140`, `:182`; `Incidents.tsx:54`, `:60`; `Privacy.tsx:103`, `:108`, `:120`; `Assets.tsx:24`, `:37`; `Documents.tsx:74`, `:82`; `Audits.tsx:57`; `Findings.tsx:61`; `Actions.tsx:20`; `apps/web/src/lib/labels.ts:52-106` (siehe I11)                                                   |
| D4  | Datei-Upload (verstecktes Feld, Belegt-Zustand, Fehler)          | `FileField.tsx:32-59` und `EvidenceSection.tsx:218-245`                                                                                                                                                                                                                                               |
| D5  | Personenauswahl                                                  | `ui.tsx:294` (`OwnerSelect`), `AiSystems.tsx:698` (`PersonSelect`), `Context.tsx:660` und `:732` von Hand, mit anderem Abfrageschlüssel, die Liste wird doppelt geladen                                                                                                                               |
| D6  | Entfernen nur beim Überfahren                                    | die neun Stellen aus I3                                                                                                                                                                                                                                                                               |
| D7  | Reiterleiste                                                     | die sieben Stellen aus S3                                                                                                                                                                                                                                                                             |
| D8  | Blob als Download-Link                                           | `api.ts:143-154` und `:180-191`                                                                                                                                                                                                                                                                       |
| D9  | Begründung per `window.prompt`                                   | die fünf Stellen aus S7                                                                                                                                                                                                                                                                               |

## Was gut gelöst ist

1. Kein `dangerouslySetInnerHTML`, das Zugriffstoken liegt nur im Speicher, der einzige externe Link
   hat bereits `rel="noopener noreferrer"`.
2. Die Druckansicht läuft in einer Sandbox ohne Skripte, Objekt-URLs werden in `finally`
   freigegeben.
3. Fehler laufen meist über ein einziges `ErrorNote` mit `role="alert"`, das Titel und Detail der
   Problemantwort zeigt.
4. Globaler Fokusrahmen, `lang="de"`, korrekte Autovervollständigung bei der Anmeldung,
   `aria-current` in der Navigation, ein echtes Info-Symbol mit `aria-label`, das in
   `document.body` gerendert und nicht abgeschnitten wird.
5. API, Worker und Migration laufen als `node`. Die Server-Compose veröffentlicht die Datenbank
   nicht. Die Startreihenfolge folgt Healthchecks und `service_completed_successfully`, ein
   Dockerfile mit gemeinsamer Build-Stufe, das Präfix `ISMS_` verhindert stilles Überschreiben aus
   `.env`.
