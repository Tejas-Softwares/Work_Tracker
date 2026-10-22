/**
 * The muster roll: for each person, how much work they logged on each recent working day
 * (updates written, tasks created, tasks finished). Like a site attendance register, a blank row stands out.
 */

export type MusterEvent = { personId: string; day: string };

export type MusterRow = {
  personId: string;
  counts: number[];
  total: number;
  activeDays: number;
  /** Working days since the last logged work, counted back from the last day shown. */
  quietDays: number;
};

export function buildMuster(personIds: string[], events: MusterEvent[], days: string[]): MusterRow[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const map = new Map<string, number[]>(personIds.map((id) => [id, days.map(() => 0)]));
  for (const e of events) {
    const row = map.get(e.personId);
    const i = index.get(e.day);
    if (row && i !== undefined) row[i]++;
  }
  return personIds.map((id) => {
    const counts = map.get(id)!;
    let quiet = 0;
    for (let i = counts.length - 1; i >= 0 && counts[i] === 0; i--) quiet++;
    return {
      personId: id,
      counts,
      total: counts.reduce((a, b) => a + b, 0),
      activeDays: counts.filter((c) => c > 0).length,
      quietDays: quiet,
    };
  });
}

/** 0 = nothing, 1 = a little, 2 = steady, 3 = a lot. */
export function musterLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}
