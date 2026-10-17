import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION = 'isms:audit_action';

/**
 * Wie das Protokoll einen Handler einordnet, unabhängig von der Schreibweise des Pfads:
 * `export` für Ausleitungen, `login` für Anmeldungen, `skip` für Anfragen ohne Aussage
 * (Erneuern, Abmelden). Ohne Angabe gilt die HTTP-Methode.
 */
export type AuditActionKind = 'export' | 'login' | 'skip';
export const AuditAction = (kind: AuditActionKind) => SetMetadata(AUDIT_ACTION, kind);
