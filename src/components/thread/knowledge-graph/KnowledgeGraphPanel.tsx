"use client";

import React from "react";
import ReactFlow, {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  type NodeChange,
  type Edge as RFEdge,
  type Node as RFNode,
} from "reactflow";
import "reactflow/dist/style.css";
import { XIcon } from "lucide-react";

type KBNode = {
  id: string;
  label: string;
  type: string;
  value: string;
  position: { x: number; y: number };
};

type KBEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  relation_type: string;
  notes?: string;
};

function colorForType(type: string) {
  switch (type) {
    case "person":
      return "#60a5fa";
    case "organization":
      return "#34d399";
    case "alias":
    case "handle":
      return "#a78bfa";
    case "account":
      return "#fbbf24";
    case "domain":
      return "#f97316";
    case "url":
      return "#fb7185";
    case "repository":
      return "#22c55e";
    case "email":
      return "#06b6d4";
    case "phone":
      return "#14b8a6";
    case "ip":
      return "#94a3b8";
    case "location":
      return "#f43f5e";
    case "date":
      return "#64748b";
    case "event":
      return "#eab308";
    case "document":
      return "#93c5fd";
    case "keyword":
      return "#c084fc";
    default:
      return "#e5e7eb";
  }
}

export default function KnowledgeGraphPanel(props: {
  onClose?: () => void;
  refreshToken?: number;
  threadId?: string | null;
}): React.ReactNode {
  const [nodes, setNodes] = React.useState<RFNode[]>([]);
  const [edges, setEdges] = React.useState<RFEdge[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedNode, setSelectedNode] = React.useState<{
    type: string;
    value: string;
    id: string;
  } | null>(null);
  const [selectedEdge, setSelectedEdge] = React.useState<{
    relation_type: string;
    from_type: string;
    from_value: string;
    to_type: string;
    to_value: string;
    notes?: string;
  } | null>(null);

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const fetchGraph = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSelectedNode(null);
      setSelectedEdge(null);

      const query = new URLSearchParams({
        limit: "200",
      });
      if (props.threadId) {
        query.set("threadId", props.threadId);
      }
      const res = await fetch(`/api/kb-graph?${query.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load KB graph (${res.status})`);
      }
      const data = (await res.json()) as {
        nodes: KBNode[];
        edges: KBEdge[];
      };

      const rfNodes: RFNode[] = data.nodes.map((n) => ({
        id: n.id,
        type: "default",
        position: n.position,
        data: { label: n.label, type: n.type, value: n.value },
        draggable: true,
        style: {
          background: colorForType(n.type),
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
          padding: 10,
          fontSize: 12,
        },
      }));

      const rfEdges: RFEdge[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        data: { notes: e.notes },
        animated: true,
        style: {
          strokeWidth: 2,
          stroke: "rgba(55, 65, 81, 0.7)",
        },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load KB graph");
    } finally {
      setLoading(false);
    }
  }, [props.threadId]);

  React.useEffect(() => {
    void fetchGraph();
  }, [fetchGraph, props.refreshToken]);

  const onNodeClick = React.useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      const nType = node.data?.type ?? "other";
      const nVal = node.data?.value ?? node.id;
      setSelectedNode({ type: nType, value: String(nVal), id: node.id });
      setSelectedEdge(null);
    },
    [],
  );

  const onEdgeClick = React.useCallback(
    (_: React.MouseEvent, edge: RFEdge) => {
      const sourceId = String(edge.source ?? "");
      const targetId = String(edge.target ?? "");

      // node ids are type:value => parse type/value for display.
      const parseId = (id: string) => {
        const idx = id.indexOf(":");
        if (idx === -1) return { type: "other", value: id };
        return { type: id.slice(0, idx), value: id.slice(idx + 1) };
      };

      const from = parseId(sourceId);
      const to = parseId(targetId);

      setSelectedEdge({
        relation_type: String(edge.label ?? "other_relation"),
        from_type: from.type,
        from_value: from.value,
        to_type: to.type,
        to_value: to.value,
        notes: (edge.data as any)?.notes,
      });
      setSelectedNode(null);
    },
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div>
          <div className="text-sm font-semibold">Knowledge Graph</div>
          <div className="text-xs text-muted-foreground">
            Drag nodes. Click nodes/edges for details.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchGraph()}
            className="rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            Refresh
          </button>
          {props.onClose ? (
            <button
              type="button"
              aria-label="Close knowledge graph"
              onClick={props.onClose}
              className="inline-flex items-center justify-center rounded border p-2 text-xs hover:bg-muted"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading graph...
          </div>
        ) : error ? (
          <div className="p-3 text-sm text-destructive">{error}</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        )}
      </div>

      <div className="border-t p-3 text-sm">
        {selectedNode ? (
          <>
            <div className="font-semibold">Node</div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              <span className="font-mono">{selectedNode.type}</span> —{" "}
              {selectedNode.value}
            </div>
          </>
        ) : selectedEdge ? (
          <>
            <div className="font-semibold">Edge</div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{selectedEdge.relation_type}</span>{" "}
              <span className="font-mono">{selectedEdge.from_type}</span>:
              {selectedEdge.from_value} → <span className="font-mono">{selectedEdge.to_type}</span>:
              {selectedEdge.to_value}
            </div>
            {selectedEdge.notes ? (
              <div className="mt-2 break-words text-xs">
                <span className="font-semibold">Evidence:</span>{" "}
                {selectedEdge.notes}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            No selection. Click a node/edge to see details.
          </div>
        )}
      </div>
    </div>
  );
}

