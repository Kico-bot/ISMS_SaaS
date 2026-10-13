import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MAX_UPLOAD_BYTES } from '@isms/shared';
import { catchError, type Observable, throwError } from 'rxjs';

/** Höchstzahl der Textfelder neben der Datei. Ein Upload braucht kaum welche. */
export const MAX_UPLOAD_FIELDS = 20;
/** Größe je Textfeld. */
export const MAX_UPLOAD_FIELD_BYTES = 64 * 1024;

/**
 * Grenzen für multer. Ohne `fields` und `fieldSize` nähme ein Upload beliebig viele Textfelder
 * zu je 1 MB an, und jedes davon landete im Protokoll.
 */
export const UPLOAD_LIMITS = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  fields: MAX_UPLOAD_FIELDS,
  fieldSize: MAX_UPLOAD_FIELD_BYTES,
  parts: MAX_UPLOAD_FIELDS + 1,
};

/** Meldungen von multer, die Nest als 400 weiterreicht, die aber „zu groß“ bedeuten. */
const TOO_LARGE = ['Field value too long', 'Too many fields', 'Too many parts', 'Field name too long'];

/**
 * Macht aus den Grenzverletzungen der Textfelder eine 413 mit deutscher Meldung. Muss vor dem
 * FileInterceptor stehen (`@UseInterceptors(UploadLimitsInterceptor, FileInterceptor(...))`).
 */
@Injectable()
export class UploadLimitsInterceptor implements NestInterceptor {
  intercept(_ec: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((e: unknown) => {
        if (e instanceof BadRequestException && TOO_LARGE.some((m) => e.message.startsWith(m))) {
          return throwError(
            () =>
              new PayloadTooLargeException({
                title: 'Upload ist zu groß',
                detail: `Neben der Datei sind höchstens ${MAX_UPLOAD_FIELDS} Textfelder zu je ${
                  MAX_UPLOAD_FIELD_BYTES / 1024
                } KB zulässig.`,
              }),
          );
        }
        return throwError(() => e);
      }),
    );
  }
}
