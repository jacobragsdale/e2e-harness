// What a test may reach. Pure functions, so the rules are unit-tested apart from the browser (guard.test.ts).

/** The URL, parsed, if it names a QA environment; throws otherwise. */
export function requireQaUrl(value: string | undefined, markers: readonly string[], what: string): URL {
  if (value === undefined || value === "") {
    throw new Error(`${what} is not set. Copy .env.example to .env and fill it in.`);
  }
  const lowered = value.toLowerCase();
  if (markers.length === 0 || !markers.some((m) => lowered.includes(m.toLowerCase()))) {
    throw new Error(`${what} (${value}) does not look like QA: it contains none of qaMarkers [${markers.join(", ")}]. The harness only runs against QA.`);
  }
  return new URL(value);
}

export interface RequestRules {
  /** The app's host (host:port of baseURL). Reads and allowlisted writes may go here. */
  readonly appHost: string;
  /** Other hosts pages may read from: fonts, CDNs, the SSO provider. `*.example.com` matches subdomains. */
  readonly readHosts: readonly string[];
  /** Writes the app may make: "METHOD /path", where `*` matches one path segment and `**` any number. */
  readonly allowedWrites: readonly string[];
}

const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/** Why the browser must not send this request, or undefined when it may. */
export function blockReason(method: string, url: string, rules: RequestRules): string | undefined {
  const target = new URL(url);
  if (target.protocol === "data:" || target.protocol === "blob:") {
    return undefined;
  }
  const verb = method.toUpperCase();
  const onApp = target.host === rules.appHost;
  if (readMethods.has(verb)) {
    return onApp || rules.readHosts.some((h) => hostMatches(target.hostname, h)) ? undefined : `read from ${target.host}, which is not the app or in readHosts`;
  }
  if (!onApp) {
    return `${verb} to ${target.host}, which is not the app`;
  }
  return rules.allowedWrites.some((w) => writeMatches(verb, target.pathname, w)) ? undefined : `${verb} ${target.pathname} is not in allowedWrites`;
}

function hostMatches(hostname: string, pattern: string): boolean {
  return pattern.startsWith("*.") ? hostname.endsWith(pattern.slice(1)) : hostname === pattern;
}

function writeMatches(method: string, path: string, rule: string): boolean {
  const [ruleMethod = "", rulePath = ""] = rule.trim().split(/\s+/);
  if (ruleMethod.toUpperCase() !== method) {
    return false;
  }
  const escaped = rulePath
    .split("/")
    .map((segment) => (segment === "**" ? ".*" : segment.split("*").map(escapeRegExp).join("[^/]*")))
    .join("/");
  return new RegExp(`^${escaped}/?$`).test(path);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
