/**
 * Permission-Katalog und Rollenmatrix (Quelle: docs/architecture/01-datenmodell.md §4.1).
 * Wird in die Tabellen `permission`, `role`, `role_permission`, `sod_rule` geseedet und
 * gleichzeitig von API-Guards und UI (Button-Sichtbarkeit) genutzt.
 */

const define = <T extends Record<string, string>>(t: T) => t;

/** Alle Permissions als `modul.aktion`. `*_own` = nur für Datensätze, deren Owner der Aufrufer ist. */
export const P = define({
  // Plattform (nur Platform-Admin, mandantenlos)
  PLATFORM_TENANTS: 'platform.tenants',
  PLATFORM_CATALOG: 'platform.catalog',
  PLATFORM_SSO: 'platform.sso',

  // Mandant
  TENANT_SETTINGS: 'tenant.settings',
  TENANT_MEMBERS: 'tenant.members',
  TENANT_ROLES: 'tenant.roles',
  FRAMEWORK_ACTIVATE: 'framework.activate',

  // Kontext (Parteien, PESTLE, Ziele, Standorte, Organigramm, Kommunikations-/Änderungsplan)
  CONTEXT_READ: 'context.read',
  CONTEXT_WRITE: 'context.write',

  ASSET_READ: 'asset.read',
  ASSET_WRITE: 'asset.write',
  ASSET_WRITE_OWN: 'asset.write_own',

  RISK_READ: 'risk.read',
  RISK_WRITE: 'risk.write',
  RISK_WRITE_OWN: 'risk.write_own',
  RISK_ACCEPT: 'risk.accept',

  MEASURE_READ: 'measure.read',
  MEASURE_WRITE: 'measure.write',
  MEASURE_WRITE_OWN: 'measure.write_own',
  MEASURE_VERIFY: 'measure.verify',

  SOA_READ: 'soa.read',
  SOA_WRITE: 'soa.write',

  DOCUMENT_READ: 'document.read',
  DOCUMENT_WRITE: 'document.write',
  DOCUMENT_APPROVE: 'document.approve',
  DOCUMENT_PUBLISH: 'document.publish',

  COMPETENCE_READ: 'competence.read',
  COMPETENCE_WRITE: 'competence.write',
  TRAINING_READ: 'training.read',
  TRAINING_WRITE: 'training.write',

  AUDIT_READ: 'audit.read',
  AUDIT_WRITE: 'audit.write',
  FINDING_WRITE: 'finding.write',
  FINDING_VERIFY: 'finding.verify',

  ACTION_READ: 'action.read',
  ACTION_WRITE: 'action.write',
  ACTION_WRITE_OWN: 'action.write_own',
  ACTION_VERIFY: 'action.verify',

  INCIDENT_READ: 'incident.read',
  INCIDENT_WRITE: 'incident.write',
  INCIDENT_REPORT: 'incident.report', // Meldung erfassen (jeder), Fristen/Behörden pflegen (write)

  CONTINUITY_READ: 'continuity.read',
  CONTINUITY_WRITE: 'continuity.write',
  CONTINUITY_WRITE_OWN: 'continuity.write_own',

  PRIVACY_READ: 'privacy.read',
  PRIVACY_WRITE: 'privacy.write',

  REPORT_EXPORT: 'report.export',
  AUDITLOG_READ: 'auditlog.read',
});

export type Permission = (typeof P)[keyof typeof P];
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(P);

export interface PermissionMeta {
  key: Permission;
  module: string;
  action: string;
  description: string;
}

export const PERMISSION_META: PermissionMeta[] = ALL_PERMISSIONS.map((key) => {
  const [module, action] = key.split('.') as [string, string];
  return { key, module, action, description: describe(key) };
});

function describe(key: Permission): string {
  const map: Partial<Record<Permission, string>> = {
    'platform.tenants': 'Mandanten anlegen, sperren, löschen',
    'platform.catalog': 'Framework-Kataloge aktualisieren',
    'platform.sso': 'SSO-Konfiguration je Mandant verwalten',
    'tenant.members': 'Mitglieder einladen, Rollen zuweisen',
    'tenant.roles': 'Rollen und Rechte des Mandanten pflegen',
    'framework.activate': 'Frameworks für den Mandanten aktivieren',
    'risk.accept': 'Restrisiko übernehmen (Freigabe)',
    'measure.verify': 'Wirksamkeit einer Maßnahme bestätigen',
    'document.approve': 'Dokumentversion freigeben (4-Augen-Prinzip)',
    'finding.verify': 'Schließung einer Feststellung bestätigen',
    'action.verify': 'Wirksamkeit einer KVP-Maßnahme bestätigen',
    'incident.report': 'Sicherheitsvorfall melden',
  };
  return map[key] ?? key;
}

