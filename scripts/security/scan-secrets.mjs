#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const staged = args.has("--staged");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function trackedPaths() {
  const command = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  return git(...command).split("\0").filter(Boolean);
}

function contentFor(path) {
  if (staged) {
    try {
      return git("show", `:${path}`);
    } catch {
      return null;
    }
  }
  try {
    const absolutePath = join(repoRoot, path);
    if (statSync(absolutePath).size > 15_000_000) return null;
    const bytes = readFileSync(absolutePath);
    if (bytes.includes(0)) return null;
    return bytes.toString("utf8");
  } catch {
    return null;
  }
}

const detectors = [
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g],
  ["Expo/EAS token", /\b(?:expo|eas)_[A-Za-z0-9_-]{20,}\b/g],
  [
    "Private key",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  ],
];

const forbiddenPublicNames =
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GOOGLE_PLACES_API_KEY|GOOGLE_CLIENT_SECRET|OAUTH_CLIENT_SECRET|JWT_SECRET|DATABASE_PASSWORD)\b/g;
const publicConfigPath =
  /(?:app\.config\.[cm]?[jt]s|app\.json|eas\.json|[/\\](?:app|src|components|lib|utils|config)[/\\].*\.[cm]?[jt]sx?)$/i;
const generatedExpoPath =
  /^(?:crawl\/output\/|output\/buffaverse-web-correction\/)/;
const localCayenneCredentialPath = /(^|\/)\.env\.cayenne(?:\..+)?\.local$/i;
const cayenneArtifactPath = /^artifacts\/cayenne\//;
const authMaestroFlowPath = /^cayenne\/flows\/auth\//;
const scriptPath = /^(?:scripts|cayenne\/scripts)\//;

const findings = [];
for (const path of trackedPaths()) {
  if (localCayenneCredentialPath.test(path)) {
    findings.push({
      type: "Tracked Cayenne local credential file",
      path,
      line: 1,
      fingerprint: "local-cayenne-credential-file",
    });
  }
  if (generatedExpoPath.test(path)) {
    findings.push({
      type: "Tracked generated Expo export",
      path,
      line: 1,
      fingerprint: "generated-artifact",
    });
  }

  const text = contentFor(path);
  if (text == null) continue;

  if (scriptPath.test(path) && path !== "scripts/security/scan-secrets.mjs") {
    const defaultPassword = /(?:^|\n).*CAYENNE_TEST_PASSWORD\s*=\s*["'][^"']+/g;
    for (const match of text.matchAll(defaultPassword)) {
      findings.push({ type: "Default Cayenne password in script", path, line: text.slice(0, match.index).split("\n").length, fingerprint: "redacted" });
    }
    // A hyphen within a placeholder such as "your-password" is not a command
    // argument. Require an argument boundary and a following value/assignment.
    const passwordArgument =
      /(?:^|[\s,[(])["']?(?:--password|-password)["']?(?=\s|=|,|\)|\])/im;
    if (passwordArgument.test(text)) {
      findings.push({ type: "Password command-line argument in script", path, line: 1, fingerprint: "redacted" });
    }
  }

  if (authMaestroFlowPath.test(path)) {
    const passwordInput = /id:\s*auth\.password\.input[\s\S]{0,200}?inputText:\s*(.+)/.exec(text);
    if (!passwordInput || passwordInput[1].trim() !== "${CAYENNE_TEST_PASSWORD}") {
      findings.push({ type: "Literal password in Cayenne Maestro flow", path, line: 1, fingerprint: "redacted" });
    }
  }

  if (cayenneArtifactPath.test(path)) {
    const evidenceSecret = /(?:password|access_token|refresh_token|authorization)\s*["']?\s*[:=]\s*["']?(?:Bearer\s+)?[A-Za-z0-9._~-]{16,}/i;
    if (evidenceSecret.test(text)) {
      findings.push({ type: "Potential credential/session material in Cayenne evidence", path, line: 1, fingerprint: "redacted" });
    }
  }

  for (const [type, regex] of detectors) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const digest = createHash("sha256").update(match[0]).digest("hex");
      const line = text.slice(0, match.index).split("\n").length;
      const fingerprint =
        type === "Google API key"
          ? `${match[0].slice(0, 4)}...${match[0].slice(-4)}`
          : `${type}#${digest.slice(0, 12)}`;
      findings.push({ type, path, line, fingerprint, sha256: digest });
    }
  }

  if (publicConfigPath.test(path)) {
    forbiddenPublicNames.lastIndex = 0;
    for (const match of text.matchAll(forbiddenPublicNames)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({
        type: "Server-only variable referenced by public app code",
        path,
        line,
        fingerprint: match[0],
      });
    }
  }
}

const unique = [
  ...new Map(
    findings.map((finding) => [
      `${finding.type}|${finding.path}|${finding.line}|${finding.fingerprint}`,
      finding,
    ]),
  ).values(),
];

if (unique.length) {
  console.error("Secret/public-config scan failed. Values are redacted.");
  for (const finding of unique) {
    console.error(
      `${finding.type}: ${finding.path}:${finding.line} (${finding.fingerprint})`,
    );
  }
  process.exit(1);
}

console.log(
  `Secret/public-config scan passed (${trackedPaths().length} ${
    staged ? "staged" : "tracked"
  } files).`,
);
