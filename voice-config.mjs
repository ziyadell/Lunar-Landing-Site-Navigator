/**
 * The one narrator configuration for AFUQ. Used by both the recorded clips
 * (scripts/generate-narration.mjs) and the live-reading endpoint (api/tts.js), so every
 * clip and every live reading comes from the same voice, model and settings.
 *
 * Voice direction: an adult female English voice with a calm, clear mission-control
 * delivery; natural and composed, with subtle warmth; moderate pace, precise
 * pronunciation, short deliberate pauses (shaped by punctuation; Eleven v4 has no speed
 * or style setting). No effects, music, reverb or background noise are requested.
 *
 * Contains no secrets: the API key is read from ELEVENLABS_API_KEY at run time only.
 * Changing anything here changes `version`, which re-records every clip on the next run.
 */
export const VOICE = {
  /**
   * ElevenLabs premade "Bella": adult (middle-aged) female, American, professional and warm,
   * labelled for informative/educational narration. Chosen as the American counterpart to
   * "Alice" (Xb7hH8MSUJpSbSDYk0k2, British), which was approved for tone.
   */
  voiceId: 'hpp4J3VqNfWAUOO0d1Us',
  voiceName: 'Bella',
  modelId: 'eleven_v4',
  languageCode: 'en',
  outputFormat: 'mp3_44100_128',
  /** Narration preset from the ElevenLabs guidance: steady, natural (v4 uses only these two). */
  voiceSettings: { stability: 0.7, similarityBoost: 0.6 },
};

/** Version of this configuration. Sent by the app as ?v= to /api/tts and stored in the manifest. */
export const VOICE_VERSION = 'afuq-2';
