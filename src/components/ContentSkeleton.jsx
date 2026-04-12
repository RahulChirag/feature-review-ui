/**
 * Matches DocViewer's padding so the shell does not jump during load.
 * Token-based bg-outline-variant pulse — no blocking animations on slow devices.
 */
export default function ContentSkeleton() {
  return (
    <div
      className="w-full px-4 py-6 md:px-8 md:py-8"
      aria-busy="true"
      aria-label="Loading documentation"
    >
      <div className="animate-pulse space-y-5">
        {/* Title */}
        <div className="h-7 w-2/3 rounded bg-outline-variant/50" />

        {/* First paragraph */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-outline-variant/40" />
          <div className="h-4 w-[92%] rounded bg-outline-variant/40" />
          <div className="h-4 w-4/5 rounded bg-outline-variant/40" />
        </div>

        {/* Section heading */}
        <div className="h-5 w-2/5 rounded bg-outline-variant/50" />

        {/* Second paragraph */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-outline-variant/40" />
          <div className="h-4 w-3/4 rounded bg-outline-variant/40" />
          <div className="h-4 w-5/6 rounded bg-outline-variant/40" />
        </div>

        {/* Code block */}
        <div className="h-28 w-full rounded bg-outline-variant/30" />

        {/* Third paragraph */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-outline-variant/40" />
          <div className="h-4 w-[88%] rounded bg-outline-variant/40" />
        </div>
      </div>
    </div>
  )
}
