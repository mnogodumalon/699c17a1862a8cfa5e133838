import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Raeume, Dozenten, Kurse, Teilnehmer, Anmeldungen } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [raeume, setRaeume] = useState<Raeume[]>([]);
  const [dozenten, setDozenten] = useState<Dozenten[]>([]);
  const [kurse, setKurse] = useState<Kurse[]>([]);
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldungen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [raeumeData, dozentenData, kurseData, teilnehmerData, anmeldungenData] = await Promise.all([
        LivingAppsService.getRaeume(),
        LivingAppsService.getDozenten(),
        LivingAppsService.getKurse(),
        LivingAppsService.getTeilnehmer(),
        LivingAppsService.getAnmeldungen(),
      ]);
      setRaeume(raeumeData);
      setDozenten(dozentenData);
      setKurse(kurseData);
      setTeilnehmer(teilnehmerData);
      setAnmeldungen(anmeldungenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  const kurseMap = useMemo(() => {
    const m = new Map<string, Kurse>();
    kurse.forEach(r => m.set(r.record_id, r));
    return m;
  }, [kurse]);

  const teilnehmerMap = useMemo(() => {
    const m = new Map<string, Teilnehmer>();
    teilnehmer.forEach(r => m.set(r.record_id, r));
    return m;
  }, [teilnehmer]);

  return { raeume, setRaeume, dozenten, setDozenten, kurse, setKurse, teilnehmer, setTeilnehmer, anmeldungen, setAnmeldungen, loading, error, fetchAll, raeumeMap, dozentenMap, kurseMap, teilnehmerMap };
}