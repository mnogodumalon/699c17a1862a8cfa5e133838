import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichKurse, enrichAnmeldungen } from '@/lib/enrich';
import type { EnrichedKurse } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BookOpen, Users, GraduationCap, DoorOpen, Plus, Pencil, Trash2, CheckCircle, Clock, ChevronRight, X, UserPlus, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KurseDialog } from '@/components/dialogs/KurseDialog';
import { AnmeldungenDialog } from '@/components/dialogs/AnmeldungenDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';

export default function DashboardOverview() {
  const {
    raeume, dozenten, kurse, teilnehmer, anmeldungen,
    raeumeMap, dozentenMap, kurseMap, teilnehmerMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedKurse = enrichKurse(kurse, { dozentenMap, raeumeMap });
  const enrichedAnmeldungen = enrichAnmeldungen(anmeldungen, { teilnehmerMap, kurseMap });

  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [kursDialogOpen, setKursDialogOpen] = useState(false);
  const [editKurs, setEditKurs] = useState<EnrichedKurse | null>(null);
  const [deleteKursId, setDeleteKursId] = useState<string | null>(null);
  const [anmeldungDialogOpen, setAnmeldungDialogOpen] = useState(false);
  const [deleteAnmeldungId, setDeleteAnmeldungId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'full' | 'past'>('all');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getKursStatus = (kurs: EnrichedKurse) => {
    const anmeldungenForKurs = anmeldungen.filter(a => {
      const id = extractRecordId(a.fields.kurs);
      return id === kurs.record_id;
    });
    const count = anmeldungenForKurs.length;
    const max = kurs.fields.maximale_teilnehmer ?? 0;
    const endDate = kurs.fields.enddatum ? new Date(kurs.fields.enddatum) : null;
    const isPast = endDate ? endDate < today : false;
    const isFull = max > 0 && count >= max;
    return { count, max, isPast, isFull };
  };

  const filteredKurse = useMemo(() => {
    return enrichedKurse.filter(k => {
      const { isPast, isFull } = getKursStatus(k);
      if (filterStatus === 'active') return !isPast && !isFull;
      if (filterStatus === 'full') return isFull && !isPast;
      if (filterStatus === 'past') return isPast;
      return true;
    });
  }, [enrichedKurse, anmeldungen, filterStatus]);

  const selectedKurs = enrichedKurse.find(k => k.record_id === selectedKursId) ?? null;
  const selectedKursAnmeldungen = enrichedAnmeldungen.filter(a => {
    const id = extractRecordId(a.fields.kurs);
    return id === selectedKursId;
  });

  const totalRevenue = useMemo(() => {
    return anmeldungen.reduce((sum, a) => {
      const id = extractRecordId(a.fields.kurs);
      if (!id) return sum;
      const kurs = kurseMap.get(id);
      return sum + (kurs?.fields.preis ?? 0);
    }, 0);
  }, [anmeldungen, kurseMap]);

  const paidCount = anmeldungen.filter(a => a.fields.bezahlt).length;
  const activeKurse = enrichedKurse.filter(k => {
    const { isPast } = getKursStatus(k);
    return !isPast;
  }).length;

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Kursübersicht</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Klicken Sie einen Kurs an, um Anmeldungen zu verwalten</p>
        </div>
        <Button
          onClick={() => { setEditKurs(null); setKursDialogOpen(true); }}
          className="shrink-0"
        >
          <Plus size={16} className="mr-2" />
          Neuer Kurs
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Aktive Kurse"
          value={String(activeKurse)}
          description={`von ${kurse.length} gesamt`}
          icon={<BookOpen size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Anmeldungen"
          value={String(anmeldungen.length)}
          description={`${paidCount} bezahlt`}
          icon={<Users size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Dozenten"
          value={String(dozenten.length)}
          description="registriert"
          icon={<GraduationCap size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Umsatz"
          value={formatCurrency(totalRevenue)}
          description="aus Anmeldungen"
          icon={<Euro size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'full', 'past'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filterStatus === status
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {status === 'all' && 'Alle Kurse'}
            {status === 'active' && 'Verfügbar'}
            {status === 'full' && 'Ausgebucht'}
            {status === 'past' && 'Abgeschlossen'}
          </button>
        ))}
      </div>

      {/* Main workspace: Course cards + Detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course Cards */}
        <div className={`${selectedKursId ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-3`}>
          {filteredKurse.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
              <BookOpen size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Keine Kurse gefunden</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Legen Sie einen neuen Kurs an</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { setEditKurs(null); setKursDialogOpen(true); }}
              >
                <Plus size={14} className="mr-1.5" />
                Kurs erstellen
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredKurse.map(kurs => {
                const { count, max, isPast, isFull } = getKursStatus(kurs);
                const fillPct = max > 0 ? Math.min((count / max) * 100, 100) : 0;
                const isSelected = selectedKursId === kurs.record_id;

                return (
                  <div
                    key={kurs.record_id}
                    onClick={() => setSelectedKursId(isSelected ? null : kurs.record_id)}
                    className={`group relative rounded-2xl border bg-card p-4 cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-primary shadow-md ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {/* Status badge */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate pr-2">
                          {kurs.fields.titel ?? '(Kein Titel)'}
                        </h3>
                        {kurs.dozentName && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{kurs.dozentName}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {isPast ? (
                          <Badge variant="secondary" className="text-xs">Abgeschlossen</Badge>
                        ) : isFull ? (
                          <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20">Ausgebucht</Badge>
                        ) : (
                          <Badge className="text-xs bg-green-500/10 text-green-700 border-green-500/20">Verfügbar</Badge>
                        )}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDate(kurs.fields.startdatum)}
                      </span>
                      {kurs.fields.enddatum && (
                        <>
                          <span>→</span>
                          <span>{formatDate(kurs.fields.enddatum)}</span>
                        </>
                      )}
                    </div>

                    {/* Capacity bar */}
                    {max > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{count} Anmeldungen</span>
                          <span>max. {max}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              fillPct >= 100 ? 'bg-destructive' :
                              fillPct >= 80 ? 'bg-orange-500' :
                              'bg-primary'
                            }`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer: price + room + actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {kurs.fields.preis != null && (
                          <span className="font-medium text-foreground">{formatCurrency(kurs.fields.preis)}</span>
                        )}
                        {kurs.raumName && (
                          <span className="flex items-center gap-1">
                            <DoorOpen size={11} />
                            {kurs.raumName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); setEditKurs(kurs); setKursDialogOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Bearbeiten"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteKursId(kurs.record_id); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Löschen"
                        >
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel: Anmeldungen for selected course */}
        {selectedKurs && (
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-border bg-card overflow-hidden sticky top-4">
              {/* Panel header */}
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-foreground truncate">{selectedKurs.fields.titel}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedKursAnmeldungen.length} Anmeldungen
                      {selectedKurs.fields.maximale_teilnehmer
                        ? ` / ${selectedKurs.fields.maximale_teilnehmer} max.`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedKursId(null)}
                    className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Kurs info */}
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {selectedKurs.dozentName && (
                    <div className="flex items-center gap-1.5">
                      <GraduationCap size={12} />
                      <span>{selectedKurs.dozentName}</span>
                    </div>
                  )}
                  {selectedKurs.raumName && (
                    <div className="flex items-center gap-1.5">
                      <DoorOpen size={12} />
                      <span>{selectedKurs.raumName}</span>
                    </div>
                  )}
                  {(selectedKurs.fields.startdatum || selectedKurs.fields.enddatum) && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} />
                      <span>
                        {formatDate(selectedKurs.fields.startdatum)}
                        {selectedKurs.fields.enddatum && ` – ${formatDate(selectedKurs.fields.enddatum)}`}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setAnmeldungDialogOpen(true)}
                >
                  <UserPlus size={14} className="mr-1.5" />
                  Anmeldung hinzufügen
                </Button>
              </div>

              {/* Participants list */}
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {selectedKursAnmeldungen.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Users size={28} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Noch keine Anmeldungen</p>
                  </div>
                ) : (
                  selectedKursAnmeldungen.map(a => (
                    <div key={a.record_id} className="px-4 py-3 flex items-center justify-between group hover:bg-accent/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {a.teilnehmerName || '(Kein Name)'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {a.fields.anmeldedatum && (
                            <span className="text-xs text-muted-foreground">{formatDate(a.fields.anmeldedatum)}</span>
                          )}
                          {a.fields.bezahlt ? (
                            <span className="flex items-center gap-0.5 text-xs text-green-700">
                              <CheckCircle size={11} />
                              Bezahlt
                            </span>
                          ) : (
                            <span className="text-xs text-orange-600">Offen</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteAnmeldungId(a.record_id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        title="Anmeldung entfernen"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
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
        onClose={() => setAnmeldungDialogOpen(false)}
        onSubmit={async (fields) => {
          await LivingAppsService.createAnmeldungenEntry(fields);
          fetchAll();
        }}
        defaultValues={selectedKursId ? { kurs: createRecordUrl(APP_IDS.KURSE, selectedKursId) } : undefined}
        teilnehmerList={teilnehmer}
        kurseList={kurse}
        enablePhotoScan={AI_PHOTO_SCAN['Anmeldungen']}
      />

      <ConfirmDialog
        open={!!deleteKursId}
        title="Kurs löschen"
        description="Soll dieser Kurs wirklich gelöscht werden? Alle zugehörigen Anmeldungen bleiben erhalten."
        onConfirm={async () => {
          if (deleteKursId) {
            await LivingAppsService.deleteKurseEntry(deleteKursId);
            if (selectedKursId === deleteKursId) setSelectedKursId(null);
            fetchAll();
          }
          setDeleteKursId(null);
        }}
        onClose={() => setDeleteKursId(null)}
      />

      <ConfirmDialog
        open={!!deleteAnmeldungId}
        title="Anmeldung entfernen"
        description="Soll diese Anmeldung wirklich entfernt werden?"
        onConfirm={async () => {
          if (deleteAnmeldungId) {
            await LivingAppsService.deleteAnmeldungenEntry(deleteAnmeldungId);
            fetchAll();
          }
          setDeleteAnmeldungId(null);
        }}
        onClose={() => setDeleteAnmeldungId(null)}
      />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
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
