// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export interface Raeume {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    raumname?: string;
    gebaeude?: string;
    kapazitaet?: number;
  };
}

export interface Dozenten {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    fachgebiet?: string;
  };
}

export interface Kurse {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    startdatum?: string; // Format: YYYY-MM-DD oder ISO String
    enddatum?: string; // Format: YYYY-MM-DD oder ISO String
    maximale_teilnehmer?: number;
    preis?: number;
    dozent?: string; // applookup -> URL zu 'Dozenten' Record
    raum?: string; // applookup -> URL zu 'Raeume' Record
  };
}

export interface Teilnehmer {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    geburtsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    email?: string;
    telefon?: string;
  };
}

export interface Anmeldungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    teilnehmer?: string; // applookup -> URL zu 'Teilnehmer' Record
    kurs?: string; // applookup -> URL zu 'Kurse' Record
    anmeldedatum?: string; // Format: YYYY-MM-DD oder ISO String
    bezahlt?: boolean;
  };
}

export const APP_IDS = {
  RAEUME: '699c1766cca9c5344e2d7819',
  DOZENTEN: '699c177ec08df234b58b2d12',
  KURSE: '699c1780a9124b74ba64c1a0',
  TEILNEHMER: '699c178491425c5ef83d4952',
  ANMELDUNGEN: '699c178669591607d36ae852',
} as const;

// Helper Types for creating new records
export type CreateRaeume = Raeume['fields'];
export type CreateDozenten = Dozenten['fields'];
export type CreateKurse = Kurse['fields'];
export type CreateTeilnehmer = Teilnehmer['fields'];
export type CreateAnmeldungen = Anmeldungen['fields'];