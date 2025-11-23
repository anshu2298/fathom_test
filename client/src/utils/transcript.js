// Helper function to parse transcript
export function parseTranscript(transcript) {
  if (!transcript) return [];
  if (Array.isArray(transcript)) {
    return transcript;
  }
  if (typeof transcript === "string") {
    try {
      const parsed = JSON.parse(transcript);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("Failed to parse transcript:", e);
      return [];
    }
  }
  return [];
}
