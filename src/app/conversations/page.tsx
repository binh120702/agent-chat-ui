"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Thread } from "@langchain/langgraph-sdk";
import { validate } from "uuid";

import { createClient } from "@/providers/client";
import { getApiKey } from "@/lib/api-key";
import { getContentString } from "@/components/thread/utils";

type ConversationRecord = {
  thread_id: string;
  message_count: number;
  content: string;
};

function normalizeThreadContent(thread: Thread): ConversationRecord {
  const messages =
    typeof thread.values === "object" &&
    thread.values &&
    "messages" in thread.values &&
    Array.isArray(thread.values.messages)
      ? thread.values.messages
      : [];

  const joined = messages
    .map((m) => getContentString((m as any).content))
    .filter(Boolean)
    .join("\n\n");

  return {
    thread_id: thread.thread_id,
    message_count: messages.length,
    content: joined,
  };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ConversationsPage(): React.ReactNode {
  const [apiUrl] = useQueryState("apiUrl");
  const [assistantId] = useQueryState("assistantId");

  const [items, setItems] = React.useState<ConversationRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchConversations = React.useCallback(async () => {
    if (!apiUrl || !assistantId) {
      setError(
        "Missing apiUrl or assistantId in URL params. Open chat first or set them in the setup form.",
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const client = createClient(apiUrl, getApiKey() ?? undefined);
      const metadata = validate(assistantId)
        ? { assistant_id: assistantId }
        : { graph_id: assistantId };
      const threads = await client.threads.search({
        metadata,
        limit: 200,
      });

      const records = threads.map(normalizeThreadContent);
      setItems(records);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to fetch conversations",
      );
    } finally {
      setLoading(false);
    }
  }, [apiUrl, assistantId]);

  React.useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-sm text-muted-foreground">
            View each conversation identifier and full content from LangGraph
            thread state.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchConversations()}
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson("conversations_export.json", {
                exported_at: new Date().toISOString(),
                total: items.length,
                conversations: items,
              })
            }
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
            disabled={items.length === 0}
          >
            Export JSON
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : error ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No conversations found.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => (
            <div
              key={c.thread_id}
              className="rounded border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{c.thread_id}</span>
                <span className="text-xs text-muted-foreground">
                  {c.message_count} messages
                </span>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {c.content || "(No text content)"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

