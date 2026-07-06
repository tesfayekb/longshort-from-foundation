// OWNED FILE (ACT-476, gate-0B corrective). MCP tool surface is FROZEN at
// exactly `app_info` + `echo` per H-SEC-5. Any regeneration, tool addition,
// or auth-posture change requires the H-SEC-5 FP + OAuth 2.1 path — do NOT
// re-enable the @lovable.dev/mcp-js plugin overwrite by restoring the
// AUTO-GENERATED banner. Behavior in this file must remain byte-equivalent
// to the last plugin emission (commit f7027df3); lint-only changes only.
// supabase function: mcp
// Bundled from src/lib/mcp/index.ts by @lovable.dev/mcp-js.
// src/lib/mcp/index.ts
import { defineMcp } from "npm:@lovable.dev/mcp-js@0.20.0";

// src/lib/mcp/tools/app-info.ts
import { defineTool } from "npm:@lovable.dev/mcp-js@0.20.0";
const app_info_default = defineTool({
  name: "app_info",
  title: "App info",
  description: "Return static, non-sensitive metadata about this app (name and purpose). Use to verify MCP connectivity.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false
  },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          name: "SSOT Guardian Core",
          description: "Governance and trading operations platform. MCP surface exposes only non-sensitive metadata."
        })
      }
    ]
  })
});

// src/lib/mcp/tools/echo.ts
import { defineTool as defineTool2 } from "npm:@lovable.dev/mcp-js@0.20.0";
import { z } from "npm:zod@^3.25.76";
const echo_default = defineTool2({
  name: "echo",
  title: "Echo",
  description: "Echo the input text back to the caller. Useful for verifying connectivity.",
  inputSchema: {
    text: z.string().min(1).describe("Text to echo back.")
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false
  },
  handler: ({ text }) => ({
    content: [{ type: "text", text }]
  })
});

// src/lib/mcp/index.ts
const mcp_default = defineMcp({
  name: "ssot-guardian-core-mcp",
  title: "SSOT Guardian Core",
  version: "0.1.0",
  instructions: "Read-only connectivity surface for SSOT Guardian Core. Use `app_info` to fetch non-sensitive app metadata, or `echo` to verify the connection. No trading, RBAC, or user data is exposed here \u2014 those surfaces require an authenticated in-app session.",
  tools: [app_info_default, echo_default]
});

// lovable-mcp-supabase-entry.ts
import { createSupabaseHandler } from "npm:@lovable.dev/mcp-js@0.20.0/stacks/supabase";
Deno.serve(createSupabaseHandler(mcp_default, { functionName: "mcp" }));
