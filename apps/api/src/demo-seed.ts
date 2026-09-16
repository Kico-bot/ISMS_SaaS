import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AcknowledgementRequestDto,
  type AuthContext,
  CompetenceProfileDto,
  InviteMemberDto,
  KpiDto,
  TimelineEntryDto,
  UpsertTenantRequirementDto,
} from '@isms/shared';
import { sql } from 'drizzle-orm';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import type { AccessClaims } from './kernel/auth/auth.types';
import { AuthService, type Session } from './kernel/auth/auth.service';
import { PermissionCacheService } from './kernel/auth/permission-cache.service';
import { DbService } from './kernel/db/db.service';
import { MembersService } from './kernel/tenancy/members.service';
import { AuditsService } from './modules/audit/audits.service';
import { FindingsService } from './modules/audit/findings.service';
import { KpisService } from './modules/audit/kpis.service';
import { ReviewsService } from './modules/audit/reviews.service';
import { AssetsService } from './modules/assets/assets.service';
import { CatalogService } from './modules/catalog/catalog.service';
import { ContextService } from './modules/context/context.service';
import { PersonsService } from './modules/context/persons.service';
import { CompetenceService } from './modules/competence/competence.service';
import { TrainingsService } from './modules/competence/trainings.service';
import { BiaService } from './modules/continuity/bia.service';
import { PlansService } from './modules/continuity/plans.service';
import { ProcessesService } from './modules/continuity/processes.service';
import { DocumentsService } from './modules/documents/documents.service';
import { EvidenceService } from './modules/files/evidence.service';
import { FilesService } from './modules/files/files.service';
import { IncidentsService } from './modules/incidents/incidents.service';
import { ActionsService } from './modules/improvement/actions.service';
import { MeasuresService } from './modules/measures/measures.service';
import { DpiaService } from './modules/privacy/dpia.service';
import { ProcessingService } from './modules/privacy/processing.service';
import { RisksService } from './modules/risks/risks.service';
import { SoaService } from './modules/soa/soa.service';

/**
 * Demodaten für einen erfundenen Mandanten.
 *
 * Erfunden ist wörtlich gemeint: Nordlicht Energiewerke GmbH gibt es nicht, und sämtliche
 * Personen sind frei erfunden. Ein regionaler Energieversorger ist als Beispiel gewählt, weil
 * darin alle vier Regelwerke zugleich greifen — NIS2 für den Netzbetrieb, DSGVO für Kunden-
 * und Beschäftigtendaten, ISO 27001 als Managementsystem und der IT-Grundschutz als Baukasten.
 *
 * Die Daten entstehen über dieselben Dienste wie im laufenden Betrieb, nicht per INSERT. Damit
 * gelten Referenznummern, Vier-Augen-Prinzip, Prüfungen und Zeilensicherheit genauso wie sonst:
 * Was hier durchläuft, kann die Anwendung auch anzeigen und bearbeiten.
 */

export const TENANT_SLUG = 'nordlicht';
export const DEMO_PASSWORD = 'demo-passwort-2026-nordlicht';

const log = new Logger('DemoSeed');

/** Datum relativ zu heute, als YYYY-MM-DD. */
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
/** Zeitpunkt relativ zu jetzt, als ISO-Zeitstempel. */
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

/**
 * Die Dienste geben den angelegten Datensatz zurück — im Seed ist ein Fehlschlag ein Abbruch,
 * kein Fall für eine Prüfung an jeder Aufrufstelle.
 */

/**
 * Eine erfundene Datei. Ein PDF-Vorspann genügt, damit die Anwendung sie als PDF annimmt —
 * der Inhalt soll nur zeigen, dass Nachweise im Paket wirklich mitgeliefert werden.
 */
function fakePdf(title: string, lines: string[]): Buffer {
  const text = [`%PDF-1.4`, `% ${title}`, '', ...lines, '', '%%EOF'].join('\n');
  return Buffer.from(text, 'utf8');
}

function must<T>(row: T | undefined, what: string): NonNullable<T> {
  if (row === undefined || row === null) throw new Error(`${what} konnte nicht angelegt werden`);
  return row as NonNullable<T>;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Die Demodaten legen Konten mit einem veröffentlichten Kennwort an — nicht in Produktion.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    await seedDemoTenant(app);
  } finally {
    await app.close();
  }
}

interface Cast {
  ctx: AuthContext;
  personId: string;
  session: Session;
}

