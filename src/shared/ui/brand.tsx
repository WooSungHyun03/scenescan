export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className={`scene-brand ${inverse ? "text-white" : "text-brand"}`} translate="no">
      <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square">
          <path d="M15 5H5v10M25 5h10v10M5 25v10h10M35 25v10H25" />
          <path d="m11 25 9-12 9 12" />
        </g>
        <path fill="currentColor" d="M15 25h10v4H15z" />
      </svg>
      {!compact && <span className="text-[21px] font-bold tracking-[-.04em]">SceneScan</span>}
    </span>
  );
}
