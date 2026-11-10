"use client";

import { useTransition } from "react";
import { deleteCard } from "@/app/app/actions";
import { deleteCategory, deleteRule } from "@/app/app/settings/actions";
import { Button } from "@/components/ui";

export function SettingsCardDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete this card with all its statements and transactions?")) start(() => deleteCard(id));
      }}
    >
      Delete
    </Button>
  );
}

export function SettingsCategoryDelete({ slug, name }: { slug: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Delete category ${name}`}
      disabled={pending}
      className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
      onClick={() => start(() => deleteCategory(slug))}
    >
      ×
    </button>
  );
}

export function SettingsRuleDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => deleteRule(id))}>
      Remove
    </Button>
  );
}
