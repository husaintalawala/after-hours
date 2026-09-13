// Dependency-free bridge for data helpers also used by server-side/unit-test code.
// A browser activity provider installs the factory; otherwise capture is a no-op.
type Capture = (name: string, feature: string, outcome?: string, properties?: Record<string, string | number | boolean>, actionId?: string) => void
let factory: () => Capture = () => () => {}
export function installActivityScope(value: () => Capture) { factory = value }
export function activityScope(): Capture { return factory() }
