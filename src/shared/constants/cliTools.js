export const MITM_TOOLS = {};

export const CLI_TOOLS = {
  claude: {
    id: "claude",
    name: "Claude Code",
    image: "/providers/claude.png",
    color: "#D97757",
    description: "Anthropic Claude Code CLI",
    configType: "env",
    envVars: {
      baseUrl: "ANTHROPIC_BASE_URL",
      model: "ANTHROPIC_MODEL",
      opusModel: "ANTHROPIC_DEFAULT_OPUS_MODEL",
      sonnetModel: "ANTHROPIC_DEFAULT_SONNET_MODEL",
      fableModel: "ANTHROPIC_DEFAULT_FABLE_MODEL",
      haikuModel: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    },
    modelAliases: ["default", "sonnet", "opus", "fable", "haiku", "opusplan"],
    settingsFile: "~/.claude/settings.json",
    defaultModels: [
      { id: "fable", name: "Claude Fable", alias: "fable", envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL", defaultValue: "cc/claude-fable-5" },
      { id: "opus", name: "Claude Opus", alias: "opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL", defaultValue: "cc/claude-opus-5" },
      { id: "sonnet", name: "Claude Sonnet", alias: "sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL", defaultValue: "cc/claude-sonnet-5" },
      { id: "haiku", name: "Claude Haiku", alias: "haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL", defaultValue: "cc/claude-haiku-4-5-20251001" },
    ],
  },
  openclaw: {
    id: "openclaw",
    name: "Open Claw",
    image: "/providers/openclaw.png",
    color: "#FF6B35",
    description: "Open Claw AI Assistant",
    configType: "custom",
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex CLI / App",
    image: "/providers/codex.png",
    color: "#10A37F",
    description: "OpenAI Codex CLI",
    configType: "custom",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    image: "/providers/opencode.png",
    color: "#E87040",
    description: "OpenCode AI Terminal Assistant",
    configType: "custom",
  },
  cowork: {
    id: "cowork",
    name: "Claude Cowork",
    image: "/providers/claude.png",
    color: "#D97757",
    description: "Claude Desktop Cowork (third-party inference)",
    configType: "custom",
  },
  hermes: {
    id: "hermes",
    name: "Hermes Agent",
    image: "/providers/hermes.png",
    color: "#8B5CF6",
    description: "Nous Research self-improving AI agent",
    configType: "custom",
    roles: [
      { id: "delegation", label: "Delegation (subagents)" },
      { id: "vision", label: "Vision" },
      { id: "compression", label: "Compression" },
      { id: "title_generation", label: "Title Generation" },
      { id: "approval", label: "Approval" },
      { id: "skills_hub", label: "Skills Hub" },
      { id: "mcp", label: "MCP" },
      { id: "review", label: "Review (/review subagent)" },
      { id: "memory_query_rewrite", label: "Memory Query Rewrite" },
      { id: "background_review", label: "Background Review" },
      { id: "curator", label: "Curator" },
      { id: "monitor", label: "Monitor" },
      { id: "tts_audio_tags", label: "TTS Audio Tags" },
      { id: "triage_specifier", label: "Triage Specifier" },
      { id: "kanban_decomposer", label: "Kanban Decomposer" },
      { id: "profile_describer", label: "Profile Describer" },
      { id: "goal_judge", label: "Goal Judge" },
    ],
  },
};

export const getProviderModelsForMapping = (providers) => {
  const result = [];
  providers.forEach(conn => {
    if (conn.isActive && (conn.testStatus === "active" || conn.testStatus === "success")) {
      result.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        models: conn.models || [],
      });
    }
  });
  return result;
};