export async function seedDemoTenant(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
): Promise<void> {
  const dbs = app.get(DbService);

  // Der Wächter gehört hierher, nicht in den CLI-Einstieg: ein zweiter Lauf soll aus jeder
  // Richtung folgenlos bleiben, nicht nur über die Kommandozeile.
  const existing = await dbs.platform(async (tx) =>
    (await tx.execute(sql`SELECT id FROM tenant WHERE slug = ${TENANT_SLUG}`)).rows.at(0),
  );
  if (existing) {
    log.warn(
      `Der Mandant „${TENANT_SLUG}“ existiert bereits — es wird nichts angelegt. ` +
        'Für einen frischen Stand: pnpm db:reset && pnpm db:seed && pnpm db:seed:demo',
    );
    return;
  }

  const auth = app.get(AuthService);
  const jwt = app.get(JwtService);
  const perms = app.get(PermissionCacheService);

  const catalog = app.get(CatalogService);
  const persons = app.get(PersonsService);
  const context = app.get(ContextService);
  const assets = app.get(AssetsService);
  const risks = app.get(RisksService);
  const measures = app.get(MeasuresService);
  const soa = app.get(SoaService);
  const documents = app.get(DocumentsService);
  const competence = app.get(CompetenceService);
  const trainings = app.get(TrainingsService);
  const incidents = app.get(IncidentsService);
  const processes = app.get(ProcessesService);
  const bia = app.get(BiaService);
  const plans = app.get(PlansService);
  const processing = app.get(ProcessingService);
  const dpia = app.get(DpiaService);
  const audits = app.get(AuditsService);
  const findings = app.get(FindingsService);
  const actions = app.get(ActionsService);
  const kpis = app.get(KpisService);
  const reviews = app.get(ReviewsService);
  const files = app.get(FilesService);
  const evidence = app.get(EvidenceService);

  const meta = { ip: '127.0.0.1', userAgent: 'demo-seed' };

  /** Baut den AuthContext genauso auf wie der JwtGuard im laufenden Betrieb. */
  const castOf = async (session: Session): Promise<Cast> => {
    const claims = jwt.verify<AccessClaims>(session.accessToken);
    return {
      session,
      personId: claims.pid!,
      ctx: {
        userId: claims.sub,
        tenantId: claims.tid,
        membershipId: claims.mid,
        personId: claims.pid,
        permissions: await perms.forMembership(claims.mid!, claims.pv),
        isPlatformAdmin: claims.pa,
      },
    };
  };

  const members = app.get(MembersService);
  const invite = async (
    inviter: AuthContext,
    email: string,
    displayName: string,
    roleKeys: string[],
  ): Promise<Cast> => {
    const { inviteToken } = await members.invite(
      inviter.tenantId!,
      inviter.userId,
      InviteMemberDto.parse({ email, displayName, roleKeys }),
    );
    return castOf(await auth.acceptInvite({ token: inviteToken, password: DEMO_PASSWORD }, meta));
  };

  // --- Menschen ---------------------------------------------------------------------------
  log.log('Mandant und Konten …');
  const henrike = await castOf(
    await auth.registerTenant(
      {
        tenantName: 'Nordlicht Energiewerke GmbH',
        tenantSlug: TENANT_SLUG,
        email: 'henrike.sallach@nordlicht.example',
        password: DEMO_PASSWORD,
        displayName: 'Henrike Sallach',
      },
      meta,
    ),
  );
  const tenantId = henrike.ctx.tenantId!;

  const jorin = await invite(henrike.ctx, 'jorin.kessler@nordlicht.example', 'Jorin Kessler', [
    'isms_manager',
  ]);
  const bastian = await invite(henrike.ctx, 'bastian.olwig@nordlicht.example', 'Bastian Olwig', [
    'risk_owner',
  ]);
  const corinna = await invite(henrike.ctx, 'corinna.feldt@nordlicht.example', 'Corinna Feldt', ['auditor']);
  const ilka = await invite(henrike.ctx, 'ilka.norgaard@nordlicht.example', 'Ilka Norgaard', ['dpo']);

  await persons.update(henrike.ctx, henrike.personId, {
    department: 'Informationssicherheit',
    position: 'Leiterin Informationssicherheit (CISO)',
  });
  await persons.update(henrike.ctx, jorin.personId, {
    department: 'Informationssicherheit',
    position: 'Stellvertretung ISMS',
  });
  await persons.update(henrike.ctx, bastian.personId, {
    department: 'IT & OT',
    position: 'Leiter IT-Betrieb',
  });
  await persons.update(henrike.ctx, corinna.personId, {
    department: 'Revision',
    position: 'Interne Auditorin',
  });
  await persons.update(henrike.ctx, ilka.personId, {
    department: 'Recht & Datenschutz',
    position: 'Datenschutzbeauftragte',
  });

  // Beschäftigte ohne Zugang — Verantwortung muss auch ihnen zuweisbar sein.
  const wenzel = must(
    await persons.create(henrike.ctx, {
      name: 'Wenzel Rothmund',
      email: 'wenzel.rothmund@nordlicht.example',
      department: 'Netzbetrieb',
      position: 'Leiter Netzleitstelle',
      isActive: true,
    }),
    'wenzel',
  );
  const marlene = must(
    await persons.create(henrike.ctx, {
      name: 'Marlene Gerst',
      email: 'marlene.gerst@nordlicht.example',
      department: 'Personal',
      position: 'Leiterin Personal',
      isActive: true,
    }),
    'marlene',
  );
  const aurel = must(
    await persons.create(henrike.ctx, {
      name: 'Aurel Timm',
      email: 'aurel.timm@nordlicht.example',
      department: 'Kundenservice',
      position: 'Teamleiter Abrechnung',
      isActive: true,
    }),
    'aurel',
  );
  const gesine = must(
    await persons.create(henrike.ctx, {
      name: 'Gesine Habel',
      email: 'gesine.habel@nordlicht.example',
      department: 'Geschäftsführung',
      position: 'Geschäftsführerin',
      isActive: true,
    }),
    'gesine',
  );

  // --- Regelwerke -------------------------------------------------------------------------
  log.log('Regelwerke aktivieren …');
  for (const frameworkKey of ['NIS2', 'DSGVO', 'BSI_GS']) {
    await catalog.activate(tenantId, { frameworkKey, isPrimary: false });
  }

  /** Anforderungen über ihr Referenzkürzel auffindbar machen. */
  const reqRows = await dbs.tenant(
    tenantId,
    async (tx) =>
      (
        await tx.execute(sql`
        SELECT r.id, r.ref_code AS "refCode", f.key AS framework
        FROM requirement r JOIN framework f ON f.id = r.framework_id`)
      ).rows as { id: string; refCode: string; framework: string }[],
  );
  const reqIndex = new Map(reqRows.map((r) => [`${r.framework} ${r.refCode}`, r.id]));
  const req = (key: string): string | null => reqIndex.get(key) ?? null;

  // --- Kontext der Organisation (Kap. 4) ---------------------------------------------------
  log.log('Kontext, Parteien und Ziele …');
  for (const party of [
    {
      name: 'Bundesnetzagentur',
      category: 'regulator' as const,
      expectations:
        'Einhaltung der Sicherheitsanforderungen für Energienetze, Nachweis im Sicherheitskatalog.',
      addressedVia: 'Jährlicher Nachweis, Auditprogramm, Meldewege nach NIS2.',
      isBinding: true,
      influence: 3,
    },
    {
      name: 'Privatkundinnen und Privatkunden',
      category: 'customer' as const,
      expectations: 'Zuverlässige Versorgung, korrekte Abrechnung, vertraulicher Umgang mit ihren Daten.',
      addressedVia: 'Kundenportal mit MFA, Verarbeitungsverzeichnis, Löschfristen.',
      isBinding: false,
      influence: 3,
    },
    {
      name: 'Beschäftigte',
      category: 'employee' as const,
      expectations: 'Klare Vorgaben, Schulung, Schutz der eigenen Personaldaten.',
      addressedVia: 'Awareness-Programm, Leitlinie, Betriebsvereinbarung.',
      isBinding: false,
      influence: 2,
    },
    {
      name: 'Fernwartungsdienstleister Leittechnik',
      category: 'supplier' as const,
      expectations: 'Planbare Zugänge, schnelle Freigaben.',
      addressedVia: 'Vertragliche Sicherheitsanforderungen, Zugang nur auf Anforderung, Protokollierung.',
      isBinding: true,
      influence: 2,
    },
    {
      name: 'Kommunale Gesellschafter',
      category: 'owner' as const,
      expectations: 'Versorgungssicherheit ohne Schlagzeilen, wirtschaftlicher Mitteleinsatz.',
      addressedVia: 'Managementbewertung, Kennzahlenbericht an die Gesellschafterversammlung.',
      isBinding: false,
      influence: 3,
    },
  ]) {
    await context.createParty(henrike.ctx, party);
  }

  for (const factor of [
    {
      dimension: 'legal' as const,
      title: 'NIS2-Umsetzung verschärft Melde- und Nachweispflichten',
      description:
        'Als Betreiber eines Verteilnetzes fallen wir unter die besonders wichtigen Einrichtungen. Meldefristen von 24 und 72 Stunden sind einzuhalten, die Geschäftsführung haftet persönlich.',
      effect: 'risk' as const,
      relevance: 3,
    },
    {
      dimension: 'technological' as const,
      title: 'Leittechnik mit langen Lebenszyklen',
      description:
        'Fernwirktechnik läuft 15 bis 20 Jahre. Sicherheitsupdates gibt es selten, Kompensation muss über Segmentierung und Überwachung erfolgen.',
      effect: 'risk' as const,
      relevance: 3,
    },
    {
      dimension: 'economic' as const,
      title: 'Fachkräftemangel in der Leittechnik',
      description: 'Zwei von sieben Stellen in der Netzleitstelle sind seit Monaten unbesetzt.',
      effect: 'risk' as const,
      relevance: 2,
    },
    {
      dimension: 'environmental' as const,
      title: 'Hochwasserlage am Umspannwerk Nord',
      description: 'Das Umspannwerk liegt im festgesetzten Überschwemmungsgebiet.',
      effect: 'risk' as const,
      relevance: 2,
    },
    {
      dimension: 'social' as const,
      title: 'Wachsende Erwartung an digitale Selbstbedienung',
      description:
        'Kundinnen und Kunden erwarten Zählerstände und Abschläge online — das erweitert die Angriffsfläche, spart aber Aufwand im Service.',
      effect: 'opportunity' as const,
      relevance: 2,
    },
  ]) {
    await context.createFactor(henrike.ctx, factor);
  }

  await context.createObjective(henrike.ctx, {
    title: 'Klickrate in Phishing-Simulationen unter 5 %',
    description: 'Gemessen je Simulation über alle Beschäftigten mit Postfach.',
    kind: 'operational',
    ownerPersonId: henrike.personId,
    targetValue: '5',
    currentValue: '8',
    unit: '%',
    frequency: 'quartalsweise',
    direction: 'lower_is_better',
    dueDate: day(90),
    requirementIds: [req('ISO27001 A.6.3')].filter(Boolean) as string[],
  });
  await context.createObjective(henrike.ctx, {
    title: 'Wiederanlauf der Netzleitstelle in höchstens 4 Stunden',
    description: 'Nachgewiesen in der jährlichen Notfallübung, nicht nur auf dem Papier.',
    kind: 'strategic',
    ownerPersonId: wenzel.id,
    targetValue: '4',
    currentValue: '6',
    unit: 'Stunden',
    frequency: 'jährlich',
    direction: 'lower_is_better',
    dueDate: day(150),
    requirementIds: [req('ISO27001 A.5.30')].filter(Boolean) as string[],
  });
  await context.createObjective(henrike.ctx, {
    title: 'Patchstand kritischer Systeme mindestens 95 %',
    kind: 'operational',
    ownerPersonId: bastian.personId,
    targetValue: '95',
    currentValue: '91',
    unit: '%',
    frequency: 'monatlich',
    direction: 'higher_is_better',
    dueDate: day(45),
    requirementIds: [req('ISO27001 A.8.8')].filter(Boolean) as string[],
  });

  // --- Assets -----------------------------------------------------------------------------
  log.log('Assets und Risiken …');
  const netzleitsystem = must(
    await assets.create(henrike.ctx, {
      name: 'Netzleitsystem (SCADA)',
      type: 'primary',
      category: 'system',
      classification: 'strictly_confidential',
      confidentiality: 3,
      integrity: 3,
      availability: 3,
      safety: 3,
      hasPii: false,
      ownerPersonId: wenzel.id,
      custodianPersonId: bastian.personId,
      description: 'Führt das Mittel- und Niederspannungsnetz; ohne es ist keine Fernsteuerung möglich.',
      tags: ['OT', 'NIS2'],
      status: 'active',
    }),
    'netzleitsystem',
  );
  const fernwirk = must(
    await assets.create(henrike.ctx, {
      name: 'Fernwirkstrecke Umspannwerk Nord',
      type: 'supporting',
      category: 'network',
      classification: 'confidential',
      confidentiality: 2,
      integrity: 3,
      availability: 3,
      safety: 2,
      hasPii: false,
      ownerPersonId: wenzel.id,
      tags: ['OT'],
      status: 'active',
    }),
    'fernwirk',
  );
  const kundenportal = must(
    await assets.create(henrike.ctx, {
      name: 'Kundenportal',
      type: 'primary',
      category: 'application',
      classification: 'confidential',
      confidentiality: 3,
      integrity: 2,
      availability: 2,
      safety: 1,
      hasPii: true,
      ownerPersonId: aurel.id,
      custodianPersonId: bastian.personId,
      vendor: 'Nordlicht IT',
      tags: ['Kundendaten'],
      status: 'active',
    }),
    'kundenportal',
  );
  const abrechnung = must(
    await assets.create(henrike.ctx, {
      name: 'Abrechnungssystem',
      type: 'primary',
      category: 'application',
      classification: 'confidential',
      confidentiality: 3,
      integrity: 3,
      availability: 2,
      safety: 1,
      hasPii: true,
      ownerPersonId: aurel.id,
      tags: ['Kundendaten'],
      status: 'active',
    }),
    'abrechnung',
  );
  const verzeichnisdienst = must(
    await assets.create(henrike.ctx, {
      name: 'Verzeichnisdienst (Active Directory)',
      type: 'supporting',
      category: 'system',
      classification: 'confidential',
      confidentiality: 3,
      integrity: 3,
      availability: 3,
      safety: 1,
      hasPii: true,
      ownerPersonId: bastian.personId,
      tags: ['Identität'],
      status: 'active',
    }),
    'verzeichnisdienst',
  );
  const personaldaten = must(
    await assets.create(henrike.ctx, {
      name: 'Personalakten (digital)',
      type: 'primary',
      category: 'information',
      classification: 'strictly_confidential',
      confidentiality: 3,
      integrity: 2,
      availability: 1,
      safety: 1,
      hasPii: true,
      ownerPersonId: marlene.id,
      tags: ['Personaldaten'],
      status: 'active',
    }),
    'personaldaten',
  );
  await assets.link(henrike.ctx, netzleitsystem.id, fernwirk.id, 'depends_on');
  await assets.link(henrike.ctx, kundenportal.id, abrechnung.id, 'depends_on');

  // --- Risiken ----------------------------------------------------------------------------
  const ransomware = must(
    await risks.create(henrike.ctx, {
      title: 'Ransomware erreicht über das Büronetz die Leittechnik',
      description:
        'Ein verschlüsselter Sprung vom Büro- ins Leitnetz würde die Fernsteuerung des Verteilnetzes lahmlegen. Die Netzführung müsste auf Handbetrieb umstellen.',
      kind: 'risk',
      source: 'manual',
      category: 'Cyberangriff',
      ownerPersonId: bastian.personId,
      status: 'assessed',
      treatment: 'mitigate',
      assetIds: [netzleitsystem.id, verzeichnisdienst.id],
      nextReviewAt: day(60),
    }),
    'ransomware',
  );
  await risks.assess(henrike.ctx, ransomware.id, {
    stage: 'inherent',
    likelihood: 4,
    impact: 5,
    note: 'Flache Netzstruktur, gemeinsame Administrationskonten.',
  });
  await risks.assess(henrike.ctx, ransomware.id, {
    stage: 'residual',
    likelihood: 2,
    impact: 4,
    note: 'Nach Segmentierung und MFA; die Auswirkung bleibt hoch, weil die Netzführung betroffen wäre.',
  });
  await risks.quantify(henrike.ctx, ransomware.id, {
    aleFrequency: 0.2,
    lossMin: 150_000,
    lossLikely: 600_000,
    lossMax: 2_400_000,
  });

  const fernwirkausfall = must(
    await risks.create(henrike.ctx, {
      title: 'Ausfall der Fernwirkstrecke zum Umspannwerk Nord',
      description: 'Einzige Anbindung ohne redundanten Weg; bei Ausfall nur noch Vor-Ort-Schaltung.',
      kind: 'risk',
      source: 'manual',
      category: 'Verfügbarkeit',
      ownerPersonId: wenzel.id,
      status: 'assessed',
      treatment: 'mitigate',
      assetIds: [fernwirk.id],
      nextReviewAt: day(-5),
    }),
    'fernwirkausfall',
  );
  await risks.assess(henrike.ctx, fernwirkausfall.id, { stage: 'inherent', likelihood: 3, impact: 4 });
  await risks.assess(henrike.ctx, fernwirkausfall.id, { stage: 'residual', likelihood: 2, impact: 3 });

  const kundendaten = must(
    await risks.create(henrike.ctx, {
      title: 'Unbefugter Zugriff auf Kundenstammdaten im Portal',
      description: 'Wiederverwendete Kennwörter und fehlende zweite Stufe im Kundenportal.',
      kind: 'risk',
      source: 'manual',
      category: 'Vertraulichkeit',
      ownerPersonId: aurel.id,
      status: 'treated',
      treatment: 'mitigate',
      assetIds: [kundenportal.id, abrechnung.id],
      nextReviewAt: day(120),
    }),
    'kundendaten',
  );
  await risks.assess(henrike.ctx, kundendaten.id, { stage: 'inherent', likelihood: 3, impact: 5 });
  await risks.assess(henrike.ctx, kundendaten.id, { stage: 'residual', likelihood: 2, impact: 4 });

  const fernwartung = must(
    await risks.create(henrike.ctx, {
      title: 'Dauerhafter Fernwartungszugang des Leittechnik-Herstellers',
      description:
        'Der Hersteller hält einen stehenden Zugang. Eine Umstellung auf Zugang-auf-Anforderung ist vertraglich erst zur Verlängerung möglich.',
      kind: 'risk',
      source: 'manual',
      category: 'Lieferkette',
      ownerPersonId: bastian.personId,
      status: 'accepted',
      treatment: 'accept',
      assetIds: [netzleitsystem.id],
      nextReviewAt: day(200),
    }),
    'fernwartung',
  );
  await risks.assess(henrike.ctx, fernwartung.id, { stage: 'inherent', likelihood: 3, impact: 4 });
  await risks.assess(henrike.ctx, fernwartung.id, { stage: 'residual', likelihood: 3, impact: 3 });
  // Vier-Augen-Prinzip: akzeptiert wird von der ISMS-Leitung, nicht vom Risk-Owner.
  await risks.accept(henrike.ctx, fernwartung.id, {
    validUntil: day(45),
    rationale:
      'Befristet akzeptiert bis zur Vertragsverlängerung im nächsten Quartal. Kompensierend: Protokollierung aller Sitzungen und Freigabe durch die Netzleitstelle.',
  });

  const chance = must(
    await risks.create(henrike.ctx, {
      title: 'Zentrale Protokollauswertung ermöglicht schnellere Erkennung',
      description:
        'Mit einer gemeinsamen Auswertung von OT- und IT-Protokollen sinkt die Erkennungszeit erheblich.',
      kind: 'opportunity',
      source: 'manual',
      category: 'Detektion',
      ownerPersonId: bastian.personId,
      status: 'identified',
      assetIds: [netzleitsystem.id],
    }),
    'chance',
  );
  await risks.assess(henrike.ctx, chance.id, { stage: 'inherent', likelihood: 3, impact: 4 });

  // --- Maßnahmen und das Mehrfach-Mapping --------------------------------------------------
  log.log('Maßnahmen und Normzuordnung …');
  const mfa = must(
    await measures.create(henrike.ctx, {
      title: 'Mehrfaktor-Anmeldung für alle administrativen Zugänge',
      description:
        'Hardware-Token für Administration und Fernzugriff, App-basierte zweite Stufe für alle übrigen Konten.',
      domain: 'technological',
      ownerPersonId: bastian.personId,
      status: 'implemented',
      maturity: 4,
      effortDays: 25,
      costEur: 18_000,
    }),
    'mfa',
  );
  const segmentierung = must(
    await measures.create(henrike.ctx, {
      title: 'Netzsegmentierung zwischen Büro-IT und Leittechnik',
      description:
        'Eigene Zone für die Leittechnik, Übergänge nur über kontrollierte Datendioden und Sprungserver.',
      domain: 'technological',
      ownerPersonId: bastian.personId,
      status: 'in_progress',
      maturity: 2,
      dueDate: day(75),
      effortDays: 60,
      costEur: 95_000,
    }),
    'segmentierung',
  );
  const backup = must(
    await measures.create(henrike.ctx, {
      title: 'Sicherungskonzept 3-2-1 mit Offline-Kopie',
      description: 'Drei Kopien, zwei Medien, eine außer Haus und offline — wöchentlicher Rückspieltest.',
      domain: 'technological',
      ownerPersonId: bastian.personId,
      status: 'implemented',
      maturity: 4,
    }),
    'backup',
  );
  const awareness = must(
    await measures.create(henrike.ctx, {
      title: 'Awareness-Programm mit Phishing-Simulationen',
      domain: 'people',
      ownerPersonId: henrike.personId,
      status: 'implemented',
      maturity: 3,
    }),
    'awareness',
  );
  const protokollierung = must(
    await measures.create(henrike.ctx, {
      title: 'Zentrale Protokollierung und Auswertung (IT und OT)',
      description:
        'Alle sicherheitsrelevanten Ereignisse laufen in einer Auswertung zusammen, Aufbewahrung 12 Monate.',
      domain: 'technological',
      ownerPersonId: bastian.personId,
      status: 'in_progress',
      maturity: 2,
      dueDate: day(-12),
    }),
    'protokollierung',
  );
  const lieferanten = must(
    await measures.create(henrike.ctx, {
      title: 'Sicherheitsanforderungen an Fernwartungsdienstleister',
      description: 'Zugang nur auf Anforderung, Sitzungsaufzeichnung, jährlicher Nachweis.',
      domain: 'organizational',
      ownerPersonId: henrike.personId,
      status: 'planned',
      dueDate: day(120),
    }),
    'lieferanten',
  );
  const notfallhandbuch = must(
    await measures.create(henrike.ctx, {
      title: 'Notfallhandbuch Netzleitstelle',
      domain: 'organizational',
      ownerPersonId: wenzel.id,
      status: 'implemented',
      maturity: 3,
    }),
    'notfallhandbuch',
  );
  const meldeprozess = must(
    await measures.create(henrike.ctx, {
      title: 'Melde- und Eskalationsprozess für erhebliche Vorfälle',
      description:
        'Einheitlicher Weg für NIS2 und DSGVO: Einstufung binnen zwei Stunden, Frühwarnung binnen 24, Meldung binnen 72 Stunden.',
      domain: 'organizational',
      ownerPersonId: henrike.personId,
      status: 'implemented',
      maturity: 3,
    }),
    'meldeprozess',
  );
  const verschluesselung = must(
    await measures.create(henrike.ctx, {
      title: 'Verschlüsselung von Datenträgern und Sicherungen',
      domain: 'technological',
      ownerPersonId: bastian.personId,
      status: 'verified',
      maturity: 5,
    }),
    'verschluesselung',
  );

  /**
   * Der Kern des Ganzen: eine Maßnahme zahlt auf die Anforderungen mehrerer Regelwerke
   * gleichzeitig ein. Ohne das müsste dieselbe Umsetzung viermal dokumentiert werden.
   */
  const mapping: [string, string[]][] = [
    [
      mfa.id,
      [
        'ISO27001 A.5.17',
        'ISO27001 A.8.5',
        'ISO27001 A.5.15',
        'NIS2 Art. 21',
        'BSI_GS ORP.4.A13',
        'BSI_GS ORP.4.A16',
      ],
    ],
    [
      segmentierung.id,
      ['ISO27001 A.8.22', 'ISO27001 A.8.20', 'NIS2 Art. 21', 'BSI_GS NET.1.1.A22', 'BSI_GS NET.1.1.A23'],
    ],
    [backup.id, ['ISO27001 A.8.13', 'NIS2 Art. 21', 'BSI_GS CON.3.A5', 'BSI_GS CON.3.A15']],
    [awareness.id, ['ISO27001 A.6.3', 'ISO27001 7.3', 'NIS2 Art. 20', 'BSI_GS ORP.3.A4', 'BSI_GS ORP.3.A6']],
    [
      protokollierung.id,
      ['ISO27001 A.8.15', 'ISO27001 A.8.16', 'NIS2 Art. 21', 'BSI_GS OPS.1.1.5.A6', 'BSI_GS OPS.1.1.5.A9'],
    ],
    [lieferanten.id, ['ISO27001 A.5.19', 'ISO27001 A.5.21', 'NIS2 Art. 21', 'BSI_GS OPS.2.3.A1']],
    [
      notfallhandbuch.id,
      ['ISO27001 A.5.29', 'ISO27001 A.5.30', 'NIS2 Art. 21', 'BSI_GS DER.4.A1', 'BSI_GS DER.4.A10'],
    ],
    [verschluesselung.id, ['ISO27001 A.8.24', 'DSGVO Art. 32', 'BSI_GS CON.1.A1', 'BSI_GS CON.1.A4']],
    [
      meldeprozess.id,
      [
        'ISO27001 A.5.24',
        'ISO27001 A.5.25',
        'NIS2 Art. 23',
        'DSGVO Art. 33',
        'BSI_GS DER.2.1.A1',
        'BSI_GS DER.2.1.A3',
      ],
    ],
  ];
  for (const [measureId, refs] of mapping) {
    for (const ref of refs) {
      const requirementId = req(ref);
      if (!requirementId) continue;
      await measures.mapRequirement(henrike.ctx, measureId, {
        requirementId,
        coverage: 'full',
        fromCrosswalk: false,
      });
    }
  }

  await risks.linkMeasure(henrike.ctx, ransomware.id, { measureId: segmentierung.id, effect: 'both' });
  await risks.linkMeasure(henrike.ctx, ransomware.id, { measureId: backup.id, effect: 'reduces_impact' });
  await risks.linkMeasure(henrike.ctx, ransomware.id, { measureId: mfa.id, effect: 'reduces_likelihood' });
  await risks.linkMeasure(henrike.ctx, kundendaten.id, { measureId: mfa.id, effect: 'reduces_likelihood' });
  await risks.linkMeasure(henrike.ctx, fernwartung.id, { measureId: lieferanten.id, effect: 'both' });
  await risks.linkMeasure(henrike.ctx, chance.id, { measureId: protokollierung.id, effect: 'both' });

  // --- Anwendbarkeitserklärung -------------------------------------------------------------
  const soaEntries: [
    string,
    {
      applicability?: 'applicable' | 'not_applicable';
      justification?: string;
      maturity?: number;
      targetMaturity?: number;
      notes?: string;
    },
  ][] = [
    ['ISO27001 A.5.17', { maturity: 4, targetMaturity: 5 }],
    [
      'ISO27001 A.8.22',
      { maturity: 2, targetMaturity: 4, notes: 'Umsetzung läuft, Abschluss im laufenden Quartal.' },
    ],
    ['ISO27001 A.8.13', { maturity: 4, targetMaturity: 4 }],
    ['ISO27001 A.6.3', { maturity: 3, targetMaturity: 4 }],
    ['ISO27001 A.8.15', { maturity: 2, targetMaturity: 4 }],
    ['ISO27001 A.5.29', { maturity: 3, targetMaturity: 4 }],
    ['ISO27001 A.8.24', { maturity: 5, targetMaturity: 5 }],
    [
      'ISO27001 A.7.9',
      {
        applicability: 'not_applicable',
        justification:
          'Es befinden sich keine Unternehmenswerte außerhalb der Betriebsgelände; mobile Arbeit erfolgt ausschließlich über virtuelle Arbeitsplätze ohne lokale Datenhaltung.',
      },
    ],
    [
      'ISO27001 A.7.13',
      {
        applicability: 'not_applicable',
        justification:
          'Instandhaltung der Betriebsmittel ist vollständig an den Netzservice ausgelagert und vertraglich geregelt.',
      },
    ],
  ];
  for (const [ref, patch] of soaEntries) {
    const requirementId = req(ref);
    if (requirementId) {
      await soa.upsert(tenantId, henrike.ctx.userId, requirementId, UpsertTenantRequirementDto.parse(patch));
    }
  }

  // --- Dokumentenlenkung (Kap. 7.5) --------------------------------------------------------
  log.log('Dokumente, Freigaben und Lesebestätigungen …');
  const leitlinie = must(
    await documents.create(henrike.ctx, {
      key: 'RL-01',
      title: 'Leitlinie zur Informationssicherheit',
      kind: 'policy',
      classification: 'internal',
      ownerPersonId: henrike.personId,
      reviewIntervalMonths: 12,
    }),
    'leitlinie',
  );
  const leitlinieV1 = must(
    await documents.addVersion(henrike.ctx, leitlinie.id, {
      versionLabel: '1.0',
      changeNote: 'Erstfassung, beschlossen durch die Geschäftsführung.',
      contentMd:
        '# Leitlinie zur Informationssicherheit\n\nDie Nordlicht Energiewerke GmbH betreibt ein Verteilnetz. ' +
        'Informationssicherheit ist für uns kein Selbstzweck, sondern Voraussetzung der Versorgungssicherheit.\n\n' +
        '## Geltungsbereich\n\nDie Leitlinie gilt für alle Beschäftigten, alle Standorte und alle Systeme, ' +
        'die der Netzführung, der Abrechnung oder der Kundenbetreuung dienen.\n\n' +
        '## Grundsätze\n\n- Die Netzführung hat Vorrang vor allen anderen Belangen.\n' +
        '- Zugriffe werden auf das Notwendige begrenzt und nachvollziehbar protokolliert.\n' +
        '- Sicherheitsvorfälle werden gemeldet, nicht verschwiegen — Meldende haben nichts zu befürchten.',
    }),
    'leitlinieV1',
  );
  await documents.submitForReview(henrike.ctx, leitlinie.id, leitlinieV1.id);
  // Vier-Augen-Prinzip: die Autorin darf ihre eigene Fassung nicht freigeben.
  await documents.approve(jorin.ctx, leitlinie.id, leitlinieV1.id);
  await documents.linkRequirement(henrike.ctx, leitlinie.id, req('ISO27001 5.2') ?? req('ISO27001 A.5.1')!);
  await documents.requestAcknowledgement(
    henrike.ctx,
    leitlinie.id,
    AcknowledgementRequestDto.parse({
      subject: 'Bitte bestätigen Sie die Kenntnisnahme der Sicherheitsleitlinie',
      message: 'Die Leitlinie wurde überarbeitet und von der Geschäftsführung beschlossen.',
      dueAt: day(10),
    }),
  );

  const kryptorichtlinie = must(
    await documents.create(henrike.ctx, {
      key: 'RL-02',
      title: 'Richtlinie zum Einsatz kryptografischer Verfahren',
      kind: 'policy',
      classification: 'internal',
      ownerPersonId: bastian.personId,
      reviewIntervalMonths: 24,
    }),
    'kryptorichtlinie',
  );
  const kryptoV1 = must(
    await documents.addVersion(henrike.ctx, kryptorichtlinie.id, {
      versionLabel: '1.0',
      contentMd:
        '# Kryptografische Verfahren\n\nZulässig sind ausschließlich Verfahren, die der Technischen Richtlinie ' +
        'TR-02102 des BSI entsprechen. Schlüssel werden im Hardware-Sicherheitsmodul erzeugt und verwaltet.',
    }),
    'kryptoV1',
  );
  await documents.submitForReview(henrike.ctx, kryptorichtlinie.id, kryptoV1.id);
  await documents.approve(jorin.ctx, kryptorichtlinie.id, kryptoV1.id);

  const vorfallVA = must(
    await documents.create(henrike.ctx, {
      key: 'VA-01',
      title: 'Verfahrensanweisung Umgang mit Sicherheitsvorfällen',
      kind: 'procedure',
      classification: 'internal',
      ownerPersonId: henrike.personId,
      reviewIntervalMonths: 12,
    }),
    'vorfallVA',
  );
  await documents.addVersion(henrike.ctx, vorfallVA.id, {
    versionLabel: '0.9',
    changeNote: 'Entwurf zur Abstimmung mit der Netzleitstelle — NIS2-Meldefristen ergänzt.',
    contentMd:
      '# Umgang mit Sicherheitsvorfällen\n\nJeder Verdacht wird unverzüglich an die Netzleitstelle gemeldet. ' +
      'Die ISMS-Leitung entscheidet binnen zwei Stunden über die Einstufung als erheblicher Vorfall nach NIS2.',
  });

  // --- Kompetenz und Awareness (Kap. 7.2, 7.3) ---------------------------------------------
  log.log('Kompetenzprofile und Schulungen …');
  const skillOt = must(
    await competence.createSkill(henrike.ctx, {
      name: 'OT-Sicherheit / Leittechnik',
      description: 'Sicherheit von Fernwirk- und Leitsystemen, Segmentierung, sichere Fernwartung.',
    }),
    'skillOt',
  );
  const skillAudit = must(
    await competence.createSkill(henrike.ctx, {
      name: 'Auditmethodik nach ISO 19011',
      description: 'Planung, Durchführung und Berichterstattung interner Audits.',
    }),
    'skillAudit',
  );
  const skillDatenschutz = must(
    await competence.createSkill(henrike.ctx, {
      name: 'Datenschutzrecht (DSGVO)',
      description: 'Rechtsgrundlagen, Betroffenenrechte, Datenschutz-Folgenabschätzung.',
    }),
    'skillDatenschutz',
  );
  const skillIr = must(
    await competence.createSkill(henrike.ctx, {
      name: 'Incident Response',
      description: 'Erkennung, Eindämmung, Wiederherstellung und Nachbereitung von Vorfällen.',
    }),
    'skillIr',
  );
  const skillKrise = must(
    await competence.createSkill(henrike.ctx, {
      name: 'Krisenkommunikation',
      description: 'Kommunikation gegenüber Behörden, Presse und Kundschaft im Ereignisfall.',
    }),
    'skillKrise',
  );

  const profilIsms = must(
    await competence.createProfile(
      henrike.ctx,
      CompetenceProfileDto.parse({
        name: 'ISMS-Leitung',
        description: 'Verantwortet Aufbau, Betrieb und Verbesserung des Managementsystems.',
        requirements: [
          { skillId: skillAudit.id, minLevel: 4 },
          { skillId: skillDatenschutz.id, minLevel: 3 },
          { skillId: skillKrise.id, minLevel: 4 },
        ],
      }),
    ),
    'profilIsms',
  );
  const profilOt = must(
    await competence.createProfile(
      henrike.ctx,
      CompetenceProfileDto.parse({
        name: 'OT-Administration',
        description: 'Betreut Leittechnik und Fernwirkstrecken.',
        requirements: [
          { skillId: skillOt.id, minLevel: 4 },
          { skillId: skillIr.id, minLevel: 3 },
        ],
      }),
    ),
    'profilOt',
  );

  await competence.assignProfiles(henrike.ctx, henrike.personId, [profilIsms.id]);
  await competence.assignProfiles(henrike.ctx, bastian.personId, [profilOt.id]);
  await competence.assignProfiles(henrike.ctx, wenzel.id, [profilOt.id]);

  await competence.setPersonSkill(henrike.ctx, henrike.personId, {
    skillId: skillAudit.id,
    level: 4,
    evidenceNote: 'Lead-Auditor-Zertifikat ISO 27001',
    validUntil: day(400),
  });
  await competence.setPersonSkill(henrike.ctx, henrike.personId, {
    skillId: skillKrise.id,
    level: 3,
    evidenceNote: 'Seminar Krisenkommunikation, zwei Übungen begleitet',
  });
  await competence.setPersonSkill(henrike.ctx, henrike.personId, {
    skillId: skillDatenschutz.id,
    level: 3,
    evidenceNote: 'Fachkundenachweis',
    // Abgelaufen — genau das soll das Register sichtbar machen.
    validUntil: day(-40),
  });
  await competence.setPersonSkill(henrike.ctx, bastian.personId, {
    skillId: skillOt.id,
    level: 3,
    evidenceNote: 'Herstellerschulung Leittechnik',
  });
  await competence.setPersonSkill(henrike.ctx, bastian.personId, { skillId: skillIr.id, level: 3 });
  await competence.setPersonSkill(henrike.ctx, wenzel.id, { skillId: skillOt.id, level: 4 });
  await competence.setPersonSkill(henrike.ctx, corinna.personId, {
    skillId: skillAudit.id,
    level: 4,
    evidenceNote: 'Interne Auditorin, jährliche Auffrischung',
    validUntil: day(300),
  });
  await competence.setPersonSkill(henrike.ctx, ilka.personId, {
    skillId: skillDatenschutz.id,
    level: 5,
    evidenceNote: 'Fachkunde nach Art. 37 Abs. 5 DSGVO',
    validUntil: day(500),
  });

  const awarenessSchulung = must(
    await trainings.create(henrike.ctx, {
      title: 'Awareness-Basisschulung Informationssicherheit',
      kind: 'awareness',
      description: 'Grundlagen für alle Beschäftigten: Umgang mit E-Mail, Passwörtern und Vorfällen.',
      isActive: true,
    }),
    'awarenessSchulung',
  );
  await trainings.assign(henrike.ctx, awarenessSchulung.id, { personIds: [], dueAt: day(21) });
  for (const p of [henrike.personId, bastian.personId, wenzel.id, aurel.id]) {
    await trainings.complete(henrike.ctx, awarenessSchulung.id, { personId: p, score: 90 });
  }

  const phishing = must(
    await trainings.create(henrike.ctx, {
      title: 'Phishing-Simulation Quartal 3',
      kind: 'phishing',
      isActive: true,
    }),
    'phishing',
  );
  await trainings.assign(henrike.ctx, phishing.id, { personIds: [], dueAt: day(-6) });
  await trainings.complete(henrike.ctx, phishing.id, { personId: henrike.personId, score: 100 });
  await trainings.complete(henrike.ctx, phishing.id, { personId: bastian.personId, score: 100 });

  const nis2Schulung = must(
    await trainings.create(henrike.ctx, {
      title: 'NIS2-Leitungsschulung für die Geschäftsführung',
      kind: 'nis2_management',
      description: 'Pflichten der Leitung nach Art. 20 NIS2, einschließlich der persönlichen Verantwortung.',
      isActive: true,
    }),
    'nis2Schulung',
  );
  await trainings.assign(henrike.ctx, nis2Schulung.id, { personIds: [gesine.id], dueAt: day(30) });

  // --- Sicherheitsvorfälle ------------------------------------------------------------------
  log.log('Vorfälle, Meldefristen und Geschäftsfortführung …');
  const phishingWelle = must(
    await incidents.create(henrike.ctx, {
      title: 'Phishing-Welle an die Abrechnung',
      description:
        'Gefälschte Lieferantenrechnungen mit Makro-Anhang an elf Postfächer. Zwei Anhänge wurden geöffnet, keine Ausführung.',
      category: 'phishing',
      severity: 'medium',
      detectedAt: at(200),
      handlerPersonId: bastian.personId,
      source: 'manual',
      assetIds: [abrechnung.id],
    }),
    'phishingWelle',
  );
  await incidents.addTimelineEntry(
    henrike.ctx,
    phishingWelle.id,
    TimelineEntryDto.parse({
      kind: 'note',
      text: 'Absenderdomäne gesperrt, betroffene Postfächer geprüft, Beschäftigte informiert.',
      at: at(196),
    }),
  );
  await incidents.update(henrike.ctx, phishingWelle.id, { status: 'resolved' });

  const netzausfall = must(
    await incidents.create(henrike.ctx, {
      title: 'Ausfall der Fernwirkstrecke nach Stromausfall im Umspannwerk Nord',
      description:
        'Die Fernwirkstrecke war 3 Stunden 40 Minuten nicht erreichbar. Die Netzführung erfolgte in dieser Zeit über Vor-Ort-Schaltung.',
      category: 'availability',
      severity: 'high',
      detectedAt: at(30),
      handlerPersonId: wenzel.id,
      source: 'manual',
      assetIds: [fernwirk.id, netzleitsystem.id],
    }),
    'netzausfall',
  );
  // Erheblich nach NIS2 — das setzt die Fristen für Frühwarnung, Meldung und Abschlussbericht.
  await incidents.markSignificant(henrike.ctx, netzausfall.id, { knownAt: at(28), crossBorder: false });
  await incidents.addTimelineEntry(
    henrike.ctx,
    netzausfall.id,
    TimelineEntryDto.parse({
      kind: 'note',
      text: 'Frühwarnung an das BSI abgesetzt, Aktenzeichen liegt der Netzleitstelle vor.',
      at: at(26),
    }),
  );
  await incidents.update(henrike.ctx, netzausfall.id, { status: 'contained' });

  const fehlversand = must(
    await incidents.create(ilka.ctx, {
      title: 'Fehlversand einer Sammelrechnung mit Kundendaten',
      description:
        'Eine Sammelrechnung mit Namen, Anschriften und Verbrauchsdaten von 34 Haushalten ging an einen falschen Verteiler.',
      category: 'data_loss',
      severity: 'medium',
      detectedAt: at(60),
      handlerPersonId: ilka.personId,
      source: 'manual',
      assetIds: [abrechnung.id],
    }),
    'fehlversand',
  );
  // Bestätigte Datenpanne — startet die 72-Stunden-Frist nach Art. 33 DSGVO.
  await incidents.confirmBreach(ilka.ctx, fehlversand.id, {
    confirmedAt: at(58),
    affectedPersons: 34,
    highRiskForIndividuals: false,
    processingActivityIds: [],
  });

  // --- Geschäftsfortführung (A.5.29 / A.5.30) ----------------------------------------------
  const netzfuehrung = must(
    await processes.create(henrike.ctx, {
      name: 'Netzführung und Störungsbeseitigung',
      department: 'Netzbetrieb',
      description: 'Überwachung und Schaltung des Verteilnetzes, Entstörung rund um die Uhr.',
      ownerPersonId: wenzel.id,
      tier: 1,
    }),
    'netzfuehrung',
  );
  const stoerungsannahme = must(
    await processes.create(henrike.ctx, {
      name: 'Störungsannahme und Kundenkommunikation',
      department: 'Kundenservice',
      ownerPersonId: aurel.id,
      tier: 2,
    }),
    'stoerungsannahme',
  );
  await processes.create(henrike.ctx, {
    name: 'Verbrauchsabrechnung',
    department: 'Kundenservice',
    ownerPersonId: aurel.id,
    tier: 3,
  });

  await bia.upsert(henrike.ctx, netzfuehrung.id, {
    mtpdHours: 8,
    rtoHours: 4,
    rpoHours: 1,
    mbco: 'Handbetrieb der wichtigsten Schaltanlagen durch die Bereitschaft; Störungsannahme über die Leitstelle des Nachbarnetzbetreibers.',
  });
  for (const impact of [
    // Ab 8 Stunden kritisch — passend zu MTPD 8 h und RTO 4 h. Die Analyse prüft das.
    { dimension: 'operational' as const, horizon: '2h' as const, score: 2 },
    { dimension: 'operational' as const, horizon: '8h' as const, score: 4 },
    { dimension: 'financial' as const, horizon: '8h' as const, score: 3 },
    { dimension: 'reputation' as const, horizon: '8h' as const, score: 3 },
    { dimension: 'legal' as const, horizon: '8h' as const, score: 3 },
    { dimension: 'operational' as const, horizon: '24h' as const, score: 4 },
    { dimension: 'financial' as const, horizon: '24h' as const, score: 4 },
    { dimension: 'reputation' as const, horizon: '24h' as const, score: 4 },
    { dimension: 'legal' as const, horizon: '24h' as const, score: 4 },
  ]) {
    await bia.setImpact(henrike.ctx, netzfuehrung.id, impact);
  }
  await bia.setResource(henrike.ctx, netzfuehrung.id, { assetId: netzleitsystem.id, criticality: 1 });
  await bia.setResource(henrike.ctx, netzfuehrung.id, { assetId: fernwirk.id, criticality: 1 });
  // Vier-Augen-Prinzip: freigegeben wird nie durch die Prozessverantwortung.
  await bia.approve(henrike.ctx, netzfuehrung.id);

  await bia.upsert(henrike.ctx, stoerungsannahme.id, { mtpdHours: 24, rtoHours: 8, rpoHours: 4 });
  await bia.setImpact(henrike.ctx, stoerungsannahme.id, {
    dimension: 'reputation',
    horizon: '8h',
    score: 3,
  });

  const notfallplan = must(
    await plans.create(henrike.ctx, netzfuehrung.id, {
      title: 'Notfallplan Ausfall Netzleitsystem',
      activationCriteria:
        'Das Netzleitsystem ist länger als 30 Minuten nicht bedienbar oder zeigt nachweislich falsche Zustände an.',
      strategy:
        'Umschaltung auf den Ersatzleitstand im Betriebsgebäude Süd, Handbetrieb der Schaltanlagen durch die Bereitschaft, Rückfall auf Papierlaufplan.',
      testIntervalMonths: 12,
    }),
    'notfallplan',
  );
  for (const step of [
    {
      seq: 1,
      phase: 'Sofortmaßnahmen',
      title: 'Lage feststellen und Bereitschaft alarmieren',
      instruction: 'Netzführung prüft Erreichbarkeit, alarmiert die Rufbereitschaft und die ISMS-Leitung.',
      responsiblePersonId: wenzel.id,
    },
    {
      seq: 2,
      phase: 'Sofortmaßnahmen',
      title: 'Ersatzleitstand in Betrieb nehmen',
      instruction: 'Ersatzleitstand hochfahren, letzte gesicherte Netztopologie einspielen.',
      responsiblePersonId: bastian.personId,
    },
    {
      seq: 3,
      phase: 'Kommunikation',
      title: 'Behörden und Kundschaft informieren',
      instruction: 'Meldung nach NIS2 prüfen, Störungsmeldung auf der Webseite veröffentlichen.',
      responsiblePersonId: henrike.personId,
    },
    {
      seq: 4,
      phase: 'Wiederanlauf',
      title: 'Rückkehr in den Regelbetrieb',
      instruction: 'Integrität der Netztopologie prüfen, danach schrittweise zurückschalten.',
      responsiblePersonId: wenzel.id,
    },
  ]) {
    await plans.setStep(henrike.ctx, notfallplan.id, step);
  }
  // Ein Plan wird erst nach der ersten Übung aktiv — deshalb die Übung zuerst.
  await plans.recordExercise(henrike.ctx, notfallplan.id, {
    heldAt: day(-120),
    kind: 'tabletop',
    result: 'Wiederanlauf in 6 Stunden erreicht — das Ziel von 4 Stunden wurde verfehlt.',
    lessonsLearned:
      'Die Topologiesicherung lag nur auf dem Netzlaufwerk und war im Notfall nicht erreichbar. Offline-Kopie wurde eingerichtet.',
    nextInMonths: 12,
  });
  await plans.update(henrike.ctx, notfallplan.id, { status: 'active' });

  // --- Datenschutz (Art. 30, 32, 35) -------------------------------------------------------
  log.log('Verarbeitungsverzeichnis und Folgenabschätzung …');
  const vvtAbrechnung = must(
    await processing.create(ilka.ctx, {
      name: 'Verbrauchsabrechnung und Zahlungsverkehr',
      purpose: 'Abrechnung der gelieferten Energie, Einzug der Abschläge, Forderungsmanagement.',
      role: 'controller',
      legalBasis: 'art6_1b',
      legalBasisNote: 'Erfüllung des Energielieferungsvertrags.',
      dataSubjectCategories: ['Privatkundschaft', 'Gewerbekundschaft'],
      dataCategories: ['Stammdaten', 'Zählerstände', 'Bankverbindung', 'Zahlungshistorie'],
      specialCategories: false,
      recipients: ['Abrechnungsdienstleister', 'Hausbank', 'Inkassodienstleister'],
      thirdCountryTransfer: false,
      retention: 'Zehn Jahre nach Vertragsende gemäß § 147 AO.',
      dpiaRequired: false,
      ownerPersonId: aurel.id,
    }),
    'vvtAbrechnung',
  );
  const vvtPersonal = must(
    await processing.create(ilka.ctx, {
      name: 'Personalverwaltung',
      purpose: 'Begründung, Durchführung und Beendigung des Beschäftigungsverhältnisses.',
      role: 'controller',
      legalBasis: 'art6_1b',
      legalBasisNote: '§ 26 BDSG in Verbindung mit Art. 6 Abs. 1 lit. b DSGVO.',
      dataSubjectCategories: ['Beschäftigte', 'Bewerbende'],
      dataCategories: ['Stammdaten', 'Vertragsdaten', 'Abrechnungsdaten', 'Fehlzeiten'],
      specialCategories: false,
      recipients: ['Lohnbuchhaltung', 'Berufsgenossenschaft', 'Krankenkassen'],
      thirdCountryTransfer: false,
      retention: 'Drei Jahre nach Ende des Beschäftigungsverhältnisses, Lohnunterlagen zehn Jahre.',
      dpiaRequired: false,
      ownerPersonId: marlene.id,
    }),
    'vvtPersonal',
  );
  const vvtVideo = must(
    await processing.create(ilka.ctx, {
      name: 'Videoüberwachung der Umspannwerke',
      purpose: 'Schutz kritischer Anlagen vor Sabotage und unbefugtem Zutritt.',
      role: 'controller',
      legalBasis: 'art6_1f',
      legalBasisNote:
        'Berechtigtes Interesse am Schutz der Netzinfrastruktur; Interessenabwägung dokumentiert.',
      dataSubjectCategories: ['Beschäftigte', 'Fremdfirmen', 'Passantinnen und Passanten'],
      dataCategories: ['Bildaufnahmen', 'Zeitstempel'],
      specialCategories: false,
      recipients: ['Sicherheitsdienst'],
      thirdCountryTransfer: false,
      retention: '72 Stunden, danach automatische Löschung.',
      dpiaRequired: true,
      ownerPersonId: wenzel.id,
    }),
    'vvtVideo',
  );

  // TOM nach Art. 32 sind die ISMS-Maßnahmen selbst — keine zweite Liste.
  for (const [activityId, measureIds] of [
    [vvtAbrechnung.id, [mfa.id, verschluesselung.id, backup.id]],
    [vvtPersonal.id, [verschluesselung.id, mfa.id]],
    [vvtVideo.id, [protokollierung.id, verschluesselung.id]],
  ] as [string, string[]][]) {
    for (const measureId of measureIds) await processing.linkTom(ilka.ctx, activityId, measureId);
  }
  await processing.linkAsset(ilka.ctx, vvtAbrechnung.id, abrechnung.id);
  await processing.linkAsset(ilka.ctx, vvtAbrechnung.id, kundenportal.id);
  await processing.linkAsset(ilka.ctx, vvtPersonal.id, personaldaten.id);

  await dpia.upsert(ilka.ctx, vvtVideo.id, {
    descriptionOfProcessing:
      'Zwölf Kameras an vier Umspannwerken erfassen Zufahrten und Anlagenbereiche. Aufnahme dauerhaft, Auswertung nur anlassbezogen durch zwei Personen gemeinsam.',
    necessityAssessment:
      'Zutrittskontrolle allein verhindert keine Sabotage an frei zugänglichen Außenanlagen. Mildere Mittel — Zaun, Beleuchtung, Bewegungsmelder — sind umgesetzt und reichen nicht aus. Der Erfassungsbereich endet an der Grundstücksgrenze.',
    risks: [
      {
        title: 'Beobachtungsdruck auf Beschäftigte der Netzleitstelle',
        likelihood: 3,
        impact: 3,
        mitigation:
          'Keine Kameras auf Arbeitsplätze gerichtet, Betriebsvereinbarung geschlossen, Auswertung nur im Vier-Augen-Prinzip.',
      },
      {
        title: 'Unbefugte Auswertung der Aufnahmen',
        likelihood: 2,
        impact: 4,
        mitigation: 'Zugriff auf zwei benannte Personen beschränkt, jeder Zugriff wird protokolliert.',
      },
      {
        title: 'Erfassung von Passantinnen und Passanten außerhalb des Geländes',
        likelihood: 2,
        impact: 2,
        mitigation: 'Erfassungsbereiche durch Privatzonen-Masken auf das Betriebsgelände begrenzt.',
      },
    ],
  });
  await dpia.submit(ilka.ctx, vvtVideo.id);
  // Art. 35 Abs. 2: der Rat kommt von der DSB — und nie von der Verantwortlichen der Verarbeitung.
  await dpia.recordOpinion(ilka.ctx, vvtVideo.id, {
    opinion:
      'Die Verarbeitung ist bei Einhaltung der beschriebenen Maßnahmen zulässig. Die Privatzonen-Masken sind halbjährlich zu prüfen, die Betriebsvereinbarung ist Voraussetzung.',
    result: 'approved_with_measures',
  });
  await processing.update(ilka.ctx, vvtAbrechnung.id, { status: 'active' });
  await processing.update(ilka.ctx, vvtPersonal.id, { status: 'active' });
  await processing.update(ilka.ctx, vvtVideo.id, { status: 'active' });

  // --- Audit, Feststellungen, KVP (Kap. 9.2, 10.2) -----------------------------------------
  log.log('Auditprogramm, Feststellungen und Kennzahlen …');
  const auditScope = [
    'ISO27001 9.1',
    'ISO27001 9.2.1',
    'ISO27001 A.5.17',
    'ISO27001 A.8.13',
    'ISO27001 A.8.15',
    'ISO27001 A.8.22',
  ]
    .map((r) => req(r))
    .filter(Boolean) as string[];
  const internesAudit = must(
    await audits.create(henrike.ctx, {
      title: 'Internes Audit — Zugriffssteuerung und Netzsegmentierung',
      kind: 'internal',
      frameworkKey: 'ISO27001',
      scope: 'Leittechnik, Büro-IT, Zugangssteuerung, Protokollierung',
      plannedFrom: day(-40),
      plannedTo: day(-33),
      leadAuditorUserId: corinna.ctx.userId,
      requirementIds: auditScope,
      reportFileId: null,
    }),
    'internesAudit',
  );
  await audits.update(henrike.ctx, internesAudit.id, { status: 'in_progress' });

  const hauptabweichung = must(
    await findings.create(corinna.ctx, {
      title: 'Administrative Zugänge zur Leittechnik ohne zweite Stufe',
      description:
        'Stichprobe: 4 von 9 administrativen Konten im Leitnetz waren ohne Mehrfaktor-Anmeldung nutzbar. Die Richtlinie sieht sie verbindlich vor.',
      source: 'audit',
      severity: 'major',
      auditId: internesAudit.id,
      requirementId: req('ISO27001 A.5.17'),
      dueAt: day(35),
    }),
    'hauptabweichung',
  );
  const nebenabweichung = must(
    await findings.create(corinna.ctx, {
      title: 'Protokolle der Sprungserver werden nicht zentral ausgewertet',
      description: 'Die Protokolle liegen lokal und werden nur anlassbezogen gesichtet.',
      source: 'audit',
      severity: 'minor',
      auditId: internesAudit.id,
      requirementId: req('ISO27001 A.8.15'),
      dueAt: day(70),
    }),
    'nebenabweichung',
  );
  await findings.create(corinna.ctx, {
    title: 'Rückspieltests werden durchgeführt, aber nicht dokumentiert',
    description: 'Die wöchentlichen Tests finden statt; ein Nachweis darüber fehlt.',
    source: 'audit',
    severity: 'observation',
    auditId: internesAudit.id,
    requirementId: req('ISO27001 A.8.13'),
  });

  const korrektur = must(
    await actions.create(henrike.ctx, {
      title: 'Mehrfaktor-Anmeldung für alle Leittechnik-Konten nachziehen',
      description: 'Die vier verbliebenen Konten auf Hardware-Token umstellen, Ausnahmen dokumentieren.',
      kind: 'corrective',
      ownerPersonId: bastian.personId,
      dueAt: day(28),
      findingId: hauptabweichung.id,
    }),
    'korrektur',
  );
  await actions.update(henrike.ctx, korrektur.id, { status: 'in_progress' });
  await actions.create(henrike.ctx, {
    title: 'Protokolle der Sprungserver an die zentrale Auswertung anbinden',
    kind: 'corrective',
    ownerPersonId: bastian.personId,
    dueAt: day(65),
    findingId: nebenabweichung.id,
  });
  await actions.create(henrike.ctx, {
    title: 'Redundante Anbindung für das Umspannwerk Nord prüfen',
    description: 'Wirtschaftlichkeit einer zweiten Leitung oder Mobilfunk-Rückfallebene bewerten.',
    kind: 'improvement',
    ownerPersonId: wenzel.id,
    dueAt: day(-3),
    riskId: fernwirkausfall.id,
  });

  // --- Nachweisdateien -----------------------------------------------------------------------
  // Ohne hinterlegte Dateien wäre das Auditpaket eine Behauptungsliste. Vier Dateien decken
  // die vier Wege ab, auf denen etwas hochgeladen werden kann.
  log.log('Nachweisdateien …');
  const upload = async (ctx: AuthContext, name: string, title: string, lines: string[]) =>
    must(
      await files.upload(ctx, {
        originalname: name,
        mimetype: 'application/pdf',
        size: fakePdf(title, lines).byteLength,
        buffer: fakePdf(title, lines),
      }),
      name,
    );

  const rueckspieltest = await upload(
    henrike.ctx,
    'rueckspieltest-protokoll.pdf',
    'Protokoll des Rückspieltests',
    [
      'Wöchentlicher Rückspieltest der Sicherung des Netzleitsystems.',
      'Geprüft: Vollständigkeit, Lesbarkeit, Wiederherstellungsdauer (38 Minuten).',
      'Ergebnis: bestanden.',
    ],
  );
  const nachweis = must(
    await evidence.create(henrike.ctx, {
      title: 'Protokoll des wöchentlichen Rückspieltests',
      description: 'Beleg, dass die Sicherung nicht nur läuft, sondern auch zurückgespielt werden kann.',
      fileId: rueckspieltest.id,
      url: null,
      collectedAt: day(-7),
      validUntil: day(83),
    }),
    'nachweis',
  );
  await evidence.linkMeasure(henrike.ctx, backup.id, nachweis.id);

  const auditbericht = await upload(corinna.ctx, 'auditbericht-zugriffssteuerung.pdf', 'Auditbericht', [
    'Internes Audit — Zugriffssteuerung und Netzsegmentierung.',
    'Geprüfte Anforderungen: ISO/IEC 27001 Kap. 9.1, 9.2.1, A.5.17, A.8.13, A.8.15, A.8.22.',
    'Eine Hauptabweichung, eine Nebenabweichung, eine Beobachtung.',
  ]);
  // Erst mit hinterlegtem Bericht gilt das Audit als berichtet und zählt auf die Abdeckung ein.
  await audits.update(henrike.ctx, internesAudit.id, {
    status: 'reported',
    reportFileId: auditbericht.id,
  });

  const zertifikat = await upload(henrike.ctx, 'zertifikat-lead-auditor.pdf', 'Zertifikat', [
    'Lead Auditor ISO/IEC 27001',
    'Gültig bis: siehe Kompetenzregister.',
  ]);
  await competence.setPersonSkill(henrike.ctx, corinna.personId, {
    skillId: skillAudit.id,
    level: 4,
    evidenceNote: 'Interne Auditorin, jährliche Auffrischung',
    evidenceFileId: zertifikat.id,
    validUntil: day(300),
  });

  for (const kpi of [
    {
      name: 'Abdeckung der Anwendbarkeitserklärung',
      unit: '%',
      target: 90,
      direction: 'higher_is_better' as const,
      source: 'computed' as const,
      computationKey: 'soa_coverage_pct' as const,
      frequency: 'monatlich',
    },
    {
      name: 'Umsetzungsgrad der Maßnahmen',
      unit: '%',
      target: 85,
      direction: 'higher_is_better' as const,
      source: 'computed' as const,
      computationKey: 'measure_implementation_pct' as const,
      frequency: 'monatlich',
    },
    {
      name: 'Durchschnittlicher Reifegrad',
      unit: 'Stufe',
      target: 3.5,
      direction: 'higher_is_better' as const,
      source: 'computed' as const,
      computationKey: 'avg_maturity' as const,
      frequency: 'quartalsweise',
    },
    {
      name: 'Offene Hauptabweichungen',
      target: 0,
      direction: 'lower_is_better' as const,
      source: 'computed' as const,
      computationKey: 'open_major_findings' as const,
      frequency: 'monatlich',
    },
    {
      name: 'Überfällige KVP-Maßnahmen',
      target: 0,
      direction: 'lower_is_better' as const,
      source: 'computed' as const,
      computationKey: 'overdue_actions' as const,
      frequency: 'monatlich',
    },
    {
      name: 'Quote der Lesebestätigungen',
      unit: '%',
      target: 95,
      direction: 'higher_is_better' as const,
      source: 'computed' as const,
      computationKey: 'acknowledgement_rate_pct' as const,
      frequency: 'monatlich',
    },
  ]) {
    await kpis.create(henrike.ctx, KpiDto.parse({ ...kpi, ownerPersonId: henrike.personId }));
  }
  const klickrate = must(
    await kpis.create(
      henrike.ctx,
      KpiDto.parse({
        name: 'Klickrate in Phishing-Simulationen',
        unit: '%',
        target: 5,
        direction: 'lower_is_better',
        source: 'manual',
        frequency: 'quartalsweise',
        ownerPersonId: henrike.personId,
      }),
    ),
    'klickrate',
  );
  await kpis.record(henrike.ctx, klickrate.id, { measuredAt: day(-180), value: 17 });
  await kpis.record(henrike.ctx, klickrate.id, { measuredAt: day(-90), value: 11 });
  await kpis.record(henrike.ctx, klickrate.id, { measuredAt: day(-7), value: 8 });
  await kpis.refresh(tenantId);

  // Eine laufende Managementbewertung: die Eingaben nach Kap. 9.3.2 rechnet sie aus den Daten.
  await reviews.create(henrike.ctx, { heldAt: day(14), chairPersonId: gesine.id });

  log.log('');
  log.log('Demodaten angelegt: Nordlicht Energiewerke GmbH');
  log.log(`  Anmeldung unter  ${loadEnv().WEB_BASE_URL}`);
  log.log(`  Kennwort für alle Konten: ${DEMO_PASSWORD}`);
  log.log('  henrike.sallach@nordlicht.example   ISMS-Leitung (CISO)');
  log.log('  jorin.kessler@nordlicht.example     Stellvertretung ISMS — gibt Dokumente frei');
  log.log('  bastian.olwig@nordlicht.example     Asset-/Risk-Owner');
  log.log('  corinna.feldt@nordlicht.example     Interne Auditorin');
  log.log('  ilka.norgaard@nordlicht.example     Datenschutzbeauftragte');
}

// Nur beim direkten Start ausführen; der Test importiert seedDemoTenant().
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
