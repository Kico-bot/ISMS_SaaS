import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  EmptyState,
  ErrorNote,
  formatNumber,
  NormHint,
  PageHeader,
  Spinner,
  StatTile,
} from '../components/ui';
import { api } from '../lib/api';
import { CHART } from '../lib/chart-colors';
import { useAuth } from '../lib/auth-context';

interface KpiRow {
  id: string;
  name: string;
  unit: string | null;
  target: string | null;
  direction: string;
  source: string;
  computationKey: string | null;
  frequency: string | null;
  ownerName: string | null;
  value: string | null;
  previousValue: string | null;
  measuredAt: string | null;
  targetMet: boolean | null;
}

/** Beschriftungen der berechenbaren Kennzahlen — sie müssen zum Backend-Katalog passen. */
const COMPUTATION_LABEL: Record<string, string> = {
  soa_coverage_pct: 'Abdeckung der anwendbaren Anforderungen (Hauptframework)',
  measure_implementation_pct: 'Umsetzungsgrad der Maßnahmen',
  avg_maturity: 'Durchschnittlicher Reifegrad',
  open_major_findings: 'Offene Hauptabweichungen',
  overdue_actions: 'Überfällige KVP-Maßnahmen',
  incidents_last_quarter: 'Vorfälle im letzten Quartal',
  reporting_deadline_hit_rate_pct: 'Fristgerecht erfüllte Meldepflichten',
  acknowledgement_rate_pct: 'Quote der Lesebestätigungen',
  document_review_overdue: 'Überfällige Dokumentenprüfungen',
  risks_above_appetite: 'Risiken über dem Risikoappetit',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

export function KpisPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [computed, setComputed] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['kpis'], queryFn: () => api<KpiRow[]>('/kpis') });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['kpis'] });

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) => api('/kpis', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });
  const refresh = useMutation({
    mutationFn: () => api<{ measuredAt: string; updated: unknown[] }>('/kpis/refresh', { method: 'POST' }),
    onSuccess: invalidate,
  });
  const record = useMutation({
    mutationFn: (v: { id: string; measuredAt: string; value: number }) =>
      api(`/kpis/${v.id}/values`, {
        method: 'POST',
        body: JSON.stringify({ measuredAt: v.measuredAt, value: v.value }),
      }),
    onSuccess: invalidate,
  });

  const rows = list.data ?? [];
  const missed = rows.filter((k) => k.targetMet === false).length;
  const autoCount = rows.filter((k) => k.source === 'computed').length;

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Kennzahlen"
        norm="iso:9.1"
        description="Überwachung und Messung nach ISO 27001 Kap. 9.1. Berechnete Kennzahlen lesen ihren Wert aus dem ISMS selbst — abgetippte Zahlen sind im nächsten Quartal veraltet."
        actions={
          can('audit.write') ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={refresh.isPending || autoCount === 0}
                onClick={() => refresh.mutate()}
              >
                Berechnete fortschreiben
              </button>
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Kennzahl anlegen
              </button>
            </div>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error ?? refresh.error ?? record.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Kennzahlen" value={rows.length} />
        <StatTile
          label="Automatisch berechnet"
          value={autoCount}
          tone={autoCount > 0 ? 'good' : 'neutral'}
          hint="ohne manuelle Pflege"
        />
        <StatTile label="Ziel verfehlt" value={missed} tone={missed > 0 ? 'bad' : 'good'} />
        <StatTile
          label="Zuletzt gemessen"
          value={
            rows[0]?.measuredAt
              ? date(
                  rows
                    .map((k) => k.measuredAt)
                    .sort()
                    .reverse()[0] ?? null,
                )
              : '–'
          }
        />
      </section>

      {refresh.data && (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {refresh.data.updated.length} berechnete Kennzahlen zum {date(refresh.data.measuredAt)}{' '}
          fortgeschrieben.
        </p>
      )}

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const target = String(f.get('target') || '');
            create.mutate({
              name: String(f.get('name')).trim(),
              unit: String(f.get('unit') || '') || null,
              target: target === '' ? null : Number(target),
              direction: String(f.get('direction')),
              source: computed ? 'computed' : 'manual',
              computationKey: computed ? String(f.get('computationKey')) : null,
              frequency: String(f.get('frequency') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-4">
            <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={computed}
                onChange={(e) => setComputed(e.target.checked)}
                className="rounded border-slate-300"
              />
              Wert aus dem ISMS berechnen (empfohlen)
            </label>
          </div>
          <div className="lg:col-span-2">
            <label className="label" htmlFor="name">
              Bezeichnung
              <NormHint refs="iso:9.1" />
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={3}
              className="input"
              placeholder="Umsetzungsgrad der Maßnahmen"
              autoFocus
            />
          </div>
          {computed ? (
            <div className="lg:col-span-2">
              <label className="label" htmlFor="computationKey">
                Berechnet aus
                <NormHint refs="iso:9.1" />
              </label>
              <select
                id="computationKey"
                name="computationKey"
                className="input"
                defaultValue="measure_implementation_pct"
              >
                {Object.entries(COMPUTATION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="lg:col-span-2">
              <label className="label" htmlFor="frequency">
                Messtakt
                <NormHint refs="iso:9.1" />
              </label>
              <input id="frequency" name="frequency" className="input" placeholder="quartalsweise" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="unit">
              Einheit
              <NormHint refs="iso:9.1" />
            </label>
            <input id="unit" name="unit" className="input" placeholder="%" />
          </div>
          <div>
            <label className="label" htmlFor="target">
              Zielwert
              <NormHint refs={['iso:9.1', 'iso:6.2']} />
            </label>
            <input id="target" name="target" type="number" step="0.1" className="input" placeholder="80" />
          </div>
          <div>
            <label className="label" htmlFor="direction">
              Zielrichtung
              <NormHint refs="iso:9.1" />
            </label>
            <select id="direction" name="direction" className="input" defaultValue="higher_is_better">
              <option value="higher_is_better">höher ist besser</option>
              <option value="lower_is_better">niedriger ist besser</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Anlegen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch keine Kennzahlen"
          hint="Beginnen Sie mit drei berechneten Kennzahlen — Umsetzungsgrad, offene Hauptabweichungen und Abdeckung. Sie pflegen sich von selbst."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Kennzahl</th>
                <th className="th w-44">Quelle</th>
                <th className="th w-28">Aktuell</th>
                <th className="th w-28">Zuvor</th>
                <th className="th w-24">Ziel</th>
                <th className="th w-32">Gemessen</th>
                <th className="th w-28">Verlauf</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((k) => {
                const current = k.value != null ? Number(k.value) : null;
                const prev = k.previousValue != null ? Number(k.previousValue) : null;
                const better =
                  current != null &&
                  prev != null &&
                  (k.direction === 'higher_is_better' ? current > prev : current < prev);
                const worse =
                  current != null &&
                  prev != null &&
                  (k.direction === 'higher_is_better' ? current < prev : current > prev);
                return (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td className="td">
                      <span className="font-medium text-slate-800">{k.name}</span>
                      {k.ownerName && <span className="ml-2 text-xs text-slate-500">{k.ownerName}</span>}
                    </td>
                    <td className="td text-xs text-slate-600">
                      {k.source === 'computed' ? (
                        <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
                          automatisch
                        </span>
                      ) : (
                        <span className="text-slate-500">manuell{k.frequency && ` · ${k.frequency}`}</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'td tabular-nums',
                        k.targetMet === false ? 'font-medium text-level-critical' : 'text-slate-800',
                      )}
                    >
                      {formatNumber(current, k.unit)}
                    </td>
                    <td className="td text-xs tabular-nums text-slate-500">
                      {formatNumber(prev)}
                      {prev != null &&
                        (better ? (
                          <span className="ml-1 text-level-low">▲</span>
                        ) : worse ? (
                          <span className="ml-1 text-level-critical">▼</span>
                        ) : null)}
                    </td>
                    <td className="td text-xs tabular-nums text-slate-600">{formatNumber(k.target)}</td>
                    <td className="td text-xs tabular-nums text-slate-600">{date(k.measuredAt)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-ghost py-0.5 text-xs"
                          onClick={() => setOpenId(openId === k.id ? null : k.id)}
                        >
                          {openId === k.id ? 'Zu' : 'Verlauf'}
                        </button>
                        {can('audit.write') && k.source === 'manual' && (
                          <button
                            type="button"
                            className="btn-ghost py-0.5 text-xs"
                            onClick={() => {
                              const raw = window.prompt(
                                `Neuer Wert für „${k.name}“${k.unit ? ` (${k.unit})` : ''}`,
                              );
                              if (raw != null && raw.trim() !== '' && Number.isFinite(Number(raw))) {
                                record.mutate({
                                  id: k.id,
                                  measuredAt: new Date().toISOString().slice(0, 10),
                                  value: Number(raw),
                                });
                              }
                            }}
                          >
                            Erfassen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openId && <KpiHistory kpiId={openId} kpi={rows.find((k) => k.id === openId)!} />}
    </>
  );
}

function KpiHistory({ kpiId, kpi }: { kpiId: string; kpi: KpiRow }) {
  const history = useQuery({
    queryKey: ['kpi-history', kpiId],
    queryFn: () =>
      api<{ measuredAt: string; value: string; note: string | null }[]>(`/kpis/${kpiId}/history`),
  });
  const data = (history.data ?? []).map((v) => ({ datum: date(v.measuredAt), wert: Number(v.value) }));

  return (
    <section className="card mt-4 p-4">
      <h2 className="mb-2 text-sm font-medium text-slate-700">Verlauf — {kpi.name}</h2>
      {history.isLoading ? (
        <Spinner />
      ) : data.length < 2 ? (
        <p className="text-sm text-slate-500">Noch zu wenige Messpunkte für einen Verlauf.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <XAxis dataKey="datum" tick={{ fontSize: 11, fill: CHART.axis }} />
              <YAxis tick={{ fontSize: 11, fill: CHART.muted }} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Line type="monotone" dataKey="wert" stroke={CHART.brand} strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
