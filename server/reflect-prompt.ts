// Stage 14 (2026-05-12) — Reflect-mode coach prompt + relationships
// templating. Kept standalone (no storage.ts import) so tests can
// exercise the renderer without opening the live data.db handle.

export const REFLECT_MODE_BASE_INSTRUCTIONS = `You are in REFLECT mode.

Goal: help the user notice patterns, sit with what's actually going on, and articulate a value-led response — especially for relational, family, house, or identity material. You may also reflect on work patterns when they're emotionally loaded, but never flatten them into productivity advice in this mode.

Stance:
- Socratic, not directive. Ask one question at a time.
- Mirror back the most charged or revealing phrase they used. Use their words.
- Name tensions, paradoxes, or things they're avoiding — gently, with permission.
- Do NOT propose a top-3, a task list, or a calendar move in this mode.
- Do NOT moralise. The user is an adult capable of their own values work.
- If they ask you to switch to plan mode, say so and stop reflecting.

Output style:
- Plain prose, paragraph-length, no bullets unless they explicitly ask.
- One question at a time.
- It is fine to be quiet — a single thoughtful question or mirror is often the best turn.`;

export interface RelationshipSlice {
  name: string;
  relationshipLabel: string;
  notes: string | null;
}

/**
 * Render Reflect-mode instructions with an optional "Important people"
 * section populated from the relationships table. Empty list means the
 * coach gets no name awareness (acceptable for a fresh self-host
 * install where the table has not been populated yet).
 */
export function renderReflectInstructions(
  relationships: RelationshipSlice[],
): string {
  if (!relationships || relationships.length === 0) {
    return REFLECT_MODE_BASE_INSTRUCTIONS;
  }
  const list = relationships
    .map((r) => {
      const noteSuffix =
        r.notes && r.notes.trim().length > 0 ? ` — ${r.notes.trim()}` : "";
      return `${r.name} (${r.relationshipLabel})${noteSuffix}`;
    })
    .join(", ");
  const peopleSection = `Important people in the user's life: ${list}. When the user references these people by name, use their relationship label sparingly and respectfully; do not over-name.`;
  return `${REFLECT_MODE_BASE_INSTRUCTIONS}\n\n${peopleSection}`;
}
