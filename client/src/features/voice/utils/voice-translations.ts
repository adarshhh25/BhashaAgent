/**
 * Multilingual Voice UI Localizations
 *
 * Supports:
 * - English (en)
 * - Hindi (hi)
 * - Marathi (mr)
 * - Hinglish (hi-Latn / en-IN)
 */

import type { SupportedLanguage } from '../../conversations/types/conversation.types';
import type { VoicePresentationState, VoiceOrbState } from '../types/voice.types';

export interface VoiceStrings {
  tapToSpeak: string;
  listening: string;
  thinking: string;
  speaking: string;
  connecting: string;
  reconnecting: string;
  requestingPermission: string;
  permissionRequired: string;
  permissionDenied: string;
  microphoneUnavailable: string;
  stopListening: string;
  cancel: string;
  playResponse: string;
  pausePlayback: string;
  stopPlayback: string;
  interrupted: string;
  playbackFailed: string;
  voiceError: string;
  tryAgain: string;
  voiceModeTitle: string;
  switchText: string;
  transcriptPlaceholder: string;
}

export const VOICE_TRANSLATIONS: Record<SupportedLanguage, VoiceStrings> = {
  en: {
    tapToSpeak: 'Tap to speak',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    requestingPermission: 'Requesting microphone access…',
    permissionRequired: 'Microphone permission required',
    permissionDenied: 'Microphone permission denied. Please enable in Chrome settings.',
    microphoneUnavailable: 'Microphone unavailable on this device.',
    stopListening: 'Stop listening',
    cancel: 'Cancel voice interaction',
    playResponse: 'Play response',
    pausePlayback: 'Pause playback',
    stopPlayback: 'Stop playback',
    interrupted: 'Interrupted',
    playbackFailed: 'Audio playback failed',
    voiceError: 'Voice connection error',
    tryAgain: 'Try again',
    voiceModeTitle: 'Voice Assistant',
    switchText: 'Switch to text chat',
    transcriptPlaceholder: 'Speak naturally in English, हिन्दी, मराठी, or Hinglish...',
  },
  hi: {
    tapToSpeak: 'बोलने के लिए टैप करें',
    listening: 'सुन रहे हैं…',
    thinking: 'सोच रहे हैं…',
    speaking: 'बोल रहे हैं…',
    connecting: 'कनेक्ट हो रहा है…',
    reconnecting: 'पुनः कनेक्ट हो रहा है…',
    requestingPermission: 'माइक्रोफ़ोन अनुमति का अनुरोध…',
    permissionRequired: 'माइक्रोफ़ोन अनुमति आवश्यक है',
    permissionDenied: 'माइक्रोफ़ोन अनुमति अस्वीकृत। कृपया Chrome सेटिंग्स में अनुमति दें।',
    microphoneUnavailable: 'इस डिवाइस पर माइक्रोफ़ोन उपलब्ध नहीं है।',
    stopListening: 'सुनना बंद करें',
    cancel: 'आवाज़ रद्द करें',
    playResponse: 'उत्तर सुनें',
    pausePlayback: 'रोकें',
    stopPlayback: 'ऑडियो बंद करें',
    interrupted: 'बाधित हुआ',
    playbackFailed: 'ऑडियो प्लेबैक विफल रहा',
    voiceError: 'आवाज़ कनेक्शन त्रुटि',
    tryAgain: 'पुनः प्रयास करें',
    voiceModeTitle: 'आवाज़ सहायक',
    switchText: 'टेक्स्ट चैट पर जाएं',
    transcriptPlaceholder: 'प्राकृतिक रूप से हिन्दी, मराठी, English या Hinglish में बोलें...',
  },
  mr: {
    tapToSpeak: 'बोलण्यासाठी टॅप करा',
    listening: 'ऐकत आहे…',
    thinking: 'विचार करत आहे…',
    speaking: 'बोलत आहे…',
    connecting: 'कनेक्ट होत आहे…',
    reconnecting: 'पुन्हा कनेक्ट होत आहे…',
    requestingPermission: 'मायक्रोफोन परवानगी मागितली जात आहे…',
    permissionRequired: 'मायक्रोफोन परवानगी आवश्यक आहे',
    permissionDenied: 'मायक्रोफोन परवानगी नाकारली. कृपया Chrome सेटिंग्जमध्ये परवानगी द्या.',
    microphoneUnavailable: 'या डिव्हाइसवर मायक्रोफोन उपलब्ध नाही.',
    stopListening: 'ऐकणे थांबवा',
    cancel: 'संवाद रद्द करा',
    playResponse: 'उत्तर ऐका',
    pausePlayback: 'थांबवा',
    stopPlayback: 'ऑडिओ बंद करा',
    interrupted: 'व्यत्यय आला',
    playbackFailed: 'ऑडिओ प्लेबॅक अयशस्वी',
    voiceError: 'आवाज कनेक्शन त्रुटी',
    tryAgain: 'पुन्हा प्रयत्न करा',
    voiceModeTitle: 'व्हॉइस सहाय्यक',
    switchText: 'मजकूर चॅटवर जा',
    transcriptPlaceholder: 'मराठी, हिन्दी, English किंवा Hinglish मध्ये सहजपणे बोला...',
  },
  hinglish: {
    tapToSpeak: 'Bolne ke liye tap karein',
    listening: 'Sun rahe hain…',
    thinking: 'Soch rahe hain…',
    speaking: 'Bol rahe hain…',
    connecting: 'Connect ho raha hai…',
    reconnecting: 'Reconnect ho raha hai…',
    requestingPermission: 'Mic permission maangi ja rahi hai…',
    permissionRequired: 'Mic permission zaroori hai',
    permissionDenied: 'Mic permission deny ho gayi. Chrome settings mein allow karein.',
    microphoneUnavailable: 'Device par mic available nahi hai.',
    stopListening: 'Sunna band karein',
    cancel: 'Voice cancel karein',
    playResponse: 'Response sunein',
    pausePlayback: 'Pause karein',
    stopPlayback: 'Stop karein',
    interrupted: 'Interrupted',
    playbackFailed: 'Audio playback fail ho gaya',
    voiceError: 'Voice connection error',
    tryAgain: 'Phir se try karein',
    voiceModeTitle: 'Voice Assistant',
    switchText: 'Text chat par jaayein',
    transcriptPlaceholder: 'Naturally Hinglish, Hindi, Marathi, ya English mein bolein...',
  },
};

