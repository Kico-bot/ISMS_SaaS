# Die ISMS-Suite auf dem eigenen Server

Diese Anleitung führt Schritt für Schritt von einem leeren Server zu einer Suite, in der Ihre
Organisation arbeitet: mit eigener Adresse, verschlüsselter Verbindung, ohne Demodaten und mit
E-Mail-Versand für Einladungen und Erinnerungen. Rechnen Sie mit etwa einer Stunde.

Zum bloßen Ausprobieren auf dem eigenen Rechner reicht der [Schnellstart im README](README.md#schnellstart-mit-docker).
Technische Einzelheiten zu allen Einstellungen stehen in [docs/deployment.md](docs/deployment.md).

> **Lizenz:** Für den Einsatz in der eigenen Organisation ist die Suite kostenlos. Wer sie als
> Dienstleister bei Kunden einrichtet oder für andere betreibt, braucht eine Lizenz, siehe
> [LIZENZIERUNG.md](LIZENZIERUNG.md).

## Überblick

1. [Was Sie brauchen](#1-was-sie-brauchen)
2. [Docker installieren](#2-docker-installieren)
3. [Suite herunterladen](#3-suite-herunterladen)
4. [Einstellungen festlegen](#4-einstellungen-festlegen)
5. [Verschlüsselte Verbindung einrichten](#5-verschlüsselte-verbindung-einrichten)
6. [Starten](#6-starten)
7. [Ihre Organisation anlegen](#7-ihre-organisation-anlegen)
8. [E-Mail-Versand einrichten](#8-e-mail-versand-einrichten)
9. [Kolleginnen und Kollegen einladen](#9-kolleginnen-und-kollegen-einladen)
10. [Datensicherung und Aktualisierung](#10-datensicherung-und-aktualisierung)
11. [Wenn etwas nicht klappt](#11-wenn-etwas-nicht-klappt)
12. [Was die Suite noch nicht kann](#12-was-die-suite-noch-nicht-kann)

## 1. Was Sie brauchen

| Was               | Empfehlung                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Server            | Linux, zum Beispiel Ubuntu 24.04 LTS. Mindestens 2 Prozessorkerne, 4 GB Arbeitsspeicher, 20 GB Platte plus Platz für Ihre Nachweisdateien |
| Adresse           | Eine eigene Subdomain, zum Beispiel `isms.ihre-firma.de`, deren DNS-Eintrag auf den Server zeigt                                          |
| Offene Ports      | 80 und 443 (für die verschlüsselte Verbindung), 22 für Ihre eigene Verwaltung                                                             |
| E-Mail            | Ein Postfach oder SMTP-Zugang, über den die Suite versenden darf                                                                          |
| Zugang zum Server | Ein Konto mit `sudo`-Rechten                                                                                                              |

Die Suite kann auch ohne Internetanbindung im internen Netz laufen. Dann entfällt Schritt 5, und
Sie öffnen sie über `http://<Servername>:8080`.

## 2. Docker installieren

Die Suite läuft in Containern. Auf Ubuntu installiert dieser Befehl Docker samt Compose:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Für andere Systeme: <https://docs.docker.com/engine/install/>. Prüfen Sie danach mit
`docker compose version`, dass Compose da ist.

## 3. Suite herunterladen

```bash
git clone https://github.com/Kico-bot/ISMS_SaaS.git
cd ISMS_SaaS
```

Alle weiteren Befehle laufen in diesem Ordner.

## 4. Einstellungen festlegen

Alle Einstellungen stehen in einer Datei `.env` in diesem Ordner. Dieser Befehl legt sie an und
erzeugt dabei zufällige Schlüssel. Ersetzen Sie vorher `isms.ihre-firma.de` durch Ihre Adresse:

```bash
cat > .env <<EOF
# Schlüssel: zufällig erzeugt, nie weitergeben
ISMS_JWT_SECRET=$(openssl rand -base64 48)
ISMS_APP_MASTER_KEY=$(openssl rand -base64 32)
ISMS_POSTGRES_PASSWORD=$(openssl rand -hex 24)

# Echter Betrieb: keine Demodaten, nur die erste Person legt die Organisation an
ISMS_SEED_DEMO=false
ISMS_REGISTRATION=first

# Unter dieser Adresse erreichen Ihre Nutzer die Suite. Sie steht in jeder Einladung.
ISMS_PUBLIC_URL=https://isms.ihre-firma.de
ISMS_COOKIE_SECURE=true

# Die Suite lauscht nur auf dem Server selbst, nach außen spricht der Proxy aus Schritt 5
ISMS_WEB_PORT=127.0.0.1:8080
EOF
chmod 600 .env
```

Was die Zeilen bedeuten:

| Einstellung              | Bedeutung                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ISMS_JWT_SECRET`        | Signiert die Anmeldungen. Ohne eigenen Wert startet die Suite nicht.                                           |
| `ISMS_APP_MASTER_KEY`    | Verschlüsselt besonders schutzwürdige Felder. **Geht er verloren, sind diese Felder nicht mehr lesbar.**       |
| `ISMS_POSTGRES_PASSWORD` | Kennwort der Datenbank. Gilt nur beim allerersten Start, später ändert es sich nicht mehr von selbst.          |
| `ISMS_SEED_DEMO`         | `false`: kein Beispielmandant. Mit `true` läge ein Mandant mit öffentlich bekanntem Kennwort in der Datenbank. |
| `ISMS_REGISTRATION`      | `first`: nur die erste Person legt einen Mandanten an, danach nur noch per Einladung. `closed`: niemand.       |
| `ISMS_PUBLIC_URL`        | Die Adresse, die Ihre Nutzer im Browser eingeben.                                                              |
| `ISMS_COOKIE_SECURE`     | `true`, sobald die Suite über `https://` läuft. Ohne verschlüsselte Verbindung (internes Netz) `false`.        |
| `ISMS_WEB_PORT`          | Wo die Oberfläche lauscht. Im internen Netz ohne Proxy: einfach `8080`.                                        |

**Sichern Sie die Datei `.env` an einem zweiten Ort**, etwa im Passwortmanager. Ohne sie lässt
sich eine Datensicherung nicht vollständig zurückspielen.

## 5. Verschlüsselte Verbindung einrichten

Kennwörter und Inhalte dürfen nicht unverschlüsselt durchs Netz gehen. Am einfachsten gelingt
das mit **Caddy**: Es holt sich das Zertifikat selbst und erneuert es automatisch, kostenlos über
Let's Encrypt.

1. Caddy installieren, Anleitung für Ihr System: <https://caddyserver.com/docs/install>
2. Die Datei `/etc/caddy/Caddyfile` durch diese drei Zeilen ersetzen (Adresse anpassen):

   ```
   isms.ihre-firma.de {
       reverse_proxy 127.0.0.1:8080
   }
   ```

3. Caddy neu laden: `sudo systemctl reload caddy`

Voraussetzung ist, dass der DNS-Eintrag schon auf den Server zeigt und die Ports 80 und 443
offen sind. Wer bereits nginx oder einen anderen Proxy betreibt, findet ein Beispiel in
[docs/deployment.md](docs/deployment.md#7-vom-vorführ--in-den-produktivbetrieb).

## 6. Starten

```bash
docker compose up -d --build
```

Der erste Start dauert einige Minuten: Die Suite wird gebaut, die Datenbank eingerichtet und der
Normenkatalog geladen. Den Fortschritt sehen Sie mit `docker compose logs -f migrate`; mit
`Strg+C` verlassen Sie die Anzeige. Danach sollten alle Dienste laufen:

```bash
docker compose ps -a
```

`postgres`, `api`, `worker` und `web` stehen auf `running` oder `healthy`, `migrate` ist mit
`Exited (0)` fertig. Die Container starten nach einem Neustart des Servers von selbst.

## 7. Ihre Organisation anlegen

1. Öffnen Sie `https://isms.ihre-firma.de`.
2. Wählen Sie **„Mandant anlegen“** und tragen Sie ein: den Namen Ihrer Organisation, ein kurzes
   Kürzel (zum Beispiel `ihre-firma`), Ihren Namen, Ihre E-Mail-Adresse und ein Kennwort mit
   mindestens 12 Zeichen.
3. Sie sind jetzt angemeldet, als ISMS-Leitung mit allen Rechten.

Danach verschwindet „Mandant anlegen“ von der Anmeldeseite. Wer die Adresse kennt, kann sich
keinen eigenen Zugang mehr verschaffen; alle Weiteren kommen per Einladung.

ISO 27001 ist bereits aktiv. NIS2, DSGVO, IT-Grundschutz und den EU AI Act schalten Sie bei
Bedarf unter **Verwaltung → Einstellungen → Normen & Regelwerke** dazu.

## 8. E-Mail-Versand einrichten

Die Suite verschickt zwei Arten von Nachrichten: **Einladungen** an neue Nutzerinnen und Nutzer
und jeden Werktag eine **Erinnerung an die eigenen Fristen**. Ohne Einrichtung verschickt sie
nichts, und Sie geben Einladungslinks von Hand weiter.

Sie brauchen von Ihrem E-Mail-Anbieter oder Ihrer IT: den Mailserver (SMTP), den Port, ein
Konto mit Kennwort und eine Absenderadresse, die dieses Konto verwenden darf. Ergänzen Sie in
der `.env`:

```bash
ISMS_MAIL_DRIVER=smtp
ISMS_SMTP_HOST=smtp.ihr-anbieter.de
ISMS_SMTP_PORT=587
ISMS_SMTP_SECURE=false
ISMS_SMTP_USER=isms@ihre-firma.de
ISMS_SMTP_PASS=das-kennwort-des-postfachs
ISMS_SMTP_FROM="ISMS-Suite <isms@ihre-firma.de>"
```

Welcher Port und welche Einstellung zu `ISMS_SMTP_SECURE` passt:

| Ihr Mailserver bietet                       | `ISMS_SMTP_PORT` | `ISMS_SMTP_SECURE`                                             |
| ------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| Port 587 mit STARTTLS (am häufigsten)       | `587`            | `false`                                                        |
| Port 465 mit TLS von Anfang an              | `465`            | `true`                                                         |
| Interner Relay ohne Anmeldung (oft Port 25) | `25`             | `false`, und `ISMS_SMTP_USER` und `ISMS_SMTP_PASS` leer lassen |

Danach die Suite mit den neuen Einstellungen starten. Ein neuer Bau ist dafür nicht nötig:

```bash
docker compose up -d
```

**Testen:** Unter **Fristen → Erinnerungen per E-Mail** steht jetzt „Zustellung: über SMTP
eingerichtet“. **„Meine Erinnerung jetzt erzeugen“** schickt Ihnen eine Nachricht, sofern Ihnen
Fristen zugeordnet sind. Noch einfacher: Laden Sie eine zweite eigene Adresse ein (Schritt 9).

**Gut zu wissen:**

- Bei Microsoft 365 und Google Workspace ist die Anmeldung per Kennwort am SMTP-Server oft
  abgeschaltet. Fragen Sie Ihre IT nach einem SMTP-Relay oder einem App-Kennwort für die Suite.
- Kommen Nachrichten nicht an, stehen die Gründe im Protokoll: `docker compose logs api worker | grep -iE "mail|zugestellt"`
- Landet die Post im Spam, prüfen Sie mit Ihrer IT, ob die Absenderadresse im SPF-Eintrag Ihrer
  Domain erlaubt ist.
- Die tägliche Erinnerung geht um 7 Uhr UTC raus. Ändern lässt sich das mit `ISMS_DIGEST_CRON`,
  siehe [docs/deployment.md](docs/deployment.md#4-konfiguration).

## 9. Kolleginnen und Kollegen einladen

1. In der Navigation unter **Verwaltung → Mitglieder & Rollen** öffnen.
2. Name, E-Mail-Adresse und Rolle eintragen, zum Beispiel „Auditor“ oder
   „Datenschutzbeauftragte:r“, und einladen.
3. Die Person bekommt eine E-Mail mit einem Link, legt darüber ihr Kennwort fest und ist
   angemeldet. Der Link gilt sieben Tage.

Ist kein E-Mail-Versand eingerichtet oder kommt die Nachricht nicht an, zeigt die Suite den
Link direkt an. Geben Sie ihn dann auf einem sicheren Weg weiter, denn wer den Link hat, kann
das Konto übernehmen.

Die Suite achtet auf Funktionstrennung: Wer zum Beispiel ISMS-Leitung ist, kann nicht zugleich
die eigene Arbeit auditieren. Passt eine Rollenkombination nicht, sagt sie das beim Einladen.

## 10. Datensicherung und Aktualisierung

**Sichern** müssen Sie drei Dinge: die Datenbank, die hochgeladenen Nachweisdateien und die
Datei `.env`. Die Befehle dafür und wie man eine Sicherung zurückspielt, stehen in
[docs/deployment.md, Abschnitt 6](docs/deployment.md#6-datensicherung-und-rückspielen). Spielen
Sie eine Sicherung einmal probehalber zurück, bevor Sie sich auf sie verlassen.

**Aktualisieren** auf eine neue Version:

```bash
git pull
docker compose up -d --build
```

Die Datenbank wird dabei automatisch auf den neuen Stand gebracht; Ihre Daten bleiben erhalten.
Sichern Sie vorher trotzdem.

## 11. Wenn etwas nicht klappt

| Was Sie sehen                                                        | Woran es meist liegt                                                    | Was hilft                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `api` startet nicht, im Protokoll „Ungültige Umgebungskonfiguration“ | Schlüssel in der `.env` fehlen oder sind zu kurz                        | Schritt 4 wiederholen                                                     |
| Die Seite lädt nicht über `https://`                                 | DNS zeigt noch nicht auf den Server, oder Port 80/443 zu                | `sudo journalctl -u caddy` zeigt, warum kein Zertifikat ausgestellt wurde |
| Nach jedem Neuladen ist man abgemeldet                               | `ISMS_COOKIE_SECURE=true`, aber Aufruf über `http://`                   | Über `https://` aufrufen, im internen Netz ohne TLS auf `false` setzen    |
| Links in Einladungen zeigen auf `localhost`                          | `ISMS_PUBLIC_URL` fehlt                                                 | Eintragen, dann `docker compose up -d`                                    |
| „Mandant anlegen“ fehlt schon beim ersten Aufruf                     | Es gibt bereits einen Mandanten, etwa aus einem Probelauf mit Demodaten | `docker compose down -v` löscht **alle** Daten, danach neu starten        |
| Keine E-Mails                                                        | Siehe Schritt 8, „Gut zu wissen“                                        | Protokoll prüfen                                                          |

Weitere Fälle: [Fehlersuche in docs/deployment.md](docs/deployment.md#9-fehlersuche).

## 12. Was die Suite noch nicht kann

Damit Sie den Betrieb richtig einschätzen:

- **Kein „Passwort vergessen“.** Wer sein Kennwort vergisst, kann es noch nicht selbst
  zurücksetzen.
- **Keine Zwei-Faktor-Anmeldung und keine Sperre nach vielen Fehlversuchen.** Machen Sie die
  Suite deshalb nur so weit erreichbar wie nötig: am besten nur im internen Netz oder über VPN.
  Muss sie aus dem Internet erreichbar sein, wählen Sie lange Kennwörter.
- **Im Änderungsprotokoll steht hinter einem Proxy die Adresse des Proxys**, nicht die des
  Nutzers. Wer was geändert hat, steht trotzdem korrekt darin.
- **Anmeldung über Microsoft Entra ID** ist vorbereitet, aber noch nicht eingebaut.
