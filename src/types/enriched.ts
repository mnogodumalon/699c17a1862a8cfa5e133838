import type { Anmeldungen, Kurse } from './app';

export type EnrichedKurse = Kurse & {
  dozentName: string;
  raumName: string;
};

export type EnrichedAnmeldungen = Anmeldungen & {
  teilnehmerName: string;
  kursName: string;
};
