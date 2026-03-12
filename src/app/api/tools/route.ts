import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const COMMENT_KEY = "_comment";
const COMMENT_VALUE =
  "Toggle tools on/off. true = enabled, false = disabled.";

function getConfigPath() {
  // agent-chat-ui is a submodule inside the main repo.
  // process.cwd() points to the agent-chat-ui root at runtime.
  // The Python tools config lives in ../src/tools/tool_config.json.
  return path.join(process.cwd(), "..", "src", "tools", "tool_config.json");
}

async function readRawConfig(): Promise<Record<string, unknown>> {
  const configPath = getConfigPath();
  const data = await fs.readFile(configPath, "utf-8");
  return JSON.parse(data) as Record<string, unknown>;
}

async function writeConfig(flags: Record<string, boolean>) {
  const configPath = getConfigPath();
  const payload: Record<string, unknown> = {
    [COMMENT_KEY]: COMMENT_VALUE,
  };
  for (const [name, enabled] of Object.entries(flags)) {
    payload[name] = enabled;
  }
  const json = JSON.stringify(payload, null, 2) + "\n";
  await fs.writeFile(configPath, json, "utf-8");
}

export async function GET() {
  try {
    const raw = await readRawConfig();
    const tools: { name: string; enabled: boolean }[] = [];

    for (const [key, value] of Object.entries(raw)) {
      if (key === COMMENT_KEY) continue;
      tools.push({
        name: key,
        enabled: typeof value === "boolean" ? value : true,
      });
    }

    // Sort alphabetically for a stable UI.
    tools.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ tools });
  } catch (error) {
    console.error("Failed to read tool_config.json", error);
    return NextResponse.json(
      { error: "Failed to read tool configuration" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tools?: { name: string; enabled: boolean }[];
    };

    if (!body.tools || !Array.isArray(body.tools)) {
      return NextResponse.json(
        { error: "Invalid payload: expected { tools: [...] }" },
        { status: 400 },
      );
    }

    const current = await readRawConfig();
    const updatedFlags: Record<string, boolean> = {};

    // Only allow toggling tools that already exist in the config.
    const knownToolNames = Object.keys(current).filter(
      (key) => key !== COMMENT_KEY,
    );

    for (const { name, enabled } of body.tools) {
      if (!knownToolNames.includes(name)) continue;
      updatedFlags[name] = !!enabled;
    }

    // Preserve any tools that were not mentioned in the payload.
    for (const name of knownToolNames) {
      if (!(name in updatedFlags)) {
        const value = current[name];
        updatedFlags[name] =
          typeof value === "boolean" ? (value as boolean) : true;
      }
    }

    await writeConfig(updatedFlags);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update tool_config.json", error);
    return NextResponse.json(
      { error: "Failed to update tool configuration" },
      { status: 500 },
    );
  }
}

