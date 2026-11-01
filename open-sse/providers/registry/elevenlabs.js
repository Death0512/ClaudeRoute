export default {
  id: "elevenlabs",
  alias: "el",
  display: {
    name: "ElevenLabs",
    icon: "record_voice_over",
    color: "#6C47FF",
    textIcon: "EL",
    website: "https://elevenlabs.io",
    notice: {
      apiKeyUrl: "https://elevenlabs.io/app/settings/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  models: [
    { id: "scribe_v1", name: "Scribe v1", params: ["language","response_format","timestamps_granularity","tag_audio_events","diarize","num_speakers"], kind: "stt" },
    { id: "scribe_v2", name: "Scribe v2", params: ["language","response_format","timestamps_granularity","tag_audio_events","diarize","num_speakers"], kind: "stt" },
  ],
};
