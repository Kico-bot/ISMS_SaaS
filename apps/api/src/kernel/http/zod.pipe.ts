import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Geprüfte Fassung eines Request-Rumpfs, nachgeschlagen über das Objekt `req.body`. Der
 * Protokoll-Interceptor speichert diese Fassung statt des Rohinhalts: unbekannte Felder sind
 * darin schon entfernt. Eine WeakMap, weil eine Pipe den Request nicht kennt, wohl aber den
 * Rumpf, und weil der Eintrag mit dem Request verschwinden soll.
 */
export const validatedBodies = new WeakMap<object, unknown>();

/** Validiert Body/Query gegen ein Zod-Schema aus @isms/shared und liefert die geparste (defaulted) Form. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, metadata?: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        type: 'https://isms.example/problems/validation',
        title: 'Validierung fehlgeschlagen',
        status: 400,
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (metadata?.type === 'body' && !metadata.data && typeof value === 'object' && value !== null) {
      validatedBodies.set(value, result.data);
    }
    return result.data;
  }
}
