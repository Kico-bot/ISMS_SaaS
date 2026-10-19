import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { schema } from '@isms/db';
import {
  ALLOWED_UPLOAD_MIME,
  type AllowedUploadMime,
  type AuthContext,
  MAX_UPLOAD_BYTES,
  P,
  UPLOAD_EXTENSIONS,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { StorageService } from '../../kernel/storage/storage.service';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

export interface UploadInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Nachweisdateien. Die Datei selbst liegt in der Ablage, die Metadaten in der Datenbank —
 * inklusive SHA-256, damit sich ein Beleg später als unverändert nachweisen lässt.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly dbs: DbService,
    private readonly storage: StorageService,
  ) {}

  async upload(ctx: AuthContext, input: UploadInput) {
    const tenantId = ctx.tenantId!;
    if (!input?.buffer?.length) throw new BadRequestException({ title: 'Es wurde keine Datei übertragen' });
    if (input.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({
        title: 'Datei ist zu groß',
        detail: `Zulässig sind höchstens ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB je Datei.`,
      });
    }
    if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(input.mimetype)) {
      throw new BadRequestException({
        title: `Dateityp ${input.mimetype} ist nicht zugelassen`,
        detail:
          'Zulässig sind PDF, Bilder, Text und Office-Dokumente. Ausführbare Dateien und SVG sind ausgeschlossen.',
      });
    }
    const mime = input.mimetype as AllowedUploadMime;
    const filename = sanitizeFilename(input.originalname);
    const extension = /\.[^.]+$/.exec(filename.toLowerCase())?.[0] ?? '';
    if (!UPLOAD_EXTENSIONS[mime].includes(extension)) {
      throw new BadRequestException({
        title: `Die Endung passt nicht zum Dateityp ${mime}`,
        detail: `Zulässig sind für diesen Typ: ${UPLOAD_EXTENSIONS[mime].join(', ')}.`,
      });
    }
    if (!contentMatches(extension, input.buffer)) {
      throw new BadRequestException({
        title: 'Der Inhalt passt nicht zur Endung',
        detail: `Die Datei endet auf ${extension}, ihr Inhalt ist aber kein solches Format.`,
      });
    }

    const stored = await this.storage.put(tenantId, input.buffer);
    try {
      return await this.dbs.tenant(tenantId, async (tx) => {
        // Derselbe Inhalt wird nicht zweimal abgelegt — hilfreich, wenn ein Beleg an
        // mehreren Stellen hängt, und es hält die Ablage klein.
        const [dupe] = await tx
          .select()
          .from(schema.file)
          .where(and(eq(schema.file.tenantId, tenantId), eq(schema.file.sha256, stored.sha256)));
        if (dupe) {
          await this.storage.remove(stored.storageKey);
          return { ...dupe, deduplicated: true };
        }
        const [f] = await tx
          .insert(schema.file)
          .values({
            tenantId,
            storageKey: stored.storageKey,
            filename,
            mime: input.mimetype,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            uploadedByUserId: ctx.userId,
          })
          .returning();
        return { ...f!, deduplicated: false };
      });
    } catch (err) {
      // Bleibt die Datenbank stehen, darf keine verwaiste Datei zurückbleiben.
      await this.storage.remove(stored.storageKey);
      throw err;
    }
  }

  /** Metadaten und Lesestrom — die Zugriffsprüfung liegt bei der RLS über den Mandanten. */
  async download(tenantId: string, id: string) {
    const meta = await this.dbs.tenant(tenantId, (tx) => this.require(tx, tenantId, id));
    // Öffnen statt vorher prüfen: zwischen Prüfung und Öffnen kann die Datei verschwinden.
    const stream = await this.storage.stream(meta.storageKey).catch(() => {
      throw new NotFoundException({
        title: 'Die Datei fehlt in der Ablage',
        detail: 'Der Eintrag existiert, die Datei lässt sich jedoch nicht lesen.',
      });
    });
    return { meta, stream };
  }

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT f.id, f.filename, f.mime, f.size_bytes AS "sizeBytes", f.sha256, f.created_at AS "createdAt",
               u.display_name AS "uploadedByName",
               ${this.referenceCountSql()} AS "referenceCount"
        FROM file f
        LEFT JOIN "user" u ON u.id = f.uploaded_by_user_id
        WHERE f.tenant_id = ${tenantId}
        ORDER BY f.created_at DESC`);
      return res.rows;
    });
  }

  /**
   * Löschen nur, solange die Datei an nichts hängt. Eine Datei zu entfernen, auf die ein
   * Nachweis oder eine Dokumentversion verweist, würde die Beweiskette stillschweigend brechen.
   * Wer nur `measure.write_own` hat, löscht nur, was er selbst hochgeladen hat.
   */
  async remove(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    const meta = await this.dbs.tenant(tenantId, async (tx) => {
      const f = await this.require(tx, tenantId, id);
      if (!ctx.permissions.has(P.MEASURE_WRITE) && f.uploadedByUserId !== ctx.userId) {
        throw new ForbiddenException({
          title: 'Keine Berechtigung',
          detail: 'Ohne measure.write lassen sich nur selbst hochgeladene Dateien entfernen.',
        });
      }
      const [row] = (
        await tx.execute(
          sql`SELECT ${this.referenceCountSql('f2')} AS "referenceCount" FROM file f2 WHERE f2.id = ${id}`,
        )
      ).rows as { referenceCount: number }[];
      if ((row?.referenceCount ?? 0) > 0) {
        throw new ConflictException({
          title: 'Die Datei ist noch verknüpft',
          detail: `Sie hängt an ${row!.referenceCount} Stelle(n). Lösen Sie die Verknüpfung, bevor Sie die Datei entfernen.`,
        });
      }
      await tx.delete(schema.file).where(eq(schema.file.id, id));
      return f;
    });
    await this.storage.remove(meta.storageKey);
  }

  /** Zählt alle Stellen, an denen eine Datei hängen kann. */
  private referenceCountSql(alias = 'f') {
    return sql`(
      (SELECT count(*) FROM evidence e WHERE e.file_id = ${sql.raw(alias)}.id)
      + (SELECT count(*) FROM document_version dv WHERE dv.file_id = ${sql.raw(alias)}.id)
      + (SELECT count(*) FROM person_skill ps WHERE ps.evidence_file_id = ${sql.raw(alias)}.id)
      + (SELECT count(*) FROM training_assignment ta WHERE ta.evidence_file_id = ${sql.raw(alias)}.id)
      + (SELECT count(*) FROM "audit" a WHERE a.report_file_id = ${sql.raw(alias)}.id)
      + (SELECT count(*) FROM management_review mr WHERE mr.minutes_file_id = ${sql.raw(alias)}.id)
    )::int`;
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [f] = await tx
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, id), eq(schema.file.tenantId, tenantId)));
    if (!f) throw new NotFoundException({ title: 'Datei nicht gefunden' });
    return f;
  }
}

/**
 * Dateinamen entschärfen: Pfadanteile entfernen, Steuerzeichen raus, Länge begrenzen.
 * Der Name landet in einem Content-Disposition-Header und in Downloads. Unsichtbare
 * Formatzeichen (`\p{Cf}`, etwa U+202E, das die Schreibrichtung umkehrt) fallen ebenfalls weg:
 * mit ihnen sieht `beleg\u202Efdp.exe` aus wie `belegexe.pdf`.
 */
function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'datei';
  const clean = base
    .replace(CONTROL_CHARS, '')
    .replace(/\p{Cf}/gu, '')
    .trim();
  return (clean.length ? clean : 'datei').slice(0, 200);
}

/** Steuerzeichen und Anführungszeichen, die einen Header-Wert aufbrechen könnten. */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}"]`,
  'g',
);

/**
 * Die ersten Bytes der Binärformate. Textformate (.txt, .csv, .md, .log) haben keine Signatur
 * und werden nicht geprüft.
 */
const SIGNATURES: Record<string, ((b: Buffer) => boolean) | undefined> = {
  '.pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
  '.png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  '.jpg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  '.jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  '.webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  // ZIP und die Office-Formate seit 2007 (OOXML sind ZIP-Archive)
  '.zip': isZip,
  '.docx': isZip,
  '.xlsx': isZip,
  '.pptx': isZip,
  // die alten Office-Formate (OLE-Verbunddatei)
  '.doc': isOle,
  '.dot': isOle,
  '.xls': isOle,
  '.ppt': isOle,
};

function contentMatches(extension: string, buffer: Buffer): boolean {
  const check = SIGNATURES[extension];
  return check ? check(buffer) : true;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
}

function isZip(b: Buffer): boolean {
  // lokaler Dateikopf, oder ein leeres Archiv (nur das Ende des zentralen Verzeichnisses)
  return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
}

function isOle(b: Buffer): boolean {
  return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}
