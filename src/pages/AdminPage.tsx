import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kurse, Raeume, Dozenten, Teilnehmer, Anmeldungen } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { displayLookup, displayMultiLookup } from '@/lib/formatters';
import { KurseDialog } from '@/components/dialogs/KurseDialog';
import { RaeumeDialog } from '@/components/dialogs/RaeumeDialog';
import { DozentenDialog } from '@/components/dialogs/DozentenDialog';
import { TeilnehmerDialog } from '@/components/dialogs/TeilnehmerDialog';
import { AnmeldungenDialog } from '@/components/dialogs/AnmeldungenDialog';
import { BulkEditDialog } from '@/components/dialogs/BulkEditDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Trash2, Plus, Filter, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

// Field metadata per entity for bulk edit and column filters
const KURSE_FIELDS = [
  { key: 'titel', label: 'Kurstitel', type: 'string/text' },
  { key: 'beschreibung', label: 'Beschreibung', type: 'string/textarea' },
  { key: 'startdatum', label: 'Startdatum', type: 'date/date' },
  { key: 'enddatum', label: 'Enddatum', type: 'date/date' },
  { key: 'maximale_teilnehmer', label: 'Maximale Teilnehmerzahl', type: 'number' },
  { key: 'preis', label: 'Preis (in Euro)', type: 'number' },
  { key: 'dozent', label: 'Dozent', type: 'applookup/select', targetEntity: 'dozenten', targetAppId: 'DOZENTEN', displayField: 'vorname' },
  { key: 'raum', label: 'Raum', type: 'applookup/select', targetEntity: 'raeume', targetAppId: 'RAEUME', displayField: 'raumname' },
];
const RAEUME_FIELDS = [
  { key: 'raumname', label: 'Raumname', type: 'string/text' },
  { key: 'gebaeude', label: 'Gebäude', type: 'string/text' },
  { key: 'kapazitaet', label: 'Kapazität', type: 'number' },
];
const DOZENTEN_FIELDS = [
  { key: 'vorname', label: 'Vorname', type: 'string/text' },
  { key: 'nachname', label: 'Nachname', type: 'string/text' },
  { key: 'email', label: 'E-Mail', type: 'string/email' },
  { key: 'telefon', label: 'Telefon', type: 'string/tel' },
  { key: 'fachgebiet', label: 'Fachgebiet', type: 'string/text' },
];
const TEILNEHMER_FIELDS = [
  { key: 'vorname', label: 'Vorname', type: 'string/text' },
  { key: 'nachname', label: 'Nachname', type: 'string/text' },
  { key: 'geburtsdatum', label: 'Geburtsdatum', type: 'date/date' },
  { key: 'email', label: 'E-Mail', type: 'string/email' },
  { key: 'telefon', label: 'Telefon', type: 'string/tel' },
];
const ANMELDUNGEN_FIELDS = [
  { key: 'teilnehmer', label: 'Teilnehmer', type: 'applookup/select', targetEntity: 'teilnehmer', targetAppId: 'TEILNEHMER', displayField: 'vorname' },
  { key: 'kurs', label: 'Kurs', type: 'applookup/select', targetEntity: 'kurse', targetAppId: 'KURSE', displayField: 'titel' },
  { key: 'anmeldedatum', label: 'Anmeldedatum', type: 'date/date' },
  { key: 'bezahlt', label: 'Bezahlt', type: 'bool' },
];

const ENTITY_TABS = [
  { key: 'kurse', label: 'Kurse', pascal: 'Kurse' },
  { key: 'raeume', label: 'Räume', pascal: 'Raeume' },
  { key: 'dozenten', label: 'Dozenten', pascal: 'Dozenten' },
  { key: 'teilnehmer', label: 'Teilnehmer', pascal: 'Teilnehmer' },
  { key: 'anmeldungen', label: 'Anmeldungen', pascal: 'Anmeldungen' },
] as const;

type EntityKey = typeof ENTITY_TABS[number]['key'];

