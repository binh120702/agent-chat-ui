"use client";

import React from "react";

type Tool = {
  name: string;
  enabled: boolean;
};

export default function ToolsPage(): React.ReactNode {
  const [tools, setTools] = React.useState<Tool[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchTools = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/tools");
        if (!res.ok) {
          throw new Error(`Failed to load tools (${res.status})`);
        }
        const data = (await res.json()) as { tools: Tool[] };
        setTools(data.tools ?? []);
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Failed to load tools configuration",
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchTools();
  }, []);

  const toggleTool = (name: string) => {
    setTools((prev) =>
      prev.map((tool) =>
        tool.name === name ? { ...tool, enabled: !tool.enabled } : tool,
      ),
    );
    setSavedMessage(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSavedMessage(null);
      const res = await fetch("/api/tools", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tools }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save tools (${res.status})`);
      }
      setSavedMessage(
        "Tool configuration saved. New agent calls will immediately use this tool set.",
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to save tools configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agent tools</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View and toggle the Python tools currently exposed to the OSINT agent.
          Changes are written to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            src/tools/tool_config.json
          </code>{" "}
          in the main repository.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">
          Loading tools configuration...
        </div>
      ) : error ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-md border bg-background p-4">
            {tools.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No tools found in configuration.
              </div>
            ) : (
              tools.map((tool) => (
                <label
                  key={tool.name}
                  className="flex items-center justify-between gap-3 rounded border px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">{tool.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tool.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={() => toggleTool(tool.name)}
                  />
                </label>
              ))
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || tools.length === 0}
              className="inline-flex items-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {savedMessage && (
              <span className="text-xs text-muted-foreground">
                {savedMessage}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

