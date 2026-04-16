export default function MetaStats({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="flex flex-col items-center gap-1 rounded-lg border border-outline bg-surface-container px-3 py-5 text-center"
        >
          <span className="text-[22px]" aria-hidden>
            {stat.icon}
          </span>
          <span className={`text-[26px] font-extrabold leading-none tabular-nums ${stat.valueClass}`}>
            {stat.value}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  )
}
