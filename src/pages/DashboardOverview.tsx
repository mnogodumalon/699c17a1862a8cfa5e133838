import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichKurse, enrichAnmeldungen } from '@/lib/enrich';
import type { EnrichedKurse, EnrichedAnmeldungen } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Plus, Users, BookOpen, GraduationCap, Euro, ChevronRight, Pencil, Trash2, CheckCircle2, Circle, CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KurseDialog } from '@/components/dialogs/KurseDialog';
import { AnmeldungenDialog } from '@/components/dialogs/AnmeldungenDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';

export default function DashboardOverview() {
  const {
    kurse, raeume, dozenten, teilnehmer, anmeldungen,
    kurseMap, raeumeMap, dozentenMap, teilnehmerMap,
    loading, error, fetchAll,
  } = useDashboardData();

  // All hooks BEFORE early returns
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [kursDialogOpen, setKursDialogOpen] = useState(false);
  const [editKurs, setEditKurs] = useState<EnrichedKurse | null>(null);
  const [deleteKurs, setDeleteKurs] = useState<EnrichedKurse | null>(null);
  const [anmeldungDialogOpen, setAnmeldungDialogOpen] = useState(false);
  const [editAnmeldung, setEditAnmeldung] = useState<EnrichedAnmeldungen | null>(null);
  const [deleteAnmeldung, setDeleteAnmeldung] = useState<EnrichedAnmeldungen | null>(null);

  const enrichedKurse = enrichKurse(kurse, { dozentenMap, raeumeMap });
  const enrichedAnmeldungen = enrichAnmeldungen(anmeldungen, { teilnehmerMap, kurseMap });

  const selectedKurs = useMemo(
    () => enrichedKurse.find(k => k.record_id === selectedKursId) ?? null,
    [enrichedKurse, selectedKursId]
  );

  const kursAnmeldungen = useMemo(() => {
    if (!selectedKursId) return [];
    return enrichedAnmeldungen.filter(a => {
      const id = extractRecordId(a.fields.kurs);
      return id === selectedKursId;
    });
  }, [enrichedAnmeldungen, selectedKursId]);

  const stats = useMemo(() => {
    const totalEinnahmen = anmeldungen
      .filter(a => a.fields.bezahlt)
      .reduce((sum, a) => {
        const kursId = extractRecordId(a.fields.kurs);
        if (!kursId) return sum;
        const k = kurseMap.get(kursId);
        return sum + (k?.fields.preis ?? 0);
      }, 0);
    const bezahltCount = anmeldungen.filter(a => a.fields.bezahlt).length;
    return { totalEinnahmen, bezahltCount };
  }, [anmeldungen, kurseMap]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingKurse = enrichedKurse.filter(k => !k.fields.enddatum || k.fields.enddatum >= today);
  const pastKurse = enrichedKurse.filter(k => k.fields.enddatum && k.fields.enddatum < today);

  async function handleDeleteKurs() {
    if (!deleteKurs) return;
    await LivingAppsService.deleteKurseEntry(deleteKurs.record_id);
    if (selectedKursId === deleteKurs.record_id) setSelectedKursId(null);
    setDeleteKurs(null);
    fetchAll();
  }

  async function handleDeleteAnmeldung() {
    if (!deleteAnmeldung) return;
    await LivingAppsService.deleteAnmeldungenEntry(deleteAnmeldung.record_id);
    setDeleteAnmeldung(null);
    fetchAll();
  }

  async function handleToggleBezahlt(a: EnrichedAnmeldungen) {
    await LivingAppsService.updateAnmeldungenEntry(a.record_id, { bezahlt: !a.fields.bezahlt });
    fetchAll();
  }

  const getAnmeldungCountForKurs = (kursId: string) =>
    anmeldungen.filter(a => extractRecordId(a.fields.kurs) === kursId).length;

  const getFillRate = (k: EnrichedKurse) => {
    const max = k.fields.maximale_teilnehmer ?? 0;
    const count = getAnmeldungCountForKurs(k.record_id);
    if (!max) return null;
    return Math.min(100, Math.round((count / max) * 100));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kursübersicht</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {enrichedKurse.length} Kurse · {anmeldungen.length} Anmeldungen
          </p>
        </div>
        <Button onClick={() => { setEditKurs(null); setKursDialogOpen(true); }} className="gap-2">
          <Plus size={16} /> Kurs erstellen
        </Button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Kurse"
          value={String(kurse.length)}
          description="Gesamt"
          icon={<BookOpen size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Dozenten"
          value={String(dozenten.length)}
          description="Aktiv"
          icon={<GraduationCap size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Teilnehmer"
          value={String(anmeldungen.length)}
          description={`${stats.bezahltCount} bezahlt`}
          icon={<Users size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Einnahmen"
          value={formatCurrency(stats.totalEinnahmen)}
          description="Bezahlte Anmeldungen"
          icon={<Euro size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Main layout: Course list + Detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[500px]">
        {/* Course list */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          {upcomingKurse.length === 0 && pastKurse.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 rounded-2xl border-2 border-dashed border-border text-muted-foreground gap-3">
              <BookOpen size={32} className="opacity-30" />
              <p className="text-sm">Noch keine Kurse. Erstelle den ersten!</p>
              <Button variant="outline" size="sm" onClick={() => { setEditKurs(null); setKursDialogOpen(true); }}>
                <Plus size={14} className="mr-1" /> Kurs erstellen
              </Button>
            </div>
          )}

          {upcomingKurse.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Aktuelle & Kommende Kurse
              </p>
              {upcomingKurse.map(k => (
                <KursCard
                  key={k.record_id}
                  kurs={k}
                  anmeldungCount={getAnmeldungCountForKurs(k.record_id)}
                  fillRate={getFillRate(k)}
                  isSelected={selectedKursId === k.record_id}
                  onSelect={() => setSelectedKursId(prev => prev === k.record_id ? null : k.record_id)}
                  onEdit={() => { setEditKurs(k); setKursDialogOpen(true); }}
                  onDelete={() => setDeleteKurs(k)}
                />
              ))}
            </div>
          )}

          {pastKurse.length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Abgeschlossene Kurse
              </p>
              {pastKurse.map(k => (
                <KursCard
                  key={k.record_id}
                  kurs={k}
                  anmeldungCount={getAnmeldungCountForKurs(k.record_id)}
                  fillRate={getFillRate(k)}
                  isSelected={selectedKursId === k.record_id}
                  faded
                  onSelect={() => setSelectedKursId(prev => prev === k.record_id ? null : k.record_id)}
                  onEdit={() => { setEditKurs(k); setKursDialogOpen(true); }}
                  onDelete={() => setDeleteKurs(k)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {!selectedKurs ? (
            <div className="h-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground gap-2">
              <ChevronRight size={28} className="opacity-20" />
              <p className="text-sm">Kurs auswählen, um Anmeldungen zu sehen</p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card overflow-hidden flex flex-col h-full">
              {/* Kurs header */}
              <div className="p-5 border-b bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg leading-tight truncate">{selectedKurs.fields.titel ?? '—'}</h2>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-sm text-muted-foreground">
                      {selectedKurs.dozentName && (
                        <span className="flex items-center gap-1">
                          <GraduationCap size={13} />
                          {selectedKurs.dozentName}
                        </span>
                      )}
                      {selectedKurs.raumName && (
                        <span className="flex items-center gap-1">
                          <CalendarDays size={13} />
                          {selectedKurs.raumName}
                        </span>
                      )}
                      {selectedKurs.fields.preis != null && (
                        <span className="flex items-center gap-1">
                          <Euro size={13} />
                          {formatCurrency(selectedKurs.fields.preis)}
                        </span>
                      )}
                    </div>
                    {(selectedKurs.fields.startdatum || selectedKurs.fields.enddatum) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock size={12} />
                        {formatDate(selectedKurs.fields.startdatum)} – {formatDate(selectedKurs.fields.enddatum)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditKurs(selectedKurs); setKursDialogOpen(true); }}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteKurs(selectedKurs)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Fill rate bar */}
                {selectedKurs.fields.maximale_teilnehmer != null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{kursAnmeldungen.length} / {selectedKurs.fields.maximale_teilnehmer} Teilnehmer</span>
                      <span>{getFillRate(selectedKurs)}% belegt</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${getFillRate(selectedKurs) ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Anmeldungen list */}
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <p className="text-sm font-semibold">Anmeldungen ({kursAnmeldungen.length})</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => { setEditAnmeldung(null); setAnmeldungDialogOpen(true); }}
                >
                  <Plus size={12} /> Anmeldung
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y">
                {kursAnmeldungen.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Users size={24} className="opacity-20" />
                    <p className="text-sm">Noch keine Anmeldungen</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => { setEditAnmeldung(null); setAnmeldungDialogOpen(true); }}
                    >
                      <Plus size={12} className="mr-1" /> Erste Anmeldung erstellen
                    </Button>
                  </div>
                )}
                {kursAnmeldungen.map(a => (
                  <div key={a.record_id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group">
                    <button
                      onClick={() => handleToggleBezahlt(a)}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title={a.fields.bezahlt ? 'Als unbezahlt markieren' : 'Als bezahlt markieren'}
                    >
                      {a.fields.bezahlt
                        ? <CheckCircle2 size={18} className="text-primary" />
                        : <Circle size={18} />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.teilnehmerName || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.fields.anmeldedatum)}
                        {a.fields.bezahlt && (
                          <Badge variant="secondary" className="ml-2 text-xs py-0 h-4">Bezahlt</Badge>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditAnmeldung(a); setAnmeldungDialogOpen(true); }}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setDeleteAnmeldung(a)}
                      >
                        <Trash2 size={13} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <KurseDialog
        open={kursDialogOpen}
        onClose={() => { setKursDialogOpen(false); setEditKurs(null); }}
        onSubmit={async (fields) => {
          if (editKurs) {
            await LivingAppsService.updateKurseEntry(editKurs.record_id, fields);
          } else {
            await LivingAppsService.createKurseEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editKurs?.fields}
        dozentenList={dozenten}
        raeumeList={raeume}
        enablePhotoScan={AI_PHOTO_SCAN['Kurse']}
      />

      <AnmeldungenDialog
        open={anmeldungDialogOpen}
        onClose={() => { setAnmeldungDialogOpen(false); setEditAnmeldung(null); }}
        onSubmit={async (fields) => {
          if (editAnmeldung) {
            await LivingAppsService.updateAnmeldungenEntry(editAnmeldung.record_id, fields);
          } else {
            // Pre-fill the kurs field
            const kursUrl = selectedKursId
              ? createRecordUrl(APP_IDS.KURSE, selectedKursId)
              : undefined;
            await LivingAppsService.createAnmeldungenEntry({ ...fields, kurs: kursUrl ?? fields.kurs });
          }
          fetchAll();
        }}
        defaultValues={
          editAnmeldung
            ? editAnmeldung.fields
            : selectedKursId
              ? { kurs: createRecordUrl(APP_IDS.KURSE, selectedKursId) }
              : undefined
        }
        teilnehmerList={teilnehmer}
        kurseList={kurse}
        enablePhotoScan={AI_PHOTO_SCAN['Anmeldungen']}
      />

      <ConfirmDialog
        open={!!deleteKurs}
        title="Kurs löschen"
        description={`Soll der Kurs "${deleteKurs?.fields.titel}" wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`}
        onConfirm={handleDeleteKurs}
        onClose={() => setDeleteKurs(null)}
      />

      <ConfirmDialog
        open={!!deleteAnmeldung}
        title="Anmeldung löschen"
        description={`Soll die Anmeldung von "${deleteAnmeldung?.teilnehmerName}" wirklich gelöscht werden?`}
        onConfirm={handleDeleteAnmeldung}
        onClose={() => setDeleteAnmeldung(null)}
      />
    </div>
  );
}

interface KursCardProps {
  kurs: EnrichedKurse;
  anmeldungCount: number;
  fillRate: number | null;
  isSelected: boolean;
  faded?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function KursCard({ kurs, anmeldungCount, fillRate, isSelected, faded, onSelect, onEdit, onDelete }: KursCardProps) {
  return (
    <div
      className={`rounded-2xl border transition-all cursor-pointer group ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
      } ${faded ? 'opacity-60' : ''}`}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate leading-tight">
              {kurs.fields.titel ?? '—'}
            </h3>
            {kurs.dozentName && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{kurs.dozentName}</p>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
              <Pencil size={11} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete}>
              <Trash2 size={11} className="text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {anmeldungCount}
              {kurs.fields.maximale_teilnehmer ? `/${kurs.fields.maximale_teilnehmer}` : ''}
            </span>
            {kurs.fields.startdatum && (
              <span className="flex items-center gap-1">
                <CalendarDays size={11} />
                {formatDate(kurs.fields.startdatum)}
              </span>
            )}
          </div>
          {kurs.fields.preis != null && (
            <span className="text-xs font-semibold text-primary">{formatCurrency(kurs.fields.preis)}</span>
          )}
        </div>

        {fillRate !== null && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  fillRate >= 90 ? 'bg-destructive' : fillRate >= 70 ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${fillRate}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="lg:col-span-3 h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>Erneut versuchen</Button>
    </div>
  );
}
