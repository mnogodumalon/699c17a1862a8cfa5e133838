import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

export function formatDate(s: string | undefined) {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd.MM.yyyy', { locale: de }); } catch { return s; }
}

export function formatCurrency(v: number | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
}