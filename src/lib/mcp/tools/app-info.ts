import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "app_info",
  title: "App info",
  description:
    "Return static, non-sensitive metadata about this app (name and purpose). Use to verify MCP connectivity.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          name: "SSOT Guardian Core",
          description:
            "Governance and trading operations platform. MCP surface exposes only non-sensitive metadata.",
        }),
      },
    ],
  }),
});
