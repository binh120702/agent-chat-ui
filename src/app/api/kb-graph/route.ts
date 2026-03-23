import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type KBEdgeRecord = {
  from_type: string;
  from_value: string;
  relation_type: string;
  to_type: string;
  to_value: string;
  notes?: string;
};

type GraphNode = {
  id: string;
  label: string;
  type: string;
  value: string;
  position: { x: number; y: number };
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  relation_type: string;
  notes?: string;
};

function sanitizeThreadId(threadId: string) {
  const safe = threadId.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return safe || "global";
}

function getKbEdgesPath(threadId?: string) {
  // agent-chat-ui/ -> root/src/data/<thread>/kb_edges.jsonl
  const dataDir = path.join(process.cwd(), "..", "src", "data");
  if (threadId && threadId.trim()) {
    return path.join(
      dataDir,
      sanitizeThreadId(threadId),
      "kb_edges.jsonl",
    );
  }
  // Backward compatibility (old global file)
  return path.join(dataDir, "kb_edges.jsonl");
}

function nodeId(type: string, value: string) {
  return `${type}:${value}`;
}

async function readFileSafe(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8").catch(() => "");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 200) : 200;
    const threadId = url.searchParams.get("threadId") ?? "";
    const conversationId = url.searchParams.get("conversationId") ?? "";

    const rawChunks: string[] = [];
    const tryNamespace = async (ns: string) => {
      if (!ns.trim()) return;
      // New path: src/data/<namespace>/kb_edges.jsonl
      rawChunks.push(await readFileSafe(getKbEdgesPath(ns)));

      // Legacy: src/data/kb_edges__<namespace>.jsonl
      const legacyThreadPath = path.join(
        process.cwd(),
        "..",
        "src",
        "data",
        `kb_edges__${sanitizeThreadId(ns)}.jsonl`,
      );
      rawChunks.push(await readFileSafe(legacyThreadPath));

      // Legacy folder-per-type: src/data/kb_graph_edges/<namespace>.jsonl
      const legacyFolderPath = path.join(
        process.cwd(),
        "..",
        "src",
        "data",
        "kb_graph_edges",
        `${sanitizeThreadId(ns)}.jsonl`,
      );
      rawChunks.push(await readFileSafe(legacyFolderPath));
    };

    // Primary: server thread id. Secondary: local conversation id.
    await tryNamespace(threadId);
    if (conversationId && conversationId !== threadId) {
      await tryNamespace(conversationId);
    }

    // Final fallback: old global file.
    const globalRaw = await readFileSafe(getKbEdgesPath());
    if (globalRaw) rawChunks.push(globalRaw);

    const raw = rawChunks.filter(Boolean).join("\n");
    if (!raw) {
      return NextResponse.json({ nodes: [], edges: [], edgeCount: 0 });
    }

    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const records: KBEdgeRecord[] = [];
    const dedupe = new Set<string>();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as KBEdgeRecord;
        if (
          obj &&
          obj.from_type &&
          obj.from_value &&
          obj.to_type &&
          obj.to_value &&
          obj.relation_type
        ) {
          const key = `${obj.from_type}|${obj.from_value}|${obj.relation_type}|${obj.to_type}|${obj.to_value}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          records.push(obj);
        }
      } catch {
        // ignore malformed lines
      }
      if (records.length >= limit) break;
    }

    const nodeMap = new Map<string, { id: string; label: string; type: string; value: string }>();
    const edges: GraphEdge[] = [];

    for (const r of records) {
      const fromId = nodeId(r.from_type, r.from_value);
      const toId = nodeId(r.to_type, r.to_value);

      if (!nodeMap.has(fromId)) {
        nodeMap.set(fromId, {
          id: fromId,
          type: r.from_type,
          value: r.from_value,
          label: r.from_value,
        });
      }
      if (!nodeMap.has(toId)) {
        nodeMap.set(toId, {
          id: toId,
          type: r.to_type,
          value: r.to_value,
          label: r.to_value,
        });
      }

      const id = `${fromId}__${r.relation_type}__${toId}`;
      edges.push({
        id,
        source: fromId,
        target: toId,
        label: r.relation_type,
        relation_type: r.relation_type,
        notes: r.notes,
      });
    }

    // Simple initial layout. Users can drag nodes afterwards.
    const nodesArray = Array.from(nodeMap.values());
    const nodes: GraphNode[] = [];
    const cols = 4;
    const spacingX = 220;
    const spacingY = 180;

    nodesArray.forEach((n, i) => {
      nodes.push({
        id: n.id,
        type: n.type,
        value: n.value,
        label: n.label.length > 30 ? `${n.label.slice(0, 30)}…` : n.label,
        position: {
          x: (i % cols) * spacingX,
          y: Math.floor(i / cols) * spacingY,
        },
      });
    });

    return NextResponse.json({
      nodes,
      edges,
      edgeCount: edges.length,
    });
  } catch (error) {
    console.error("Failed to load kb_edges.jsonl", error);
    return NextResponse.json({ error: "Failed to load KB graph" }, { status: 500 });
  }
}

