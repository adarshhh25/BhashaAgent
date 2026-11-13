import { randomUUID } from "node:crypto";
import { detectConversationLanguage, isDevanagari, type ConversationLanguage } from "../agent/language-detector";

/**
 * Dedicated Per-Turn Voice Language Context
 *
 * Guarantees that language is determined and resolved independently for every voice turn,
 * never permanently locking the conversation or session to a previous turn's language.
 */
export interface VoiceTurnLanguageContext {
  turnId: string;
  transcript: string;
  detectedLanguage: ConversationLanguage;
  effectiveLanguage: string;
  responseLanguage: ConversationLanguage;
  sttLanguageCode?: string;
  ttsLanguageCode?: string;
  source: "current_turn_detection" | "explicit_preference_fallback";
}

/**
 * Resolves the language context for an individual voice utterance.
 *
 * Priority:
 * 1. Confident analysis of the current transcript text.
 * 2. Provider STT-detected language code (if transcript has no strong lexical markers).
 * 3. Explicit fallback preference (only if transcript is purely numeric or ambiguous).
 */
export function resolveVoiceTurnLanguage(
  transcript: string,
  preferredLanguage?: string,
  providerDetectedLang?: string,
): VoiceTurnLanguageContext {
  const turnId = randomUUID();
  const trimmed = transcript.trim();

  // Current turn detection is the primary authority
  const detectedLanguage = detectConversationLanguage(
    trimmed,
    providerDetectedLang || preferredLanguage || "en",
  );

  const effectiveLanguage = (providerDetectedLang && providerDetectedLang.toLowerCase().startsWith(detectedLanguage))
    ? providerDetectedLang
    : (preferredLanguage && preferredLanguage.toLowerCase().startsWith(detectedLanguage))
      ? preferredLanguage
      : detectedLanguage;

  const responseLanguage = detectedLanguage;

  // Resolve standard ISO language code for Timbre TTS
  let ttsLanguageCode = "en-IN";
  if (responseLanguage === "hi") {
    ttsLanguageCode = "hi-IN";
  } else if (responseLanguage === "mr") {
    ttsLanguageCode = "mr-IN";
  } else if (responseLanguage === "hinglish") {
    ttsLanguageCode = "hi-IN";
  } else {
    ttsLanguageCode = "en-IN";
  }

  const isFallbackUsed = !trimmed || /^[0-9+\-()\s@.]+$/.test(trimmed);

  return {
    turnId,
    transcript: trimmed,
    detectedLanguage,
    effectiveLanguage,
    responseLanguage,
    sttLanguageCode: providerDetectedLang,
    ttsLanguageCode,
    source: isFallbackUsed ? "explicit_preference_fallback" : "current_turn_detection",
  };
}

/**
 * Emits structured logging for voice turn language resolution.
 * Privacy-conscious: never logs sensitive message content.
 */
export function logVoiceTurnLanguage(ctx: VoiceTurnLanguageContext): void {
  console.log(
    `[VoiceLanguage]\n` +
    `turnId=${ctx.turnId}\n` +
    `transcriptLanguage=${ctx.detectedLanguage}\n` +
    `effectiveLanguage=${ctx.effectiveLanguage}\n` +
    `responseLanguage=${ctx.responseLanguage}\n` +
    `ttsLanguage=${ctx.ttsLanguageCode}\n` +
    `source=${ctx.source}`
  );
}
