"use client";

import { startMeeting } from "@/lib/actions/meetings";
import { Avatar } from "../ui/bits";

export function OneToOneStarter({ people }: { people: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <form key={p.id} action={startMeeting}>
          <input type="hidden" name="kind" value="one_to_one" />
          <input type="hidden" name="personId" value={p.id} />
          <button className="btn btn-sm" style={{ paddingLeft: 4 }}>
            <Avatar name={p.name} size={20} /> {p.name}
          </button>
        </form>
      ))}
    </div>
  );
}
