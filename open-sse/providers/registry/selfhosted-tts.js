export default {
  id: "selfhosted-tts",
  priority: 50,
  alias: "selfhosted-tts",
  display: {
    name: "Self-hosted TTS",
    icon: "cloud",
    color: "#ffffffff",
    textIcon: "TT",
    website: "https://github.com/remsky/Kokoro-FastAPI",
  },
  category: "apikey",
  hasFree: true,
  models: [
    { id: "kokoro", name: "Kokoro (self-hosted)", params: ["voice","response_format","speed"], kind: "tts" },
  ],
  auth: {
    apiKey: {
      text: "Set providerSpecificData.baseUrl to the server root, e.g. http://host:8080 — /v1/audio/speech is appended. The API key is not checked by local servers; any value works.",
    },
  },
};
