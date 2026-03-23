export default function Loading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
        <p className="text-white/40 font-mono text-sm">Loading trip...</p>
      </div>
    </div>
  )
}
