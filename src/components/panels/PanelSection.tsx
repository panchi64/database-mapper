/**
 * A titled section of the properties panel.
 *
 * Replaces the nested `<Card>` each section used to sit in. A card inside a panel
 * that is already a bordered surface reads as a second, redundant container, and
 * its padding cost the controls a noticeable slice of an already narrow sidebar.
 * Sections are now separated by a rule instead.
 */
interface PanelSectionProps {
  title: React.ReactNode;
  /** Optional control aligned to the right of the title, e.g. an "Add" button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function PanelSection({ title, action, children }: PanelSectionProps) {
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="mb-3 flex min-h-[1.75rem] items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