export default function AdminPage() {
  const data = useDashboardData();
  const { loading, error, fetchAll } = data;

  const [activeTab, setActiveTab] = useState<EntityKey>('kurse');
  const [selectedIds, setSelectedIds] = useState<Record<EntityKey, Set<string>>>(() => ({
    kurse: new Set(),
    raeume: new Set(),
    dozenten: new Set(),
    teilnehmer: new Set(),
    anmeldungen: new Set(),
  }));
  const [filters, setFilters] = useState<Record<EntityKey, Record<string, string>>>(() => ({
    kurse: {},
    raeume: {},
    dozenten: {},
    teilnehmer: {},
    anmeldungen: {},
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [dialogState, setDialogState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [createEntity, setCreateEntity] = useState<EntityKey | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<{ entity: EntityKey; ids: string[] } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState<EntityKey | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const getRecords = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'kurse': return (data as any).kurse as Kurse[] ?? [];
      case 'raeume': return (data as any).raeume as Raeume[] ?? [];
      case 'dozenten': return (data as any).dozenten as Dozenten[] ?? [];
      case 'teilnehmer': return (data as any).teilnehmer as Teilnehmer[] ?? [];
      case 'anmeldungen': return (data as any).anmeldungen as Anmeldungen[] ?? [];
      default: return [];
    }
  }, [data]);

  const getLookupLists = useCallback((entity: EntityKey) => {
    const lists: Record<string, any[]> = {};
    switch (entity) {
      case 'kurse':
        lists.dozentenList = (data as any).dozenten ?? [];
        lists.raeumeList = (data as any).raeume ?? [];
        break;
      case 'anmeldungen':
        lists.teilnehmerList = (data as any).teilnehmer ?? [];
        lists.kurseList = (data as any).kurse ?? [];
        break;
    }
    return lists;
  }, [data]);

  const getApplookupDisplay = useCallback((entity: EntityKey, fieldKey: string, url?: unknown) => {
    if (!url) return '—';
    const id = extractRecordId(url);
    if (!id) return '—';
    const lists = getLookupLists(entity);
    if (entity === 'kurse' && fieldKey === 'dozent') {
      const match = (lists.dozentenList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'kurse' && fieldKey === 'raum') {
      const match = (lists.raeumeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.raumname ?? '—';
    }
    if (entity === 'anmeldungen' && fieldKey === 'teilnehmer') {
      const match = (lists.teilnehmerList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'anmeldungen' && fieldKey === 'kurs') {
      const match = (lists.kurseList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.titel ?? '—';
    }
    return url;
  }, [getLookupLists]);

  const getFieldMeta = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'kurse': return KURSE_FIELDS;
      case 'raeume': return RAEUME_FIELDS;
      case 'dozenten': return DOZENTEN_FIELDS;
      case 'teilnehmer': return TEILNEHMER_FIELDS;
      case 'anmeldungen': return ANMELDUNGEN_FIELDS;
      default: return [];
    }
  }, []);

  const getFilteredRecords = useCallback((entity: EntityKey) => {
    const records = getRecords(entity);
    const entityFilters = filters[entity] ?? {};
    const fieldMeta = getFieldMeta(entity);
    return records.filter((r: any) => {
      return fieldMeta.every((fm: any) => {
        const fv = entityFilters[fm.key];
        if (!fv || fv === '') return true;
        const val = r.fields?.[fm.key];
        if (fm.type === 'bool') {
          if (fv === 'true') return val === true;
          if (fv === 'false') return val !== true;
          return true;
        }
        if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
          const label = val && typeof val === 'object' && 'label' in val ? val.label : '';
          return String(label).toLowerCase().includes(fv.toLowerCase());
        }
        if (fm.type.includes('multiplelookup')) {
          if (!Array.isArray(val)) return false;
          return val.some((item: any) => String(item?.label ?? '').toLowerCase().includes(fv.toLowerCase()));
        }
        if (fm.type.includes('applookup')) {
          const display = getApplookupDisplay(entity, fm.key, val);
          return String(display).toLowerCase().includes(fv.toLowerCase());
        }
        return String(val ?? '').toLowerCase().includes(fv.toLowerCase());
      });
    });
  }, [getRecords, filters, getFieldMeta, getApplookupDisplay]);

  const toggleSelect = useCallback((entity: EntityKey, id: string) => {
    setSelectedIds(prev => {
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (next[entity].has(id)) next[entity].delete(id);
      else next[entity].add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((entity: EntityKey) => {
    const filtered = getFilteredRecords(entity);
    setSelectedIds(prev => {
      const allSelected = filtered.every((r: any) => prev[entity].has(r.record_id));
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (allSelected) {
        filtered.forEach((r: any) => next[entity].delete(r.record_id));
      } else {
        filtered.forEach((r: any) => next[entity].add(r.record_id));
      }
      return next;
    });
  }, [getFilteredRecords]);

  const clearSelection = useCallback((entity: EntityKey) => {
    setSelectedIds(prev => ({ ...prev, [entity]: new Set() }));
  }, []);

  const getServiceMethods = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'kurse': return {
        create: (fields: any) => LivingAppsService.createKurseEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateKurseEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteKurseEntry(id),
      };
      case 'raeume': return {
        create: (fields: any) => LivingAppsService.createRaeumeEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateRaeumeEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteRaeumeEntry(id),
      };
      case 'dozenten': return {
        create: (fields: any) => LivingAppsService.createDozentenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateDozentenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteDozentenEntry(id),
      };
      case 'teilnehmer': return {
        create: (fields: any) => LivingAppsService.createTeilnehmerEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateTeilnehmerEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteTeilnehmerEntry(id),
      };
      case 'anmeldungen': return {
        create: (fields: any) => LivingAppsService.createAnmeldungenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateAnmeldungenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteAnmeldungenEntry(id),
      };
      default: return null;
    }
  }, []);

  async function handleCreate(entity: EntityKey, fields: any) {
    const svc = getServiceMethods(entity);
    if (!svc) return;
    await svc.create(fields);
    fetchAll();
    setCreateEntity(null);
  }

  async function handleUpdate(fields: any) {
    if (!dialogState) return;
    const svc = getServiceMethods(dialogState.entity);
    if (!svc) return;
    await svc.update(dialogState.record.record_id, fields);
    fetchAll();
    setDialogState(null);
  }

  async function handleBulkDelete() {
    if (!deleteTargets) return;
    const svc = getServiceMethods(deleteTargets.entity);
    if (!svc) return;
    setBulkLoading(true);
    try {
      for (const id of deleteTargets.ids) {
        await svc.remove(id);
      }
      clearSelection(deleteTargets.entity);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setDeleteTargets(null);
    }
  }

  async function handleBulkEdit(fieldKey: string, value: any) {
    if (!bulkEditOpen) return;
    const svc = getServiceMethods(bulkEditOpen);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds[bulkEditOpen]);
      for (const id of ids) {
        await svc.update(id, { [fieldKey]: value });
      }
      clearSelection(bulkEditOpen);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setBulkEditOpen(null);
    }
  }

  function updateFilter(entity: EntityKey, fieldKey: string, value: string) {
    setFilters(prev => ({
      ...prev,
      [entity]: { ...prev[entity], [fieldKey]: value },
    }));
  }

  function clearEntityFilters(entity: EntityKey) {
    setFilters(prev => ({ ...prev, [entity]: {} }));
  }

  const activeFilterCount = useMemo(() => {
    const f = filters[activeTab] ?? {};
    return Object.values(f).filter(v => v && v !== '').length;
  }, [filters, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-destructive">{error?.message}</p>
        <Button onClick={fetchAll}>Erneut versuchen</Button>
      </div>
    );
  }

  const filtered = getFilteredRecords(activeTab);
  const sel = selectedIds[activeTab];
  const allFiltered = filtered.every((r: any) => sel.has(r.record_id)) && filtered.length > 0;
  const fieldMeta = getFieldMeta(activeTab);

  return (
    <PageShell
      title="Verwaltung"
      subtitle="Alle Daten verwalten"
      action={
        <Button onClick={() => setCreateEntity(activeTab)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Hinzufügen
        </Button>
      }
    >
      <div className="flex gap-2 flex-wrap">
        {ENTITY_TABS.map(tab => {
          const count = getRecords(tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-2">
            <Filter className="h-4 w-4" />
            Filtern
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearEntityFilters(activeTab)}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
        {sel.size > 0 && (
          <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium">{sel.size} ausgewählt</span>
            <Button variant="destructive" size="sm" onClick={() => setDeleteTargets({ entity: activeTab, ids: Array.from(sel) })}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Ausgewählte löschen
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(activeTab)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Feld bearbeiten
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection(activeTab)}>
              <X className="h-3.5 w-3.5 mr-1" /> Auswahl aufheben
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
          {fieldMeta.map((fm: any) => (
            <div key={fm.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{fm.label}</label>
              {fm.type === 'bool' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nein</SelectItem>
                  </SelectContent>
                </Select>
              ) : fm.type === 'lookup/select' || fm.type === 'lookup/radio' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    {fm.options?.map((o: any) => (
                      <SelectItem key={o.key} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  placeholder="Filtern..."
                  value={filters[activeTab]?.[fm.key] ?? ''}
                  onChange={e => updateFilter(activeTab, fm.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allFiltered}
                  onCheckedChange={() => toggleSelectAll(activeTab)}
                />
              </TableHead>
              {fieldMeta.map((fm: any) => (
                <TableHead key={fm.key}>{fm.label}</TableHead>
              ))}
              <TableHead className="w-24">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((record: any) => (
              <TableRow key={record.record_id} className={`transition-colors ${sel.has(record.record_id) ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                <TableCell>
                  <Checkbox
                    checked={sel.has(record.record_id)}
                    onCheckedChange={() => toggleSelect(activeTab, record.record_id)}
                  />
                </TableCell>
                {fieldMeta.map((fm: any) => {
                  const val = record.fields?.[fm.key];
                  if (fm.type === 'bool') {
                    return (
                      <TableCell key={fm.key}>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          val ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {val ? 'Ja' : 'Nein'}
                        </span>
                      </TableCell>
                    );
                  }
                  if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
                    return <TableCell key={fm.key}><Badge variant="secondary">{displayLookup(val, fm.options)}</Badge></TableCell>;
                  }
                  if (fm.type.includes('multiplelookup')) {
                    return <TableCell key={fm.key}>{displayMultiLookup(val, fm.options)}</TableCell>;
                  }
                  if (fm.type.includes('applookup')) {
                    return <TableCell key={fm.key}>{getApplookupDisplay(activeTab, fm.key, val)}</TableCell>;
                  }
                  if (fm.type.includes('date')) {
                    return <TableCell key={fm.key} className="text-muted-foreground">{fmtDate(val)}</TableCell>;
                  }
                  if (fm.type.startsWith('file')) {
                    return (
                      <TableCell key={fm.key}>
                        {val ? (
                          <div className="relative h-8 w-8 rounded bg-muted overflow-hidden">
                            <img src={val} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type === 'string/textarea') {
                    return <TableCell key={fm.key} className="max-w-xs"><span className="truncate block">{val ?? '—'}</span></TableCell>;
                  }
                  return <TableCell key={fm.key}>{val ?? '—'}</TableCell>;
                })}
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDialogState({ entity: activeTab, record })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTargets({ entity: activeTab, ids: [record.record_id] })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fieldMeta.length + 2} className="text-center py-16 text-muted-foreground">
                  Keine Ergebnisse gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(createEntity === 'kurse' || dialogState?.entity === 'kurse') && (
        <KurseDialog
          open={createEntity === 'kurse' || dialogState?.entity === 'kurse'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'kurse' ? handleUpdate : (fields: any) => handleCreate('kurse', fields)}
          defaultValues={dialogState?.entity === 'kurse' ? dialogState.record?.fields : undefined}
          dozentenList={(data as any).dozenten ?? []}
          raeumeList={(data as any).raeume ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Kurse']}
        />
      )}
      {(createEntity === 'raeume' || dialogState?.entity === 'raeume') && (
        <RaeumeDialog
          open={createEntity === 'raeume' || dialogState?.entity === 'raeume'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'raeume' ? handleUpdate : (fields: any) => handleCreate('raeume', fields)}
          defaultValues={dialogState?.entity === 'raeume' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Raeume']}
        />
      )}
      {(createEntity === 'dozenten' || dialogState?.entity === 'dozenten') && (
        <DozentenDialog
          open={createEntity === 'dozenten' || dialogState?.entity === 'dozenten'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'dozenten' ? handleUpdate : (fields: any) => handleCreate('dozenten', fields)}
          defaultValues={dialogState?.entity === 'dozenten' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Dozenten']}
        />
      )}
      {(createEntity === 'teilnehmer' || dialogState?.entity === 'teilnehmer') && (
        <TeilnehmerDialog
          open={createEntity === 'teilnehmer' || dialogState?.entity === 'teilnehmer'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'teilnehmer' ? handleUpdate : (fields: any) => handleCreate('teilnehmer', fields)}
          defaultValues={dialogState?.entity === 'teilnehmer' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Teilnehmer']}
        />
      )}
      {(createEntity === 'anmeldungen' || dialogState?.entity === 'anmeldungen') && (
        <AnmeldungenDialog
          open={createEntity === 'anmeldungen' || dialogState?.entity === 'anmeldungen'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'anmeldungen' ? handleUpdate : (fields: any) => handleCreate('anmeldungen', fields)}
          defaultValues={dialogState?.entity === 'anmeldungen' ? dialogState.record?.fields : undefined}
          teilnehmerList={(data as any).teilnehmer ?? []}
          kurseList={(data as any).kurse ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Anmeldungen']}
        />
      )}

      <BulkEditDialog
        open={!!bulkEditOpen}
        onClose={() => setBulkEditOpen(null)}
        onApply={handleBulkEdit}
        fields={bulkEditOpen ? getFieldMeta(bulkEditOpen) : []}
        selectedCount={bulkEditOpen ? selectedIds[bulkEditOpen].size : 0}
        loading={bulkLoading}
        lookupLists={bulkEditOpen ? getLookupLists(bulkEditOpen) : {}}
      />

      <ConfirmDialog
        open={!!deleteTargets}
        onClose={() => setDeleteTargets(null)}
        onConfirm={handleBulkDelete}
        title="Ausgewählte löschen"
        description={`Sollen ${deleteTargets?.ids.length ?? 0} Einträge wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`}
      />
    </PageShell>
  );
}