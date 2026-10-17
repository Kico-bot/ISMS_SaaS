import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from './problem.filter';

function run(exception: unknown) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(s: number) {
      status = s;
      return res;
    },
    type() {
      return res;
    },
    json(b: Record<string, unknown>) {
      body = b;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'POST', url: '/api/v1/test' }),
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return { status, body };
}

describe('ProblemDetailsFilter: keine Datenbankdetails nach außen', () => {
  it('nennt bei einer Unique-Verletzung keine Werte aus der Datenbank', () => {
    const { status, body } = run({
      code: '23505',
      constraint: 'user_email_unique',
      detail: 'Key (email)=(geheim@example.test) already exists.',
    });
    expect(status).toBe(409);
    expect(JSON.stringify(body)).not.toContain('geheim@example.test');
  });

  it('nennt bei einer fehlenden Verknüpfung keine Werte aus der Datenbank', () => {
    const { status, body } = run({
      code: '23503',
      constraint: 'risk_owner_fk',
      detail: 'Key (owner_person_id)=(1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed) is not present.',
    });
    expect(status).toBe(422);
    expect(JSON.stringify(body)).not.toContain('1b9d6bcd');
  });
});
