export default {
  id: "ollama-search",
  alias: "ollama-search",
  display: {
    name: "Ollama Search",
    icon: "cloud",
    color: "#ffffff",
    textIcon: "OL",
    website: "https://ollama.com",
    notice: {
      text: "Web search via Ollama Cloud subscription. Reuses the API key from the Ollama (chat) provider.",
      apiKeyUrl: "https://ollama.com/settings/keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: [
    "apikey",
  ],
  credentialFallback: "ollama",
};
