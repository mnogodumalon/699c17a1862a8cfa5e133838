import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Kurse, Raeume, Dozenten, Teilnehmer, Anmeldungen } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [kurse, setKurse] = useState<Kurse[]>([]);
  const [raeume, setRaeume] = useState<Raeume[]>([]);
  const [dozenten, setDozenten] = useState<Dozenten[]>([]);
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldungen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [kurseData, raeumeData, dozentenData, teilnehmerData, anmeldungenData] = await Promise.all([
        LivingAppsService.getKurse(),
        LivingAppsService.getRaeume(),
        LivingAppsService.getDozenten(),
        LivingAppsService.getTeilnehmer(),
        LivingAppsService.getAnmeldungen(),
      ]);
      setKurse(kurseData);
      setRaeume(raeumeData);
      setDozenten(dozentenData);
      setTeilnehmer(teilnehmerData);
      setAnmeldungen(anmeldungenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const kurseMap = useMemo(() => {
    const m = new Map<string, Kurse>();
    kurse.forEach(r => m.set(r.record_id, r));
    return m;
  }, [kurse]);

  const raeumeMap = useMemo(() => {
    const m = new Map<string, Raeume>();
    raeume.forEach(r => m.set(r.record_id, r));
    return m;
  }, [raeume]);

  const dozentenMap = useMemo(() => {
    const m = new Map<string, Dozenten>();
    dozenten.forEach(r => m.set(r.record_id, r));
    return m;
  }, [dozenten]);

  const teilnehmerMap = useMemo(() => {
    const m = new Map<string, Teilnehmer>();
    teilnehmer.forEach(r => m.set(r.record_id, r));
    return m;
  }, [teilnehmer]);

  return { kurse, setKurse, raeume, setRaeume, dozenten, setDozenten, teilnehmer, setTeilnehmer, anmeldungen, setAnmeldungen, loading, error, fetchAll, kurseMap, raeumeMap, dozentenMap, teilnehmerMap };
}