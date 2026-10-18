// Prints the id of the largest on-screen window owned by the given process id.
// Usage: swift scripts/window-id.swift <pid>
import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let pid = Int(CommandLine.arguments[1]) else { exit(2) }
let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
let mine = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
let area: ([String: Any]) -> Double = { w in
  let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
  return (b["Width"] ?? 0) * (b["Height"] ?? 0)
}
guard let best = mine.max(by: { area($0) < area($1) }), let id = best[kCGWindowNumber as String] as? Int else { exit(1) }
print(id)
