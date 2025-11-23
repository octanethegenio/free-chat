export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export enum Role {
  User = 'user',
  Assistant = 'assistant',
  System = 'system'
}

export interface Attachment {
  id: string;
  type: 'image' | 'text' | 'file';
  name: string;
  content: string; // Base64 for images, text for text files
  mimeType?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  thought?: string; // For reasoning models
  isError?: boolean;
  isThinking?: boolean; // Loading state for thinking
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  lastModified: number;
}

export interface AppState {
  apiKey: string;
  models: OpenRouterModel[];
  currentSessionId: string | null;
  sessions: Record<string, ChatSession>;
  isSidebarOpen: boolean;
}