// ---------------------------------------------------------------------------------------
// Systemrollen
// ---------------------------------------------------------------------------------------
export const ROLE_KEYS = ['platform_admin', 'isms_manager', 'risk_owner', 'auditor', 'dpo'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
/** Rollen, die innerhalb eines Mandanten vergeben werden dürfen. */
export const TENANT_ROLE_KEYS = ['isms_manager', 'risk_owner', 'auditor', 'dpo'] as const;
export type TenantRoleKey = (typeof TENANT_ROLE_KEYS)[number];

export interface SystemRole {
  key: RoleKey;
  name: string;
  description: string;
  /** Plattformrollen gelten außerhalb eines Mandanten. */
  platform: boolean;
  permissions: readonly Permission[];
}

const READ_ALL: readonly Permission[] = [
  P.CONTEXT_READ,
  P.ASSET_READ,
  P.RISK_READ,
  P.MEASURE_READ,
  P.SOA_READ,
  P.DOCUMENT_READ,
  P.COMPETENCE_READ,
  P.TRAINING_READ,
  P.AUDIT_READ,
  P.ACTION_READ,
  P.INCIDENT_READ,
  P.CONTINUITY_READ,
];

export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: 'platform_admin',
    name: 'Platform Admin',
    description: 'Technischer Betrieb der Plattform. Keine Rechte im ISMS eines Mandanten.',
    platform: true,
    permissions: [P.PLATFORM_TENANTS, P.PLATFORM_CATALOG, P.PLATFORM_SSO],
  },
  {
    key: 'isms_manager',
    name: 'ISMS-Manager / CISO',
    description:
      'Betreibt das ISMS: voller Lese-/Schreibzugriff, Freigaben. Darf eigene Arbeit nicht auditieren.',
    platform: false,
    permissions: [
      ...READ_ALL,
      P.TENANT_SETTINGS,
      P.TENANT_MEMBERS,
      P.TENANT_ROLES,
      P.FRAMEWORK_ACTIVATE,
      P.CONTEXT_WRITE,
      P.ASSET_WRITE,
      P.RISK_WRITE,
      P.RISK_ACCEPT,
      P.MEASURE_WRITE,
      P.MEASURE_VERIFY,
      P.SOA_WRITE,
      P.DOCUMENT_WRITE,
      P.DOCUMENT_APPROVE,
      P.DOCUMENT_PUBLISH,
      P.COMPETENCE_WRITE,
      P.TRAINING_WRITE,
      P.AUDIT_WRITE, // Auditprogramm planen; Findings erhebt der Auditor
      P.ACTION_WRITE,
      P.ACTION_VERIFY,
      P.INCIDENT_WRITE,
      P.INCIDENT_REPORT,
      P.CONTINUITY_WRITE,
      P.PRIVACY_READ,
      P.REPORT_EXPORT,
      P.AUDITLOG_READ,
    ],
  },
  {
    key: 'risk_owner',
    name: 'Asset-/Risk-Owner',
    description: 'Pflegt die eigenen Assets, Risiken, Maßnahmen und KVP-Punkte; liest den Rest.',
    platform: false,
    permissions: [
      ...READ_ALL,
      P.ASSET_WRITE_OWN,
      P.RISK_WRITE_OWN,
      P.MEASURE_WRITE_OWN,
      P.ACTION_WRITE_OWN,
      P.CONTINUITY_WRITE_OWN,
      P.INCIDENT_REPORT,
    ],
  },
  {
    key: 'auditor',
    name: 'Auditor (intern/extern)',
    description:
      'Liest das ISMS, erhebt Feststellungen und bestätigt deren Schließung. Kein operativer Zugriff.',
    platform: false,
    permissions: [
      ...READ_ALL,
      P.AUDIT_WRITE,
      P.FINDING_WRITE,
      P.FINDING_VERIFY,
      P.ACTION_VERIFY,
      P.REPORT_EXPORT,
      P.AUDITLOG_READ,
    ],
  },
  {
    key: 'dpo',
    name: 'Datenschutzbeauftragte:r (DSB)',
    description: 'Verantwortet VVT, DSFA und Datenpannen-Meldungen; liest das übrige ISMS.',
    platform: false,
    permissions: [
      ...READ_ALL,
      P.PRIVACY_READ,
      P.PRIVACY_WRITE,
      P.DOCUMENT_WRITE, // Datenschutz-Richtlinien
      P.INCIDENT_WRITE,
      P.INCIDENT_REPORT,
      P.ACTION_WRITE_OWN,
      P.REPORT_EXPORT,
      P.AUDITLOG_READ,
    ],
  },
];

// ---------------------------------------------------------------------------------------
// Statische Funktionstrennung (unvereinbare Rollenpaare)
// ---------------------------------------------------------------------------------------
export interface SodRuleDef {
  roleA: RoleKey;
  roleB: RoleKey;
  mode: 'block' | 'warn';
  reason: string;
}

export const SOD_RULES: readonly SodRuleDef[] = [
  {
    roleA: 'auditor',
    roleB: 'isms_manager',
    mode: 'block',
    reason: 'Auditor darf das ISMS nicht selbst betreiben (ISO/IEC 27001 9.2.2 c: Unparteilichkeit).',
  },
  {
    roleA: 'auditor',
    roleB: 'risk_owner',
    mode: 'block',
    reason: 'Auditor darf nicht die eigene Umsetzung prüfen.',
  },
  {
    roleA: 'dpo',
    roleB: 'isms_manager',
    mode: 'warn',
    reason: 'Art. 38 Abs. 6 DSGVO: möglicher Interessenkonflikt; in KMU verbreitet, bitte dokumentieren.',
  },
];
