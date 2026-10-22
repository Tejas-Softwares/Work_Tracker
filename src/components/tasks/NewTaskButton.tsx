"use client";

import { Plus } from "lucide-react";
import { openQuickAdd, type QuickAddDefaults } from "./QuickAdd";

export function NewTaskButton({ defaults, label = "New task", className = "btn btn-primary" }: { defaults?: QuickAddDefaults; label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => openQuickAdd(defaults)}>
      <Plus size={16} /> {label}
    </button>
  );
}
