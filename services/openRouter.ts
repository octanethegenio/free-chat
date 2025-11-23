import { OpenRouterModel, Message, Role } from '../types';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getModels(): Promise<OpenRouterModel[]> {
    if (!this.apiKey) return [];
    
    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      return data.data.sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Error fetching models:", error);
      return [];
    }
  }

  async *streamChat(
    messages: Message[], 
    modelId: string, 
    webSearchEnabled: boolean = false,
    customInstructions: string = '',
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey) throw new Error("API Key missing");

    // 1. Initialize API messages
    const apiMessages: any[] = [];

    // 2. Inject Custom Instructions (System Prompt) if they exist
    if (customInstructions && customInstructions.trim()) {
      apiMessages.push({
        role: Role.System,
        content: customInstructions.trim()
      });
    }

    // 3. Map History
    const historyMessages = messages.map(m => {
      // If message has attachments, format accordingly (Multimodal)
      if (m.attachments && m.attachments.length > 0 && m.role === Role.User) {
        const contentParts: any[] = [];
        
        // Add text content
        if (m.content) {
          contentParts.push({ type: 'text', text: m.content });
        }

        // Add attachments
        m.attachments.forEach(att => {
          if (att.type === 'image') {
             contentParts.push({
               type: 'image_url',
               image_url: {
                 url: att.content // Assumes base64 data:image/...
               }
             });
          } else if (att.type === 'text' || att.type === 'file') {
            // For text files, we append them to the text content part or create a new one
            contentParts.push({
              type: 'text',
              text: `\n\n--- File: ${att.name} ---\n${att.content}\n--- End File ---`
            });
          }
        });

        return {
          role: m.role,
          content: contentParts
        };
      }

      // Standard text message
      return {
        role: m.role,
        content: m.content
      };
    });

    apiMessages.push(...historyMessages);

    // 4. Inject Web Search instructions if enabled
    if (webSearchEnabled) {
      const searchInstruction = " [WEB SEARCH REQUIRED: Use the web search tool/plugin to answer the user's query with up-to-date information. Do not guess. Search for the latest data. IMPORTANT: When providing links/citations, always place them at the END of the sentence or paragraph. Do not start sentences with a citation link.]";
      
      // Check if we already have a system message (from custom instructions)
      const systemMsgIndex = apiMessages.findIndex(m => m.role === Role.System);
      
      if (systemMsgIndex !== -1) {
        // Append to existing system message
        const existingContent = apiMessages[systemMsgIndex].content;
        if (typeof existingContent === 'string') {
           apiMessages[systemMsgIndex].content += searchInstruction;
        }
      } else {
         // Create new system message if none exists
         apiMessages.unshift({ role: Role.System, content: "You are a helpful assistant." + searchInstruction });
      }
    }

    try {
      const body: any = {
        model: modelId,
        messages: apiMessages,
        stream: true
      };

      // Add web search plugin if model supports it (OpenRouter convention)
      if (webSearchEnabled) {
        body.plugins = [{ id: "web" }];
      }

      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin, 
          'X-Title': 'OmniChat Client'
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to generate response');
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let isReasoning = false; 

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const dataStr = trimmed.replace('data: ', '');
          if (dataStr === '[DONE]') return;

          try {
            const json = JSON.parse(dataStr);
            const choice = json.choices[0];
            
            const content = choice?.delta?.content;
            const reasoning = choice?.delta?.reasoning;

            // Handle reasoning stream
            if (reasoning) {
               if (!isReasoning) {
                 isReasoning = true;
                 yield '<think>';
               }
               yield reasoning;
            }
            
            // Handle content stream
            if (content) {
               if (isReasoning) {
                 isReasoning = false;
                 yield '</think>';
               }
               yield content;
            }

          } catch (e) {
            console.warn('Error parsing stream chunk', e);
          }
        }
      }
      
      // Cleanup if stream ended while reasoning
      if (isReasoning) {
        yield '</think>';
      }

    } catch (error) {
      // Re-throw abort errors so the consumer knows to stop
      if ((error as any).name === 'AbortError') {
          throw error;
      }
      console.error("Stream error:", error);
      throw error;
    }
  }
}