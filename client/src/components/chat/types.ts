import type { FactCheckResult } from "./Evidence";

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}
export interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  verifyWeb: boolean;
  evidence?: FactCheckResult | null;
  replyToId?: string | null;
}
export interface ConversationDetail extends Conversation {
  messages: Message[];
  generatingUntil: string | null;
}
export type ChatEvent =
  | { type: "accepted"; message: Message; conversation: Conversation }
  | { type: "delta"; text: string }
  | { type: "progress"; message: string }
  | { type: "evidence"; result: FactCheckResult }
  | { type: "done"; message: Message; conversation: Conversation }
  | { type: "error"; error: string }
  | { type: "heartbeat" };
