/**
 * Opponents for "online" games. There is no network: these are CPU seats
 * (played on hard) given a player-style handle and a country, so a match
 * looks like one against people elsewhere.
 */

export interface OnlineIdentity {
  name: string;
  /** ISO 3166 alpha-2 code */
  country: string;
}

/** Handles per country, in the style people pick for game accounts. */
const POOL: Record<string, string[]> = {
  IN: ['Aarav_07', 'Priya.k', 'RohanXD', 'Ishaan99', 'Ananya_s', 'VikramR'],
  PK: ['Hamza_99', 'AyeshaK', 'Bilal.pro', 'Zainab_x'],
  BD: ['Rafi_bd', 'Nusrat22', 'Tanvir.h'],
  NP: ['Suman_np', 'Aakriti.'],
  LK: ['Kasun_lk', 'Dilini.p'],
  US: ['jake_w', 'EmilyRose', 'TylerPlays', 'mads.k'],
  GB: ['Oliver.T', 'chloe_uk', 'HarryB'],
  BR: ['Lucas_77', 'Gabi.rj', 'PedroZ', 'Duda_s2'],
  MX: ['Diego_mx', 'Valeria.r', 'Santi10'],
  ID: ['Budi_s', 'Putri.id', 'Rizky88'],
  PH: ['Migz', 'Kaye_ph', 'JunJun'],
  MY: ['Aiman_my', 'Sofea.'],
  NG: ['Chidi_O', 'Tunde22', 'Amaka.'],
  EG: ['Omar.eg', 'Nour_x', 'Youssef7'],
  SA: ['Faisal_sa', 'Reem.a'],
  AE: ['Zayed_ae', 'Maryam.'],
  TR: ['Emre_34', 'Zeynep.k'],
  DE: ['Lukas_b', 'mia.de'],
  FR: ['Hugo_fr', 'Lea.m'],
  IT: ['Marco_it', 'Giulia.'],
  RU: ['Artem_ru', 'Dasha.'],
  VN: ['Minh_vn', 'Linh.t'],
};

const COUNTRIES = Object.keys(POOL);

/** A flag emoji from a two-letter country code (regional indicators). */
export const flagOf = (country: string): string =>
  String.fromCodePoint(
    ...country
      .toUpperCase()
      .split('')
      .map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );

/**
 * `count` distinct opponents, preferring distinct countries. `random` is
 * injectable for tests.
 */
export const pickOpponents = (
  count: number,
  random: () => number = Math.random,
): OnlineIdentity[] => {
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const countries = COUNTRIES.slice();
  const picked: OnlineIdentity[] = [];
  while (picked.length < count) {
    const country = pick(countries.length > 0 ? countries : COUNTRIES);
    countries.splice(countries.indexOf(country), 1);
    const taken = new Set(picked.map(p => p.name));
    const names = POOL[country].filter(name => !taken.has(name));
    if (names.length > 0) {
      picked.push({ name: pick(names), country });
    }
  }
  return picked;
};
