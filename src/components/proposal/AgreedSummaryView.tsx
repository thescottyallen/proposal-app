import type { AgreedSummary } from "@/lib/agreed-summary";

/** Same agreed terms as the acceptance emails, from the stored acceptance. */
export function AgreedSummaryView({ summary }: { summary: AgreedSummary }) {
  return (
    <div
      id="agreed-summary"
      data-testid="agreed-summary"
      className="mt-4 text-left bg-white border border-gray-200 rounded-lg px-4 py-4"
    >
      <dl className="space-y-2">
        <Fact label="Proposal" value={summary.proposalTitle} />
        <Fact label="Client" value={summary.clientName} />
        <Fact label="Accepted" value={summary.acceptedAt} />
      </dl>
      {summary.sections.map((section, index) => (
        <section key={`${section.heading}-${index}`} className="mt-4">
          {section.heading && (
            <h3 className="text-sm font-semibold text-gray-900">{section.heading}</h3>
          )}
          <div className="mt-1">
            {section.rows.map((row, rowIndex) =>
              row.value ? (
                <div
                  key={`${row.label}-${rowIndex}`}
                  className={`flex items-baseline justify-between gap-4 py-0.5 text-sm text-gray-800 ${
                    row.strong ? "font-semibold border-t border-gray-200 mt-1 pt-2" : ""
                  }`}
                >
                  <span>{row.label}</span>
                  <span className="text-right">{row.value}</span>
                </div>
              ) : (
                <p
                  key={`${row.label}-${rowIndex}`}
                  className={`text-sm text-gray-800 py-0.5 ${row.strong ? "font-semibold" : ""}`}
                >
                  {row.label}
                </p>
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}
