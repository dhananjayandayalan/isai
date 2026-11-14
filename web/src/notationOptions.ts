// The note-name choices as the Devices and Practice screens list them.

import type { Notation } from './theory/labels';

export const NOTATION_OPTIONS: readonly { id: Notation; label: string }[] = [
  { id: 'letters', label: 'Letters (C D E)' },
  { id: 'solfege', label: 'Solfège (Do Re Mi)' },
  { id: 'swaras', label: 'Swaras (Sa Ri Ga)' },
  { id: 'roman', label: 'Roman numerals' },
  { id: 'staff', label: 'Staff' },
];
