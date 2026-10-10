#!/usr/bin/env python3
"""
Extrahiert die Framework-Kataloge aus den Referenz-PDFs in docs/context/
und schreibt sie als JSON nach packages/catalog/data/.

Aufruf (aus dem Repo-Root):  python3 packages/catalog/extract/extract.py

Lizenzhinweis: Für ISO/IEC 27001 werden ausschließlich Referenznummern und
Kurztitel übernommen (kein Normtext). BSI-Kompendium, NIS2 und DSGVO sind frei
verwendbar; hier werden Titel und – wo sinnvoll – Volltexte übernommen.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.modules["cryptography"] = None  # pypdf: kaputtes Crypto-Backend in manchen Umgebungen umgehen
import pypdf  # noqa: E402

logging.getLogger("pypdf").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[3]
CTX = ROOT / "docs" / "context"
OUT = ROOT / "packages" / "catalog" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def pages(pdf: Path, start=0, end=None):
    r = pypdf.PdfReader(str(pdf))
    end = len(r.pages) if end is None else min(end, len(r.pages))
    for i in range(start, end):
        yield i, " ".join((r.pages[i].extract_text() or "").split())


def dehyphen(s: str) -> str:
    # "initiie- ren" -> "initiieren", aber "Patch- und" bleibt
    return re.sub(r"(?<=[a-zäöüß])- (?!(und|oder|bzw\.|sowie|als|von|zu|für)\b)(?=[a-zäöüß])", "", s)


def label(s: str) -> str:
    """ltree-Label: nur [A-Za-z0-9_]"""
    return re.sub(r"[^A-Za-z0-9_]", "_", s)


# --------------------------------------------------------------------------------------
# ISO/IEC 27001:2022 – Klauseln 4–10 (aus Inhaltsverzeichnis) + Annex A (aus Tabelle A.1)
# --------------------------------------------------------------------------------------
def extract_iso():
    pdf = CTX / "DIN EN ISO_IEC 27001_2024-01.PDF"
    text = " ".join(t for _, t in pages(pdf))
    reqs = []

    chapters = {
        "4": "Kontext der Organisation", "5": "Führung", "6": "Planung", "7": "Unterstützung",
        "8": "Betrieb", "9": "Bewertung der Leistung", "10": "Verbesserung",
    }
    for i, (num, title) in enumerate(chapters.items()):
        reqs.append(dict(ref_code=num, title=title, kind="clause", parent_ref=None,
                         path=f"ISO27001.C{num}", sort_order=(i + 1) * 100))

    # Inhaltsverzeichnis: "4.1 Verstehen der Organisation und ihres Kontextes . . . 7"
    toc_start = text.find("Inhalt Seite")
    toc_end = text.find("Europäisches Vorwort", toc_start + 20)
    toc = text[toc_start:toc_end]
    seen = set()
    order = 0
    for m in re.finditer(r"(?<![\d.])((?:[4-9]|10)(?:\.\d+){1,2}) ([A-ZÄÖÜ][^.]*?) \.(?: \.)*", toc):
        ref, title = m.group(1), m.group(2).strip()
        if ref in seen:
            continue
        seen.add(ref)
        order += 1
        parts = ref.split(".")
        parent = ".".join(parts[:-1])
        reqs.append(dict(ref_code=ref, title=title, kind="clause", parent_ref=parent,
                         path="ISO27001." + ".".join("C" + label(".".join(parts[: k + 1])) for k in range(len(parts))),
                         sort_order=int(parts[0]) * 100 + order))

    # Annex A: Tabelle A.1 – "5.10 Titel Maßnahme <Text>"
    domains = {"5": ("A.5", "Organisatorische Maßnahmen", "organizational"),
               "6": ("A.6", "Personenbezogene Maßnahmen", "people"),
               "7": ("A.7", "Physische Maßnahmen", "physical"),
               "8": ("A.8", "Technologische Maßnahmen", "technological")}
    reqs.append(dict(ref_code="A", title="Anhang A – Referenzmaßnahmenziele und -maßnahmen", kind="clause",
                     parent_ref=None, path="ISO27001.A", sort_order=2000))
    for d, (ref, title, dom) in domains.items():
        reqs.append(dict(ref_code=ref, title=title, kind="clause", parent_ref="A", domain=dom,
                         path=f"ISO27001.A.A{d}", sort_order=2000 + int(d) * 100))
    annex = text[text.find("Tabelle A.1"):]
    controls = {}
    for m in re.finditer(r"(?<![\d.])([5-8]\.\d{1,2}) (.+?) Maßnahme ", annex):
        num, title = m.group(1), dehyphen(m.group(2)).strip()
        if num in controls or len(title) > 120:
            continue
        controls[num] = title
    for num, title in controls.items():
        d, n = num.split(".")
        reqs.append(dict(ref_code=f"A.{num}", title=title, kind="control", parent_ref=f"A.{d}",
                         domain=domains[d][2], path=f"ISO27001.A.A{d}.A{d}_{n}",
                         sort_order=2000 + int(d) * 100 + int(n)))
    assert len(controls) == 93, f"Annex A: {len(controls)} Controls gefunden, erwartet 93"
    return dict(
        framework=dict(key="ISO27001", version="2022", name="ISO/IEC 27001:2022", publisher="ISO/IEC",
                       jurisdiction="INT",
                       license_note="Nur Referenz + Kurztitel (DIN-Urheberrecht); kein Normtext."),
        requirements=reqs,
    )


# --------------------------------------------------------------------------------------
# BSI IT-Grundschutz-Kompendium Edition 2023 – Bausteine + Anforderungen
# --------------------------------------------------------------------------------------
BAUSTEIN_FAMILIES = {
    "ISMS": "Sicherheitsmanagement", "ORP": "Organisation und Personal", "CON": "Konzepte und Vorgehensweisen",
    "OPS": "Betrieb", "DER": "Detektion und Reaktion", "APP": "Anwendungen", "SYS": "IT-Systeme",
    "IND": "Industrielle IT", "NET": "Netze und Kommunikation", "INF": "Infrastruktur",
}
LEVEL = {"B": "basis", "S": "standard", "H": "erhoeht"}


def extract_bsi():
    pdf = CTX / "IT_Grundschutz_Kompendium_Edition2023.pdf"
    all_pages = list(pages(pdf))
    toc = " ".join(t for i, t in all_pages if i < 40)
    body = " ".join(t for i, t in all_pages if i >= 40)

    reqs = []
    for i, (fam, title) in enumerate(BAUSTEIN_FAMILIES.items()):
        reqs.append(dict(ref_code=fam, title=title, kind="clause", parent_ref=None,
                         path=f"BSI_GS.{fam}", sort_order=(i + 1) * 10000))

    # Bausteine aus dem Gesamtinhaltsverzeichnis: "• ORP.4 Identitäts- und Berechtigungsmanagement"
    bausteine = {}
    toc = toc[toc.find("Prozess-Bausteine ISMS:"):]
    for m in re.finditer(r"[•◦] ([A-Z]{3,4}(?:\.\d+)+) (.+?)(?= [•◦]|$)", toc):
        code, title = m.group(1), m.group(2).strip()
        # Gruppenüberschriften ("SYS.1.2 Windows Server ◦") und Seiten-/Familienreste abschneiden
        title = re.split(r" [A-Z]{3,4}(?:\.\d+)*:| [A-Z]{3,4}(?:\.\d+)+ (?=[A-ZÄÖÜ])| \d?IT-Grundschutz| System-Bausteine| Prozess-Bausteine|: Der Baustein", title)[0].strip()
        if code.split(".")[0] in BAUSTEIN_FAMILIES and code not in bausteine and title:
            bausteine[code] = dehyphen(title)
    fam_order = {f: i for i, f in enumerate(BAUSTEIN_FAMILIES)}
    for n, (code, title) in enumerate(bausteine.items()):
        fam = code.split(".")[0]
        reqs.append(dict(ref_code=code, title=title, kind="baustein", parent_ref=fam,
                         path=f"BSI_GS.{fam}.{label(code)}", sort_order=(fam_order[fam] + 1) * 10000 + (n + 1) * 100))

    # Anforderungen: "ORP.4.A1 Regelung für die Einrichtung ... (B) [Rolle]"
    found = {}
    for m in re.finditer(r"\b([A-Z]{3,4}(?:\.\d+)+)\.A(\d+) (.+?) \(([BSH])\)", body):
        bcode, n, title, lvl = m.group(1), int(m.group(2)), dehyphen(m.group(3)).strip(), m.group(4)
        code = f"{bcode}.A{n}"
        if bcode not in bausteine or code in found or len(title) > 160:
            continue
        found[code] = (bcode, n, title, lvl)
    # Bausteine ohne eigene Anforderungen sind Gruppenüberschriften oder ersetzte Bausteine
    with_reqs = {bcode for (bcode, _, _, _) in found.values()}
    reqs = [r for r in reqs if r["kind"] != "baustein" or r["ref_code"] in with_reqs]
    bausteine = {k: v for k, v in bausteine.items() if k in with_reqs}
    for code, (bcode, n, title, lvl) in found.items():
        if title.upper().startswith("ENTFALLEN"):
            continue
        fam = bcode.split(".")[0]
        base = next(r["sort_order"] for r in reqs if r["ref_code"] == bcode)
        reqs.append(dict(ref_code=code, title=title, kind="anforderung", level=LEVEL[lvl], parent_ref=bcode,
                         path=f"BSI_GS.{fam}.{label(bcode)}.{label(code)}", sort_order=base + n))
    return dict(
        framework=dict(key="BSI_GS", version="2023-Ed6", name="BSI IT-Grundschutz-Kompendium, Edition 2023",
                       publisher="BSI", jurisdiction="DE",
                       license_note="Frei verwendbar; Titel und Anforderungs-Level übernommen."),
        requirements=reqs,
    ), set(bausteine), set(found)


# --------------------------------------------------------------------------------------
# EU-Rechtsakte: NIS2 (2022/2555) und DSGVO (2016/679) – Artikel + ausgewählte Absätze
# --------------------------------------------------------------------------------------
def extract_articles(pdf: Path, start_page: int, max_article: int):
    text = " ".join(t for _, t in pages(pdf, start=start_page))
    text = re.sub(r"\d{1,2}\.\d{1,2}\.\d{4} L \d+/\d+ Amtsblatt der Europäischen Union DE", " ", text)
    text = text.replace("­", "")
    arts = []
    anchors = [(m.start(), int(m.group(1))) for m in
               re.finditer(r"(?<![\w.])Artikel (\d{1,3}) (?!Absatz|Absätze|Unterabsatz|Buchstabe|Nummer)(?=[A-ZÄÖÜ])", text)]
    # nur streng aufsteigende Artikel-Nummern zählen (Querverweise ignorieren)
    seq, expect = [], 1
    for pos, n in anchors:
        if n == expect:
            seq.append((pos, n)); expect += 1
    seq = [(p, n) for p, n in seq if n <= max_article]
    for k, (pos, n) in enumerate(seq):
        end = seq[k + 1][0] if k + 1 < len(seq) else len(text)
        chunk = text[pos:end]
        m = re.match(r"Artikel \d+ (.+?)(?= \(1\) | Die | Der | Das | Jede| Um | Bei | Für | Ist | Hat | Wird | Wenn | Diese| Es | Im | Jedwede | Jegliche| In | Personenbezogene | Bis | Internationale |$)", chunk)
        title = m.group(1).strip() if m else ""
        title = title[:140]
        arts.append(dict(n=n, title=title, body=chunk[len(f"Artikel {n} {title}"):].strip()))
    return arts


# Pflichten der Einrichtungen. Alles andere in der Richtlinie richtet sich an Mitgliedstaaten und
# Behörden oder bestimmt Begriffe — es zählt nicht in Abdeckung und Liste (applies_to = not_addressed).
NIS2_ADDRESSED = {20, 21, 23, 27}

# In Deutschland gilt die Richtlinie über das BSIG (NIS2UmsuCG, in Kraft seit 6.12.2025). Ein Prüfer
# fragt nach dem Paragrafen, deshalb steht er als zweite Fundstelle an derselben Zeile. § 30 Abs. 2
# zählt die zehn Maßnahmen in derselben Reihenfolge auf wie Art. 21 Abs. 2 a)–j).
# UNGEPRÜFT: Die Zuordnung a) → Nr. 1 … j) → Nr. 10 ist positionell erzeugt und noch nicht gegen den
# amtlichen Gesetzestext abgeglichen — siehe docs/offene-punkte.md.
NIS2_BSIG = {
    "Art. 20": "§ 38 BSIG",
    "Art. 21": "§ 30 BSIG",
    "Art. 23": "§ 32 BSIG",
    "Art. 27": "§ 33 BSIG",
    **{f"Art. 21 Abs. 2 {lit})": f"§ 30 Abs. 2 Nr. {k + 1} BSIG" for k, lit in enumerate("abcdefghij")},
}


def extract_nis2():
    arts = extract_articles(CTX / "NIS2.pdf", start_page=28, max_article=46)
    reqs = []
    chapters = [("I", "Allgemeine Bestimmungen", 1, 6), ("II", "Koordinierte Rahmen für die Cybersicherheit", 7, 13),
                ("III", "Zusammenarbeit auf Unionsebene und internationaler Ebene", 14, 19),
                ("IV", "Risikomanagementmaßnahmen und Berichtspflichten", 20, 25),
                ("V", "Zuständigkeit und Registrierung", 26, 28),
                ("VI", "Informationsaustausch", 29, 30), ("VII", "Aufsicht und Durchsetzung", 31, 37),
                ("VIII", "Delegierte Rechtsakte und Durchführungsrechtsakte", 38, 39),
                ("IX", "Schlussbestimmungen", 40, 46)]
    for i, (num, title, a, b) in enumerate(chapters):
        reqs.append(dict(ref_code=f"Kap. {num}", title=title, kind="clause", parent_ref=None,
                         path=f"NIS2.K{num}", sort_order=(i + 1) * 1000))
    for art in arts:
        chap = next(c for c in chapters if c[2] <= art["n"] <= c[3])
        relevant = 20 <= art["n"] <= 23  # Pflichten der Einrichtungen: Volltext übernehmen
        reqs.append(dict(ref_code=f"Art. {art['n']}", title=art["title"], kind="article",
                         body=art["body"] if relevant else None, parent_ref=f"Kap. {chap[0]}",
                         applies_to=None if art["n"] in NIS2_ADDRESSED else "not_addressed",
                         alt_ref=NIS2_BSIG.get(f"Art. {art['n']}"),
                         # Schrittweite 20, damit die Buchstaben von Art. 21 Abs. 2 vor Art. 22 einsortiert werden
                         path=f"NIS2.K{chap[0]}.Art{art['n']}", sort_order=(chapters.index(chap) + 1) * 1000 + art["n"] * 20))
    # Art. 21 Abs. 2 a–j als Einzelanforderungen (die "10 Mindestmaßnahmen")
    a21 = next(a for a in arts if a["n"] == 21)["body"]
    seg = a21[a21.find("(2)"):a21.find("(3)")]
    items = re.findall(r"(?:^|\s)([a-j])\) (.+?)(?=;|\.\s*\(3\)|$)", seg)
    for k, (lit, txt) in enumerate(items):
        reqs.append(dict(ref_code=f"Art. 21 Abs. 2 {lit})", title=txt.strip().rstrip(".;"), kind="paragraph",
                         parent_ref="Art. 21", alt_ref=NIS2_BSIG[f"Art. 21 Abs. 2 {lit})"], path=f"NIS2.KIV.Art21.Art21_2_{lit}", sort_order=4000 + 21 * 20 + k + 1))
    assert len(items) == 10, f"NIS2 Art. 21 Abs. 2: {len(items)} Buchstaben gefunden, erwartet 10"
    return dict(
        framework=dict(key="NIS2", version="2022/2555", name="Richtlinie (EU) 2022/2555 (NIS-2-Richtlinie)",
                       publisher="EU", jurisdiction="EU", license_note="Amtstext, frei verwendbar."),
        requirements=reqs,
    )


def extract_dsgvo():
    arts = extract_articles(CTX / "DSGVO.pdf", start_page=31, max_article=99)
    reqs = []
    chapters = [("I", "Allgemeine Bestimmungen", 1, 4), ("II", "Grundsätze", 5, 11),
                ("III", "Rechte der betroffenen Person", 12, 23),
                ("IV", "Verantwortlicher und Auftragsverarbeiter", 24, 43),
                ("V", "Übermittlungen personenbezogener Daten an Drittländer oder an internationale Organisationen", 44, 50),
                ("VI", "Unabhängige Aufsichtsbehörden", 51, 59), ("VII", "Zusammenarbeit und Kohärenz", 60, 76),
                ("VIII", "Rechtsbehelfe, Haftung und Sanktionen", 77, 84),
                ("IX", "Vorschriften für besondere Verarbeitungssituationen", 85, 91),
                ("X", "Delegierte Rechtsakte und Durchführungsrechtsakte", 92, 93), ("XI", "Schlussbestimmungen", 94, 99)]
    for i, (num, title, a, b) in enumerate(chapters):
        reqs.append(dict(ref_code=f"Kap. {num}", title=title, kind="clause", parent_ref=None,
                         path=f"DSGVO.K{num}", sort_order=(i + 1) * 1000))
    relevant = set(range(5, 12)) | set(range(12, 24)) | set(range(24, 40))
    for art in arts:
        chap = next(c for c in chapters if c[2] <= art["n"] <= c[3])
        # Kap. II–V (Art. 5–49) sind Pflichten des Verantwortlichen bzw. Auftragsverarbeiters; der Rest
        # richtet sich an Aufsichtsbehörden und Mitgliedstaaten oder regelt Sanktionen.
        reqs.append(dict(ref_code=f"Art. {art['n']}", title=art["title"], kind="article",
                         body=art["body"] if art["n"] in relevant else None, parent_ref=f"Kap. {chap[0]}",
                         applies_to=None if 5 <= art["n"] <= 49 else "not_addressed",
                         path=f"DSGVO.K{chap[0]}.Art{art['n']}", sort_order=(chapters.index(chap) + 1) * 1000 + art["n"]))
    return dict(
        framework=dict(key="DSGVO", version="2016/679", name="Verordnung (EU) 2016/679 (DSGVO)",
                       publisher="EU", jurisdiction="EU", license_note="Amtstext, frei verwendbar."),
        requirements=reqs,
    )


# --------------------------------------------------------------------------------------
# Crosswalk ISO/IEC 27001:2022 → IT-Grundschutz (BSI-Zuordnungstabelle, 6. Edition)
# --------------------------------------------------------------------------------------
def extract_crosswalk(bausteine: set, anforderungen: set):
    pdf = CTX / "Zuordnung_ISO_und_IT_Grundschutz_Edit_6.pdf"
    text = " ".join(t for i, t in pages(pdf) if i >= 1)
    text = re.sub(r"ISO 27001 und IT-Grundschutz Seite \d+", " ", text)
    text = re.sub(r"Bundesamt für Sicherheit in der Informationstechnik \(BSI\) Stand 6\. Edition 2023", " ", text)
    text = re.sub(r"ISO/IEC 27001:2022 (?:und IT-Grundschutz )?IT-Grundschutz", " ", text)
    text = re.sub(r"\s+", " ", text)

    anchors = []  # (start, end, kind, payload)
    for m in re.finditer(r"BSI-Standard 200-(\d),? Kapitel ((?:\d+(?:\.\d+)*)(?:(?:, | und )\d+(?:\.\d+)*)*)", text):
        anchors.append((m.start(), m.end(), "std", (m.group(1), m.group(2))))
    for m in re.finditer(r"(?<![\w.])(A\.\d{1,2}\.\d{1,2}|A\.\d{1,2}|(?:[4-9]|10)(?:\.\d+){1,2})(?= [A-Z])", text):
        anchors.append((m.start(), m.end(), "iso", m.group(1)))
    for m in re.finditer(r"(?<![\w.])([A-Z]{3,4}(?:\.\d+)+(?:\.A\d+)?)(?= [A-ZÄÖÜa-z])", text):
        code = m.group(1)
        if code.split(".")[0] in BAUSTEIN_FAMILIES:
            anchors.append((m.start(), m.end(), "bsi", code))
    anchors.sort()
    # überlappende Treffer entfernen (z. B. ISO-Ziffern innerhalb einer BSI-Standard-Kapitelangabe)
    clean, last_end = [], -1
    for a in anchors:
        if a[0] < last_end:
            continue
        clean.append(a); last_end = a[1]

    rows, std_chapters = [], {}
    current = None
    for k, (s, e, kind, payload) in enumerate(clean):
        nxt = clean[k + 1][0] if k + 1 < len(clean) else len(text)
        title = text[e:nxt].strip(" –-")
        if kind == "iso":
            current = payload
            continue
        if current is None:
            continue
        if kind == "bsi":
            if ".A" in payload and payload not in anforderungen:
                continue
            if ".A" not in payload and payload not in bausteine:
                continue
            rows.append(dict(source_framework="ISO27001", source_ref=current, target_framework="BSI_GS",
                             target_ref=payload, relation="partial" if ".A" in payload else "supports"))
        else:
            std, chapters = payload
            for ch in re.split(r", | und ", chapters):
                ref = f"200-{std} Kap. {ch}"
                std_chapters.setdefault(ref, dehyphen(title)[:120] if len(chapters) == len(ch) else "")
                rows.append(dict(source_framework="ISO27001", source_ref=current, target_framework="BSI_STD200",
                                 target_ref=ref, relation="supports"))
    # dedupe
    seen, out = set(), []
    for r in rows:
        key = (r["source_ref"], r["target_framework"], r["target_ref"])
        if key not in seen:
            seen.add(key); out.append(dict(r, source="BSI-Zuordnungstabelle Ed.6"))

    std_reqs = []
    for i, std in enumerate(("1", "2", "3", "4")):
        names = {"1": "Managementsysteme für Informationssicherheit (ISMS)", "2": "IT-Grundschutz-Methodik",
                 "3": "Risikoanalyse auf der Basis von IT-Grundschutz", "4": "Business Continuity Management"}
        std_reqs.append(dict(ref_code=f"200-{std}", title=f"BSI-Standard 200-{std}: {names[std]}", kind="clause",
                             parent_ref=None, path=f"BSI_STD200.S{std}", sort_order=(i + 1) * 1000))
    for n, (ref, title) in enumerate(sorted(std_chapters.items())):
        std = ref[4]
        ch = ref.split("Kap. ")[1]
        std_reqs.append(dict(ref_code=ref, title=title or f"Kapitel {ch}", kind="clause", parent_ref=f"200-{std}",
                             path=f"BSI_STD200.S{std}.K{label(ch)}", sort_order=int(std) * 1000 + n + 1))
    std_fw = dict(
        framework=dict(key="BSI_STD200", version="2017/2023", name="BSI-Standards 200-1 bis 200-4",
                       publisher="BSI", jurisdiction="DE", license_note="Frei verwendbar; nur Kapitelreferenzen."),
        requirements=std_reqs,
    )
    return out, std_fw


def main():
    iso = extract_iso()
    bsi, bausteine, anforderungen = extract_bsi()
    nis2 = extract_nis2()
    dsgvo = extract_dsgvo()
    xw, std = extract_crosswalk(bausteine, anforderungen)

    for name, data in (("iso27001-2022", iso), ("bsi-kompendium-2023", bsi), ("bsi-standards-200", std),
                       ("nis2-2022", nis2), ("dsgvo-2016", dsgvo)):
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        kinds = {}
        for r in data["requirements"]:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        print(f"{name:24s} {len(data['requirements']):5d} requirements  {kinds}")
    (OUT / "crosswalk-iso-bsi-ed6.json").write_text(json.dumps(xw, ensure_ascii=False, indent=1), encoding="utf-8")
    srcs = {r["source_ref"] for r in xw}
    print(f"crosswalk-iso-bsi-ed6     {len(xw):5d} rows  {len(srcs)} ISO refs mapped, "
          f"{sum(1 for r in xw if r['target_framework']=='BSI_GS')} → BSI_GS, "
          f"{sum(1 for r in xw if r['target_framework']=='BSI_STD200')} → BSI_STD200")


if __name__ == "__main__":
    main()
