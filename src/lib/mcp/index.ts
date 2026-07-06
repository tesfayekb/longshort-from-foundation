import { defineMcp } from "@lovable.dev/mcp-js";
import appInfoTool from "./tools/app-info";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "ssot-guardian-core-mcp",
  title: "SSOT Guardian Core",
  version: "0.1.0",
  instructions:
    "Read-only connectivity surface for SSOT Guardian Core. Use `app_info` to fetch non-sensitive app metadata, or `echo` to verify the connection. No trading, RBAC, or user data is exposed here — those surfaces require an authenticated in-app session.",
  tools: [appInfoTool, echoTool],
});
