import { useState, useEffect, useRef } from 'react';
import type { Anmeldungen, Teilnehmer, Kurse } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Camera, Loader2 } from 'lucide-react';
import { extractFromPhoto, fileToDataUri } from '@/lib/ai';

interface AnmeldungenDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Anmeldungen['fields']) => Promise<void>;
  defaultValues?: Anmeldungen['fields'];
  teilnehmerList: Teilnehmer[];
  kurseList: Kurse[];
  enablePhotoScan?: boolean;
}

export function AnmeldungenDialog({ open, onClose, onSubmit, defaultValues, teilnehmerList, kurseList, enablePhotoScan = false }: AnmeldungenDialogProps) {
  const [fields, setFields] = useState<Partial<Anmeldungen['fields']>>({});
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
      await onSubmit(fields as Anmeldungen['fields']);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoScan(file: File) {
    setScanning(true);
    try {
      const uri = await fileToDataUri(file);
      const schema = `{\n  "teilnehmer": string | null, // Vor- und Nachname (z.B. "Jonas Schmidt")\n  "kurs": string | null, // Name des Kurse-Eintrags (z.B. "Jonas Schmidt")\n  "anmeldedatum": string | null, // YYYY-MM-DD // Anmeldedatum\n  "bezahlt": boolean | null, // Bezahlt\n}`;
      const raw = await extractFromPhoto<Record<string, unknown>>(uri, schema);
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["teilnehmer", "kurs"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null && (merged[k] == null || merged[k] === '')) merged[k] = v;
        }
        const teilnehmerName = raw['teilnehmer'] as string | null;
        if (teilnehmerName && !merged['teilnehmer']) {
          const teilnehmerMatch = teilnehmerList.find(r => matchName(teilnehmerName!, [[r.fields.vorname ?? '', r.fields.nachname ?? ''].filter(Boolean).join(' ')]));
          if (teilnehmerMatch) merged['teilnehmer'] = createRecordUrl(APP_IDS.TEILNEHMER, teilnehmerMatch.record_id);
        }
        const kursName = raw['kurs'] as string | null;
        if (kursName && !merged['kurs']) {
          const kursMatch = kurseList.find(r => matchName(kursName!, [String(r.fields.titel ?? '')]));
          if (kursMatch) merged['kurs'] = createRecordUrl(APP_IDS.KURSE, kursMatch.record_id);
        }
        return merged as Partial<Anmeldungen['fields']>;
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
            <DialogTitle>{defaultValues ? 'Anmeldungen bearbeiten' : 'Anmeldungen hinzufügen'}</DialogTitle>
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
            <Label htmlFor="teilnehmer">Teilnehmer</Label>
            <Select
              value={extractRecordId(fields.teilnehmer) ?? 'none'}
              onValueChange={v => setFields(f => ({ ...f, teilnehmer: v === 'none' ? undefined : createRecordUrl(APP_IDS.TEILNEHMER, v) }))}
            >
              <SelectTrigger id="teilnehmer"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {teilnehmerList.map(r => (
                  <SelectItem key={r.record_id} value={r.record_id}>
                    {r.fields.vorname ?? r.record_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kurs">Kurs</Label>
            <Select
              value={extractRecordId(fields.kurs) ?? 'none'}
              onValueChange={v => setFields(f => ({ ...f, kurs: v === 'none' ? undefined : createRecordUrl(APP_IDS.KURSE, v) }))}
            >
              <SelectTrigger id="kurs"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {kurseList.map(r => (
                  <SelectItem key={r.record_id} value={r.record_id}>
                    {r.fields.titel ?? r.record_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="anmeldedatum">Anmeldedatum</Label>
            <Input
              id="anmeldedatum"
              type="date"
              value={fields.anmeldedatum ?? ''}
              onChange={e => setFields(f => ({ ...f, anmeldedatum: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bezahlt">Bezahlt</Label>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="bezahlt"
                checked={!!fields.bezahlt}
                onCheckedChange={(v) => setFields(f => ({ ...f, bezahlt: !!v }))}
              />
              <Label htmlFor="bezahlt" className="font-normal">Bezahlt</Label>
            </div>
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