import { Injectable, InternalServerErrorException, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { loadEnv } from '../../config/env';

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Ablage der Nachweisdateien. Der lokale Treiber schreibt ins Dateisystem — das kostet nichts
 * und läuft überall. Die Schnittstelle ist bewusst schmal, damit ein Azure-Blob- oder
 * S3-Treiber später nur diese drei Methoden erfüllen muss.
 *
 * Der Ablagepfad beginnt mit der Mandanten-ID. Damit liegt die Mandantentrennung nicht nur
 * in der Datenbank, sondern auch im Dateisystem.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root: string;

  constructor() {
    const env = loadEnv();
    if (env.STORAGE_DRIVER !== 'local') {
      throw new InternalServerErrorException(
        `Ablagetreiber „${env.STORAGE_DRIVER}“ ist noch nicht umgesetzt`,
      );
    }
    this.root = resolve(env.STORAGE_LOCAL_DIR);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(tenantId: string, buffer: Buffer): Promise<StoredObject> {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    // Zwei Ebenen aus dem Hash halten die Verzeichnisse klein; die UUID verhindert,
    // dass der Dateiname etwas über den Inhalt verrät.
    const storageKey = `${tenantId}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${randomUUID()}`;
    const target = this.pathOf(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
    return { storageKey, sizeBytes: buffer.byteLength, sha256 };
  }

  stream(storageKey: string): ReadStream {
    return createReadStream(this.pathOf(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.pathOf(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.pathOf(storageKey), { force: true });
  }

  /**
   * Schlüssel in einen Pfad auflösen und dabei gegen Ausbrüche absichern: ein Schlüssel aus
   * der Datenbank darf niemals aus dem Ablageverzeichnis herausführen.
   */
  private pathOf(storageKey: string): string {
    const target = resolve(this.root, storageKey);
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new InternalServerErrorException('Ungültiger Ablageschlüssel');
    }
    return join(target);
  }
}