/**
 * Get localized voice strings for selected language.
 */
export function getVoiceStrings(language: SupportedLanguage = 'en'): VoiceStrings {
  return VOICE_TRANSLATIONS[language] || VOICE_TRANSLATIONS.en;
}

/**
 * Get localized state label for presentation state.
 */
export function getLocalizedStateLabel(
  state: VoicePresentationState,
  language: SupportedLanguage = 'en',
): string {
  const strings = getVoiceStrings(language);
  switch (state) {
    case 'IDLE':
      return strings.tapToSpeak;
    case 'REQUESTING_PERMISSION':
      return strings.requestingPermission;
    case 'CONNECTING':
      return strings.connecting;
    case 'LISTENING':
      return strings.listening;
    case 'PROCESSING':
      return strings.thinking;
    case 'SPEAKING':
      return strings.speaking;
    case 'INTERRUPTED':
      return strings.interrupted;
    case 'RECONNECTING':
      return strings.reconnecting;
    case 'CANCELLING':
      return strings.cancel;
    case 'ERROR':
      return strings.voiceError;
    default:
      return strings.tapToSpeak;
  }
}

/**
 * Map high-level presentation state to Voice Orb visual state.
 */
export function mapToVoiceOrbState(state: VoicePresentationState): VoiceOrbState {
  switch (state) {
    case 'CONNECTING':
    case 'RECONNECTING':
    case 'PROCESSING':
      return 'thinking';
    case 'LISTENING':
      return 'listening';
    case 'SPEAKING':
      return 'speaking';
    case 'IDLE':
    case 'REQUESTING_PERMISSION':
    case 'INTERRUPTED':
    case 'CANCELLING':
    case 'ERROR':
    default:
      return 'idle';
  }
}
