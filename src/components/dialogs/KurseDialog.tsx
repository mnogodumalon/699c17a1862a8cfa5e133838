import { useState, useEffect, useRef } from 'react';
import type { Kurse, Dozenten, Raeume } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Camera, Loader2 } from 'lucide-react';
import { extractFromPhoto, fileToDataUri } from '@/lib/ai';

interface KurseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Kurse['fields']) => Promise<void>;
  defaultValues?: Kurse['fields'];
  dozentenList: Dozenten[];
  raeumeList: Raeume[];
  enablePhotoScan?: boolean;
}

export function KurseDialog({ open, onClose, onSubmit, defaultValues, dozentenList, raeumeList, enablePhotoScan = false }: KurseDialogProps) {
  const [fields, setFields] = useState<Partial<Kurse['fields']>>({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setFields(defaultValues ?? {});
  }, [open, defaultValues]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(fields as Kurse['fields']);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoScan(file: File) {
    setScanning(true);
    try {
      const uri = await fileToDataUri(file);
      const schema = `{\n  "titel": string | null, // Kurstitel\n  "beschreibung": string | null, // Beschreibung\n  "startdatum": string | null, // YYYY-MM-DD // Startdatum\n  "enddatum": string | null, // YYYY-MM-DD // Enddatum\n  "maximale_teilnehmer": number | null, // Maximale Teilnehmerzahl\n  "preis": number | null, // Preis (in Euro)\n  "dozent": string | null, // Vor- und Nachname (z.B. "Jonas Schmidt")\n  "raum": string | null, // Name des Räume-Eintrags (z.B. "Jonas Schmidt")\n}`;
      const raw = await extractFromPhoto<Record<string, unknown>>(uri, schema);
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["dozent", "raum"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null && (merged[k] == null || merged[k] === '')) merged[k] = v;
        }
        const dozentName = raw['dozent'] as string | null;
        if (dozentName && !merged['dozent']) {
          const dozentMatch = dozentenList.find(r => matchName(dozentName!, [[r.fields.vorname ?? '', r.fields.nachname ?? ''].filter(Boolean).join(' ')]));
          if (dozentMatch) merged['dozent'] = createRecordUrl(APP_IDS.DOZENTEN, dozentMatch.record_id);
        }
        const raumName = raw['raum'] as string | null;
        if (raumName && !merged['raum']) {
          const raumMatch = raeumeList.find(r => matchName(raumName!, [String(r.fields.raumname ?? '')]));
          if (raumMatch) merged['raum'] = createRecordUrl(APP_IDS.RAEUME, raumMatch.record_id);
        }
        return merged as Partial<Kurse['fields']>;
      });
    } catch (err) {
      console.error('Scan fehlgeschlagen:', err);
    } finally {
      setScanning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{defaultValues ? 'Kurse bearbeiten' : 'Kurse hinzufügen'}</DialogTitle>
            {enablePhotoScan && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoScan(f);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" disabled={scanning} onClick={() => fileInputRef.current?.click()}>
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
                  {scanning ? 'Wird erkannt...' : 'Foto scannen'}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titel">Kurstitel</Label>
            <Input
              id="titel"
              value={fields.titel ?? ''}
              onChange={e => setFields(f => ({ ...f, titel: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="beschreibung">Beschreibung</Label>
            <Textarea
              id="beschreibung"
              value={fields.beschreibung ?? ''}
              onChange={e => setFields(f => ({ ...f, beschreibung: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startdatum">Startdatum</Label>
            <Input
              id="startdatum"
              type="date"
              value={fields.startdatum ?? ''}
              onChange={e => setFields(f => ({ ...f, startdatum: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="enddatum">Enddatum</Label>
            <Input
              id="enddatum"
              type="date"
              value={fields.enddatum ?? ''}
              onChange={e => setFields(f => ({ ...f, enddatum: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maximale_teilnehmer">Maximale Teilnehmerzahl</Label>
            <Input
              id="maximale_teilnehmer"
              type="number"
              value={fields.maximale_teilnehmer ?? ''}
              onChange={e => setFields(f => ({ ...f, maximale_teilnehmer: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preis">Preis (in Euro)</Label>
            <Input
              id="preis"
              type="number"
              value={fields.preis ?? ''}
              onChange={e => setFields(f => ({ ...f, preis: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dozent">Dozent</Label>
            <Select
              value={extractRecordId(fields.dozent) ?? 'none'}
              onValueChange={v => setFields(f => ({ ...f, dozent: v === 'none' ? undefined : createRecordUrl(APP_IDS.DOZENTEN, v) }))}
            >
              <SelectTrigger id="dozent"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {dozentenList.map(r => (
                  <SelectItem key={r.record_id} value={r.record_id}>
                    {r.fields.vorname ?? r.record_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="raum">Raum</Label>
            <Select
              value={extractRecordId(fields.raum) ?? 'none'}
              onValueChange={v => setFields(f => ({ ...f, raum: v === 'none' ? undefined : createRecordUrl(APP_IDS.RAEUME, v) }))}
            >
              <SelectTrigger id="raum"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {raeumeList.map(r => (
                  <SelectItem key={r.record_id} value={r.record_id}>
                    {r.fields.raumname ?? r.record_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Speichern...' : defaultValues ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}