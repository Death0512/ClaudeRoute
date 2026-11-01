export default {
  id: "selfhosted-stt",
  priority: 50,
  alias: "selfhosted-stt",
  display: {
    name: "Self-hosted STT",
    icon: "cloud",
    color: "#ffffffff",
    textIcon: "ST",
    website: "https://github.com/ggml-org/whisper.cpp",
  },
  category: "apikey",
  hasFree: true,
  models: [
    { id: "whisper-1", name: "Whisper (self-hosted)", params: ["language","response_format","temperature","prompt"], kind: "stt" },
  ],
  auth: {
    apiKey: {
      text: "Set providerSpecificData.baseUrl to the full transcriptions URL, e.g. http://host:8080/v1/audio/transcriptions. The API key is not checked by local servers; any value works.",
    },
  },
};
