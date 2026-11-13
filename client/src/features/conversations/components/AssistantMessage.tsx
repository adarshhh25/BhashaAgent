import { Wrench } from 'lucide-react';
import { BhashaLogo } from '../../../components/common/BhashaLogo';
import type { Message } from '../types/conversation.types';

interface AssistantMessageProps {
  message: Message;
}

function cleanDisplayContent(raw: string, lang?: string | null): string {
  if (!raw) return "";
  let clean = raw.trim();
  const hasSchema = clean.includes('"intent"') || clean.includes('"responseDraft"') || clean.includes('"decision"') || clean.includes('"toolCalls"') || clean.includes('"primary"');
  if (clean.startsWith("{") || hasSchema) {
    try {
      const parsed = JSON.parse(clean);
      if (typeof parsed.responseDraft === "string" && parsed.responseDraft.trim()) {
        return cleanDisplayContent(parsed.responseDraft, lang);
      }
      if (typeof parsed.clarification?.question === "string" && parsed.clarification.question.trim()) {
        return cleanDisplayContent(parsed.clarification.question, lang);
      }
    } catch {
      const draftMatch = clean.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
      if (draftMatch && draftMatch[1]) {
        return draftMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      }
      const questionMatch = clean.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
      if (questionMatch && questionMatch[1]) {
        return questionMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      }
    }
    if (lang === "hi") {
      return "मैंने आपका फ़ॉर्म देख लिया है। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
    } else if (lang === "mr") {
      return "मी तुमचा फॉर्म पाहिला आहे. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
    } else if (lang === "hinglish") {
      return "Maine aapka form dekh liya hai. Aap kaunsa detail pehle bharna chahte hain?";
    }
    return "I can see your form. Which detail would you like to fill first?";
  }
  return clean;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const intent = message.metadata?.intent as string | undefined;
  const displayContent = cleanDisplayContent(message.content, message.language);

  return (
    <div className="flex flex-col items-start gap-1 w-full max-w-full pr-8">
      <div className="flex items-start gap-2.5 max-w-full">
        {/* Assistant Avatar */}
        <BhashaLogo
          className="w-6 h-6 rounded-full shrink-0 mt-0.5 shadow-2xs"
          alt="BhashaAgent Assistant"
        />

        {/* Message bubble */}
        <div className="flex flex-col gap-1.5 max-w-full">
          <div className="bg-card text-text-primary border border-divider px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed shadow-xs break-words">
            <p className="whitespace-pre-wrap">{displayContent}</p>
          </div>

          {/* Metadata pills (intent, decision, tool indicators) */}
          {intent && intent !== 'GENERAL_QUESTION' && intent !== 'GREETING' && (
            <div className="flex items-center gap-1.5 pl-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary bg-black/5 px-2 py-0.5 rounded-full">
                <Wrench className="w-2.5 h-2.5" />
                <span>{intent.toLowerCase().replace(/_/g, ' ')}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

