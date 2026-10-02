export default function ApplicationLoading() {
  return (
    <main
      className="mx-auto max-w-6xl px-5 py-10"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="화면을 불러오는 중"
    >
      <span className="sr-only">화면을 불러오고 있습니다.</span>
      <div aria-hidden="true">
        <div className="h-3 w-24 animate-pulse rounded bg-stone-200" />
        <div className="mt-3 h-9 w-64 max-w-full animate-pulse rounded bg-stone-300" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
          <div className="space-y-5">
            <div className="scene-panel aspect-[16/9] animate-pulse bg-stone-200" />
            <div className="scene-panel space-y-3 p-5">
              <div className="h-6 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-stone-100" />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="scene-panel space-y-3 p-5">
                <div className="h-5 w-1/2 animate-pulse rounded bg-stone-200" />
                <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
