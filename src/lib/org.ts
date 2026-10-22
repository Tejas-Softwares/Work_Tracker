import "server-only";
import { cache } from "react";
import { asc } from "drizzle-orm";
import { db, schema } from "./db";
import type { Viewer } from "./auth/session";

export type Person = typeof schema.people.$inferSelect;
export type Department = typeof schema.departments.$inferSelect;

export type Org = {
  people: Person[];
  active: Person[];
  byId: Map<string, Person>;
  departments: Department[];
  deptById: Map<string, Department>;
  reports: Map<string, Person[]>;
};

/** Everyone and every department, loaded once per request (an office of 40 is small). */
export const getOrg = cache(async (): Promise<Org> => {
  const [people, departments] = await Promise.all([
    db().select().from(schema.people).orderBy(asc(schema.people.name)),
    db().select().from(schema.departments).orderBy(asc(schema.departments.sort), asc(schema.departments.name)),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const reports = new Map<string, Person[]>();
  for (const p of people) {
    if (!p.reportsTo || !p.active) continue;
    if (!reports.has(p.reportsTo)) reports.set(p.reportsTo, []);
    reports.get(p.reportsTo)!.push(p);
  }
  return {
    people,
    active: people.filter((p) => p.active),
    byId,
    departments,
    deptById: new Map(departments.map((d) => [d.id, d])),
    reports,
  };
});

/** Everyone below a person in the reporting tree. */
export function subtree(org: Org, personId: string): Set<string> {
  const out = new Set<string>();
  const stack = [personId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const r of org.reports.get(id) ?? []) {
      if (out.has(r.id) || r.id === personId) continue;
      out.add(r.id);
      stack.push(r.id);
    }
  }
  return out;
}

/** The chain of managers above a person, nearest first. */
export function managersOf(org: Org, personId: string): Person[] {
  const out: Person[] = [];
  const seen = new Set([personId]);
  let cur = org.byId.get(personId)?.reportsTo;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = org.byId.get(cur);
    if (!p) break;
    out.push(p);
    cur = p.reportsTo;
  }
  return out;
}

export function seesEverything(v: Viewer): boolean {
  return v.role === "admin" || v.role === "management";
}

export function isHR(v: Viewer): boolean {
  return v.role === "hr" || seesEverything(v);
}

/** People this viewer manages: their reporting subtree plus everyone in departments they head or direct. */
export function managedIds(org: Org, v: Viewer): Set<string> {
  if (seesEverything(v)) return new Set(org.people.map((p) => p.id));
  const out = new Set<string>();
  if (!v.personId) return out;
  for (const id of subtree(org, v.personId)) out.add(id);
  for (const d of org.departments) {
    if (d.headPersonId === v.personId || d.directorPersonId === v.personId) {
      for (const p of org.people) if (p.departmentId === d.id && p.id !== v.personId) {
        out.add(p.id);
        for (const id of subtree(org, p.id)) out.add(id);
      }
    }
  }
  out.delete(v.personId);
  return out;
}

/** People whose work this viewer can see: themselves and the people they manage. */
export function visibleIds(org: Org, v: Viewer): Set<string> {
  const s = managedIds(org, v);
  if (v.personId) s.add(v.personId);
  return s;
}

export function canManage(org: Org, v: Viewer, personId: string): boolean {
  return seesEverything(v) || managedIds(org, v).has(personId);
}

export function canSeeScores(org: Org, v: Viewer, personId: string): boolean {
  return isHR(v) || canManage(org, v, personId) || v.personId === personId;
}

export function canEditKpis(org: Org, v: Viewer, departmentId: string): boolean {
  if (seesEverything(v)) return true;
  const d = org.deptById.get(departmentId);
  return !!v.personId && !!d && (d.headPersonId === v.personId || d.directorPersonId === v.personId);
}

export function personName(org: Org, id: string | null | undefined, fallback = "Unassigned"): string {
  if (!id) return fallback;
  return org.byId.get(id)?.name ?? fallback;
}

export function displayName(p: Pick<Person, "name" | "isVacancy" | "designation">): string {
  return p.isVacancy ? `${p.designation || p.name} (new hire)` : p.name;
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "")).toUpperCase();
}
