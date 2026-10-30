const ALLOWED_TARGETS = new Set(["unknown", "USG", "STANDARDS", "ARPL"]);
const ALLOWED_TYPES = new Set([
  "observation", "gap", "failure", "contradiction",
  "evidence", "proposal", "question", "other"
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS }
  });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const s = {
    target: clean(input.target || "unknown", 32),
    type: clean(input.type || "observation", 32),
    title: clean(input.title, 180),
    observation: clean(input.observation, 12000),
    evidence: clean(input.evidence || "", 12000),
    source: clean(input.source || "", 500),
    originating_ai: clean(input.originating_ai || "", 120),
    submitted_by: clean(input.submitted_by || "", 120),
    conversation_context: clean(input.conversation_context || "", 6000)
  };

  if (!ALLOWED_TARGETS.has(s.target)) {
    return { ok: false, error: "Invalid target." };
  }
  if (!ALLOWED_TYPES.has(s.type)) {
    return { ok: false, error: "Invalid type." };
  }
  if (s.title.length < 5) {
    return { ok: false, error: "title must contain at least 5 characters." };
  }
  if (s.observation.length < 10) {
    return { ok: false, error: "observation must contain at least 10 characters." };
  }

  return { ok: true, submission: s };
}

function buildIssueBody(s, request) {
  const lines = [
    "## STAR-T-GATE Inbox submission",
    "",
    `**Target:** ${s.target}`,
    `**Type:** ${s.type}`,
    `**Originating AI:** ${s.originating_ai || "not specified"}`,
    `**Submitted by:** ${s.submitted_by || "not specified"}`,
    `**Source:** ${s.source || "not specified"}`,
    `**Received:** ${new Date().toISOString()}`,
    "",
    "## Observation",
    "",
    s.observation
  ];

  if (s.evidence) lines.push("", "## Evidence / supporting material", "", s.evidence);
  if (s.conversation_context) lines.push("", "## Conversation context", "", s.conversation_context);

  lines.push(
    "",
    "## Intake metadata",
    "",
    "- Transport: STAR-T-GATE Inbox Worker",
    `- User-Agent: ${request.headers.get("User-Agent") || "not provided"}`,
    "",
    "> This issue is uncurated intake. Its presence does not make the submission governing knowledge."
  );

  return lines.join("\n");
}

async function createGitHubIssue(env, s, request) {
  const owner = env.GITHUB_OWNER || "gschmidtke";
  const repo = env.GITHUB_REPO || "STAR-T-GATE-INBOX";

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "STAR-T-GATE-Inbox-Worker/0.1",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: `[${s.target}] [${s.type}] ${s.title}`,
      body: buildIssueBody(s, request)
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload.message || "GitHub rejected request." };
  }

  return { ok: true, issue_number: payload.number, issue_url: payload.html_url };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "STAR-T-GATE Inbox",
        version: "0.1.0"
      });
    }

    if (request.method === "GET" && url.pathname === "/schema") {
      return jsonResponse({
        endpoint: "POST /intake",
        required: ["title", "observation"],
        target: ["unknown", "USG", "STANDARDS", "ARPL"],
        type: [...ALLOWED_TYPES]
      });
    }

    if (request.method !== "POST" || url.pathname !== "/intake") {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
      return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    }

    if (Number(request.headers.get("Content-Length") || 0) > 32768) {
      return jsonResponse({ error: "Request body is too large." }, 413);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: "Inbox service is not configured." }, 500);
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON." }, 400);
    }

    const checked = validate(input);
    if (!checked.ok) return jsonResponse({ error: checked.error }, 400);

    const result = await createGitHubIssue(env, checked.submission, request);
    if (!result.ok) {
      return jsonResponse({
        error: "Submission could not be forwarded to the curator queue.",
        upstream_status: result.status,
        upstream_message: result.error
      }, 502);
    }

    return jsonResponse({
      ok: true,
      status: "received",
      issue_number: result.issue_number,
      issue_url: result.issue_url,
      message: "Submission received by STAR-T-GATE Inbox. It is uncurated until reviewed."
    }, 201);
  }
};
