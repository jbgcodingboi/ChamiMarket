export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-full bg-surface-3 text-muted">
          <Icon className="size-6" />
        </span>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  )
}
