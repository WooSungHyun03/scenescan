export default function ApplicationLoading() {
  return (
    <main
      className="scene-container py-10 sm:py-14"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="화면을 불러오는 중"
    >
      <span className="sr-only">화면을 불러오고 있습니다.</span>
      <div aria-hidden="true">
        <div className="scene-skeleton h-3 w-24 rounded" />
        <div className="scene-skeleton mt-3 h-10 w-72 max-w-full rounded" />
        <div className="scene-skeleton mt-3 h-4 w-[32rem] max-w-full rounded" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
          <div className="space-y-5">
            <div className="scene-panel scene-skeleton aspect-[16/9]" />
            <div className="scene-panel space-y-3 p-5">
              <div className="scene-skeleton h-6 w-2/3 rounded" />
              <div className="scene-skeleton h-4 w-full rounded" />
              <div className="scene-skeleton h-4 w-4/5 rounded" />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="scene-panel space-y-3 p-5">
                <div className="scene-skeleton h-5 w-1/2 rounded" />
                <div className="scene-skeleton h-24 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
