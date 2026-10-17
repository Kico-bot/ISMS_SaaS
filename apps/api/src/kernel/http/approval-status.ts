import { BadRequestException } from '@nestjs/common';

/**
 * Ein Status, der eine Freigabe ausdrückt („bestätigt“, „getragen“, „freigegeben“), entsteht nur
 * über seinen eigenen Endpunkt mit Vier-Augen-Prüfung. Das DTO lässt ihn beim Anlegen und Ändern
 * schon nicht zu; diese Prüfung hält die Regel auch für Aufrufer im Prozess, die ohne DTO kommen.
 * Die Datenbank sichert sie ein drittes Mal (Trigger `assert_approval_actor`).
 */
export function rejectApprovalStatus(status: unknown, approval: string, detail: string): void {
  if (status === approval) {
    throw new BadRequestException({ title: 'Freigabe nur im Vier-Augen-Prinzip', detail });
  }
}
