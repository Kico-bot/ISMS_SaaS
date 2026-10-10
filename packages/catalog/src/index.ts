import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RequirementKind = 'clause' | 'control' | 'baustein' | 'anforderung' | 'article' | 'paragraph';
export type RequirementLevel = 'basis' | 'standard' | 'erhoeht';
export type ControlDomain = 'organizational' | 'people' | 'physical' | 'technological';

export interface CatalogFramework {
  key: string;
  version: string;
  name: string;
  publisher: string;
  jurisdiction: string;
  license_note: string;
}

export interface CatalogRequirement {
  ref_code: string;
  title: string;
  body?: string | null;
  kind: RequirementKind;
  level?: RequirementLevel;
  domain?: ControlDomain;
  /** Wann die Anforderung zählt; fehlt = immer (siehe REQUIREMENT_SCOPES in @isms/shared). */
  applies_to?: string | null;
  /** Nationale Fundstelle, z. B. „§ 30 Abs. 2 Nr. 1 BSIG“. */
  alt_ref?: string | null;
  /** Kurzer Umsetzungshinweis in eigenen Worten. */
  hint?: string | null;
  /** ISO-Datum, ab dem die Pflicht gilt. */
  applies_from?: string | null;
  parent_ref: string | null;
  path: string;
  sort_order: number;
}

export interface CatalogFile {
  framework: CatalogFramework;
  requirements: CatalogRequirement[];
}

export interface CrosswalkRow {
  source_framework: string;
  source_ref: string;
  target_framework: string;
  target_ref: string;
  relation: 'equivalent' | 'partial' | 'supports';
  source: string;
}

const dataDir = join(__dirname, '..', 'data');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as T;
}

/** Alle Framework-Kataloge in Seed-Reihenfolge (Crosswalk-Ziele müssen vor dem Crosswalk existieren). */
export const CATALOG_FILES = [
  'iso27001-2022.json',
  'bsi-kompendium-2023.json',
  'bsi-standards-200.json',
  'nis2-2022.json',
  'dsgvo-2016.json',
  'eu-ai-act-2024.json',
] as const;

export const CROSSWALK_FILES = ['crosswalk-iso-bsi-ed6.json', 'crosswalk-curated.json'] as const;

export function loadCatalogs(): CatalogFile[] {
  return CATALOG_FILES.map((f) => readJson<CatalogFile>(f));
}

export function loadCrosswalks(): CrosswalkRow[] {
  return CROSSWALK_FILES.flatMap((f) => readJson<CrosswalkRow[]>(f));
}
