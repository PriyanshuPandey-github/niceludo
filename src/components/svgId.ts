import { useId } from 'react';

/**
 * react-native-svg resolves `url(#id)` references by plain string match, so
 * two mounted components using the same gradient id would fight over it.
 * Every component that declares <Defs> pulls its prefix from here.
 */
export const useSvgId = (name: string): string => {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  return `${name}${raw}`;
};
