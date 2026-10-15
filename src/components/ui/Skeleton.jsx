export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden="true" />

export function MarketCardSkeleton() {
  return (
    <div className="card flex h-[184px] flex-col gap-4 p-4" aria-hidden="true">
      <div className="flex gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-10 w-12" />
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
