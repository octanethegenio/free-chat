
import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowUp,
  Menu, 
  Plus, 
  Settings, 
  Trash2, 
  Key, 
  Bot, 
  X,
  Image as ImageIcon,
  FileText,
  Globe,
  Copy,
  RotateCcw,
  Pencil,
  Check,
  PanelLeft,
  Sun,
  Moon,
  Square,
  ArrowDown,
  MessageSquare,
  Paperclip,
  PenSquare
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, Message, OpenRouterModel, Role, Attachment } from './types';
import { OpenRouterService } from './services/openRouter';
import { ModelSelector } from './components/ModelSelector';
import { MarkdownRenderer } from './components/MarkdownRenderer';

// --- CONSTANTS ---
const STORAGE_KEY_API = 'omnichat_api_key';
const STORAGE_KEY_SESSIONS = 'omnichat_sessions';
const STORAGE_KEY_CURRENT = 'omnichat_current_id';
const STORAGE_KEY_THEME = 'omnichat_theme';
const STORAGE_KEY_INSTRUCTIONS = 'omnichat_custom_instructions';
const DEFAULT_MODEL = 'openai/gpt-3.5-turbo';

// --- UTILS ---
const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

// --- COMPONENTS ---

const AttachmentPreview: React.FC<{ attachment: Attachment; onRemove: () => void }> = ({ attachment, onRemove }) => (
  <div className="relative group flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden w-16 h-16 border border-gray-200 dark:border-gray-700 shrink-0">
    {attachment.type === 'image' ? (
      <img src={attachment.content} alt="preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
    ) : (
      <FileText className="text-gray-400 w-8 h-8" />
    )}
    <button 
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className="absolute top-0.5 right-0.5 bg-black/50 hover:bg-black/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <X size={10} />
    </button>
  </div>
);

// --- MAIN APP ---

const App: React.FC = () => {
  // State
  const [apiKey, setApiKey] = useState<string>('');
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Controls desktop collapse & mobile open
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Editing State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const serviceRef = useRef<OpenRouterService | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---

  // Theme Initialization & Handling
  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY_THEME) as 'dark' | 'light' | null;
    const preferredTheme = storedTheme || 'dark'; // Default to dark
    setTheme(preferredTheme);
    
    if (preferredTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem(STORAGE_KEY_THEME, newTheme);
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Initialize App Data
  useEffect(() => {
    const storedKey = localStorage.getItem(STORAGE_KEY_API);
    const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    const storedCurrent = localStorage.getItem(STORAGE_KEY_CURRENT);
    const storedInstructions = localStorage.getItem(STORAGE_KEY_INSTRUCTIONS);

    if (storedKey) {
      let trimmedKey = storedKey.trim();
      if (trimmedKey.toLowerCase().startsWith('bearer ')) {
         trimmedKey = trimmedKey.slice(7).trim();
      }
      setApiKey(trimmedKey);
      serviceRef.current = new OpenRouterService(trimmedKey);
      fetchModels(trimmedKey);
    } else {
      setIsSettingsModalOpen(true);
      setTimeout(() => apiKeyInputRef.current?.focus(), 100);
    }

    if (storedInstructions) {
      setCustomInstructions(storedInstructions);
    }

    if (storedSessions) {
      try {
        const parsed = JSON.parse(storedSessions);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to parse sessions from local storage", e);
        setSessions({});
      }
    }

    if (storedCurrent) {
       setCurrentSessionId(storedCurrent);
    }

    const handleResize = () => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    
    if (!storedSessions && !storedCurrent) {
        handleResize(); 
    }
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem(STORAGE_KEY_CURRENT, currentSessionId);
      if (sessions[currentSessionId]?.modelId) {
        setSelectedModelId(sessions[currentSessionId].modelId);
      }
      // Reset scroll button when changing sessions
      setShowScrollButton(false);
    }
  }, [currentSessionId, sessions]);

  // Textarea Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  // Edit Textarea Auto-resize
  useEffect(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = `${Math.min(editTextareaRef.current.scrollHeight, 300)}px`;
    }
  }, [editContent]);

  // --- ACTIONS ---

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fetchModels = async (key: string) => {
    setIsLoadingModels(true);
    try {
      const tempService = new OpenRouterService(key);
      const fetchedModels = await tempService.getModels();
      setModels(fetchedModels);
    } catch (e) {
      console.error("Failed to fetch models", e);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // API Key Logic
    let trimmedKey = apiKey.trim();
    if (trimmedKey) {
      if (trimmedKey.toLowerCase().startsWith('bearer ')) {
         trimmedKey = trimmedKey.slice(7).trim();
      }
      localStorage.setItem(STORAGE_KEY_API, trimmedKey);
      setApiKey(trimmedKey);
      serviceRef.current = new OpenRouterService(trimmedKey);
      fetchModels(trimmedKey);
    }

    // Instructions Logic
    localStorage.setItem(STORAGE_KEY_INSTRUCTIONS, customInstructions);

    if (trimmedKey) {
        setIsSettingsModalOpen(false);
    }
  };

  const createNewSession = () => {
    // If already on a new/empty chat (either null or empty session), just focus input
    if (currentSessionId === null || (sessions[currentSessionId] && sessions[currentSessionId].messages.length === 0)) {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      textareaRef.current?.focus();
      return;
    }

    // Otherwise switch to "null" state (Empty View) without creating a session object yet
    setCurrentSessionId(null);
    setInputMessage('');
    setAttachments([]);
    setIsWebSearchEnabled(false);
    
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = { ...sessions };
    delete newSessions[id];
    setSessions(newSessions);
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = uuidv4();
      try {
        if (file.type.startsWith('image/')) {
          const content = await readFileAsBase64(file);
          newAttachments.push({ id, type: 'image', name: file.name, content, mimeType: file.type });
        } else {
          // Treat PDFs and other text-like files as text content for now
          const content = await readFileAsText(file);
          newAttachments.push({ id, type: 'text', name: file.name, content });
        }
      } catch (err) {
        console.error("File read error", err);
      }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      await processFiles(e.clipboardData.files);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleScroll = () => {
    if (chatContainerRef.current && messagesEndRef.current) {
      const containerBounds = chatContainerRef.current.getBoundingClientRect();
      const endBounds = messagesEndRef.current.getBoundingClientRect();
      const isScrolledUp = endBounds.top > containerBounds.bottom + 50;
      setShowScrollButton(isScrolledUp);
    } else {
      setShowScrollButton(false);
    }
  };

  const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setIsGenerating(false);
  };

  const generateResponse = async (sessionId: string, history: Message[], userMsgIdToScrollTo?: string) => {
    setIsGenerating(true);
    
    const assistantMsgId = uuidv4();
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: Role.Assistant,
      content: '',
      timestamp: Date.now() + 1,
      isThinking: true 
    };

    setSessions(prev => {
      const session = prev[sessionId];
      if (!session) return prev;
      return {
        ...prev,
        [sessionId]: {
          ...session,
          messages: [...history, assistantPlaceholder],
          lastModified: Date.now()
        }
      };
    });

    if (userMsgIdToScrollTo) {
        setTimeout(() => {
            scrollToMessage(userMsgIdToScrollTo);
        }, 50);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Pass customInstructions to streamChat
      const stream = serviceRef.current!.streamChat(
        history, 
        selectedModelId, 
        isWebSearchEnabled, 
        customInstructions, 
        abortController.signal
      );

      let fullContent = '';
      
      for await (const chunk of stream) {
        fullContent += chunk;
        setSessions(prev => {
          const sess = prev[sessionId];
          if (!sess) return prev;
          const msgs = [...sess.messages];
          const lastMsgIndex = msgs.findIndex(m => m.id === assistantMsgId);
          if (lastMsgIndex !== -1) {
            msgs[lastMsgIndex] = { 
              ...msgs[lastMsgIndex], 
              content: fullContent,
              isThinking: true 
            };
          }
          return { ...prev, [sessionId]: { ...sess, messages: msgs } };
        });
      }
      
      setSessions(prev => {
        const sess = prev[sessionId];
        if (!sess) return prev;
        const msgs = [...sess.messages];
        const lastMsgIndex = msgs.findIndex(m => m.id === assistantMsgId);
        if (lastMsgIndex !== -1) {
            msgs[lastMsgIndex] = { 
                ...msgs[lastMsgIndex], 
                isThinking: false 
            };
        }
        return { ...prev, [sessionId]: { ...sess, messages: msgs } };
      });

    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate response.";
      
      if (
        errorMessage.toLowerCase().includes("user not found") || 
        errorMessage.toLowerCase().includes("unauthorized") || 
        errorMessage.toLowerCase().includes("invalid api key")
      ) {
        localStorage.removeItem(STORAGE_KEY_API);
        setApiKey('');
        setIsSettingsModalOpen(true);
      }

      if (error.name === 'AbortError') {
        console.log('Generation stopped by user');
        setSessions(prev => {
          const sess = prev[sessionId];
          if (!sess) return prev;
          const msgs = [...sess.messages];
          const lastMsgIndex = msgs.findIndex(m => m.id === assistantMsgId);
          if (lastMsgIndex !== -1) {
            msgs[lastMsgIndex] = { 
              ...msgs[lastMsgIndex], 
              isThinking: false
            };
          }
          return { ...prev, [sessionId]: { ...sess, messages: msgs } };
        });
      } else {
        console.error("Chat Error", error);
        setSessions(prev => {
          const sess = prev[sessionId];
          if (!sess) return prev;
          const msgs = [...sess.messages];
          const lastMsgIndex = msgs.findIndex(m => m.id === assistantMsgId);
          if (lastMsgIndex !== -1) {
            msgs[lastMsgIndex] = { 
              ...msgs[lastMsgIndex], 
              content: `Error: ${errorMessage}`,
              isError: true,
              isThinking: false
            };
          }
          return { ...prev, [sessionId]: { ...sess, messages: msgs } };
        });
      }
    } finally {
      setIsGenerating(false);
      setIsWebSearchEnabled(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && attachments.length === 0) || isGenerating || !serviceRef.current) return;

    let sessionId = currentSessionId;
    
    if (!sessionId || !sessions[sessionId]) {
      sessionId = uuidv4();
      const newSession: ChatSession = {
        id: sessionId,
        title: inputMessage.slice(0, 30) || 'New Chat',
        messages: [],
        modelId: selectedModelId,
        lastModified: Date.now(),
      };
      setSessions(prev => ({ ...prev, [sessionId!]: newSession }));
      setCurrentSessionId(sessionId);
    }

    const userMsgId = uuidv4();
    const userMsg: Message = {
      id: userMsgId,
      role: Role.User,
      content: inputMessage,
      attachments: [...attachments],
      timestamp: Date.now()
    };

    setInputMessage('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setSessions(prev => {
        const sess = prev[sessionId!];
        if (!sess) return prev;
        const title = sess.messages.length === 0 ? (userMsg.content.slice(0, 30) || 'Image Chat') : sess.title;
        return { ...prev, [sessionId!]: { ...sess, title, modelId: selectedModelId } };
    });

    const currentSession = sessions[sessionId!] || { messages: [] };
    const history = [...currentSession.messages, userMsg];

    setSessions(prev => ({
        ...prev,
        [sessionId!]: {
            ...prev[sessionId!],
            messages: history
        }
    }));

    await generateResponse(sessionId!, history, userMsgId);
  };

  const handleRegenerate = async () => {
    if (!currentSessionId || isGenerating || !serviceRef.current) return;
    
    const session = sessions[currentSessionId];
    if (!session || !session.messages.length) return;

    const lastMsg = session.messages[session.messages.length - 1];
    
    let history = [...session.messages];
    if (lastMsg.role === Role.Assistant) {
        history.pop();
    }
    
    setSessions(prev => ({
        ...prev,
        [currentSessionId]: {
            ...prev[currentSessionId],
            messages: history
        }
    }));

    const lastUserMsg = history[history.length - 1];
    if (lastUserMsg) {
      setTimeout(() => scrollToMessage(lastUserMsg.id), 50);
    }

    await generateResponse(currentSessionId, history, lastUserMsg?.id);
  };

  const handleEdit = (messageId: string, newContent: string) => {
    if (!currentSessionId || isGenerating || !serviceRef.current) return;
    
    const session = sessions[currentSessionId];
    if (!session) return;
    const msgIndex = session.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const history = session.messages.slice(0, msgIndex);
    
    const updatedMsg: Message = {
        ...session.messages[msgIndex],
        content: newContent,
        id: uuidv4()
    };

    history.push(updatedMsg);

    setSessions(prev => ({
        ...prev,
        [currentSessionId]: {
            ...prev[currentSessionId],
            messages: history
        }
    }));

    setEditingMessageId(null);
    setEditContent('');

    scrollToMessage(updatedMsg.id);
    
    generateResponse(currentSessionId, history, updatedMsg.id);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startEditing = (msg: Message) => {
      setEditingMessageId(msg.id);
      setEditContent(msg.content);
      setTimeout(() => {
          if (editTextareaRef.current) {
              editTextareaRef.current.focus();
              editTextareaRef.current.style.height = 'auto';
              editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
          }
      }, 50);
  };

  const currentSession = currentSessionId ? sessions[currentSessionId] : null;
  const isLandingPage = !currentSessionId || (currentSession && currentSession.messages.length === 0);
  
  const sortedSessions = (Object.values(sessions) as ChatSession[])
    .filter(s => s.messages.length > 0) // Only show sessions with messages
    .sort((a, b) => b.lastModified - a.lastModified);

  // --- RENDER HELPERS ---

  const renderInputArea = (isCentered: boolean) => {
    const hasAttachments = attachments.length > 0;
    // Expanded layout is used if not centered (Chat) OR if centered but has active content (Search/Files)
    // We also use expanded layout if there's text (multiple lines support)
    const showExpandedLayout = !isCentered || (isWebSearchEnabled || hasAttachments || inputMessage.length > 50 || inputMessage.includes('\n'));

    return (
      <div 
        className={`
          relative transition-all duration-200 ease-in-out bg-gray-50 dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-600/50 shadow-sm
          ${isDragging ? 'ring-2 ring-gray-400 dark:ring-gray-500 bg-gray-100 dark:bg-[#3a3a3a]' : ''}
          ${!showExpandedLayout
             ? 'w-full rounded-[32px] px-4 py-4 flex items-center gap-3 min-h-[56px]'
             : 'w-full rounded-[26px] p-4 flex flex-col gap-3'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
         {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100/90 dark:bg-[#2f2f2f]/90 rounded-[inherit] backdrop-blur-sm">
               <span className="text-sm font-medium text-gray-500 dark:text-gray-400 pointer-events-none">Drop files to attach</span>
            </div>
         )}

         {!showExpandedLayout ? (
            // COLLAPSED HOME LAYOUT (Single Row, Centered, Clean)
            <>
               {/* Left Actions Group */}
               <div className="flex items-center gap-2 shrink-0 text-gray-400 dark:text-gray-500">
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Attach files"
                  >
                      <Plus size={20} strokeWidth={2} />
                  </button>
                  
                  <button 
                    onClick={() => setIsWebSearchEnabled(true)}
                    className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Enable Search"
                  >
                      <Globe size={18} strokeWidth={2} />
                  </button>
               </div>
               
               <div className="flex-1 relative flex items-center">
                 <textarea
                   ref={textareaRef}
                   value={inputMessage}
                   onChange={(e) => setInputMessage(e.target.value)}
                   onKeyDown={handleKeyDown}
                   onPaste={handlePaste}
                   placeholder="Ask anything"
                   className="w-full bg-transparent border-none focus:ring-0 resize-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 scrollbar-hide leading-relaxed outline-none text-lg py-0"
                   rows={1}
                   style={{ minHeight: '28px' }} // Ensures alignment with icons
                   autoFocus
                 />
               </div>
               
               {/* Right Action (Send) */}
               <div className="flex items-center shrink-0">
                  <button
                   onClick={isGenerating ? handleStopGeneration : handleSendMessage}
                   disabled={!isGenerating && !inputMessage.trim()}
                   className={`
                      w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
                      ${(inputMessage.trim()) || isGenerating 
                        ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-80 shadow-sm' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}
                   `}
                 >
                    {isGenerating ? <Square fill="currentColor" size={10} /> : <ArrowUp size={18} className="stroke-[2.5px]" />}
                 </button>
               </div>
            </>
         ) : (
            // EXPANDED LAYOUT (Standard for Search Enabled or Chat Mode)
            <>
               <div className="relative w-full">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={isCentered ? "Ask anything" : "Message OmniChat..."}
                    className={`
                      w-full bg-transparent border-none focus:ring-0 resize-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 scrollbar-hide leading-relaxed outline-none
                      ${isCentered ? 'text-lg min-h-[28px]' : 'text-[15px] min-h-[24px]'}
                    `}
                    rows={1}
                    autoFocus
                  />
               </div>

               {/* Attachments Area */}
               {attachments.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto py-1 scrollbar-thin">
                    {attachments.map(att => (
                       <AttachmentPreview key={att.id} attachment={att} onRemove={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} />
                    ))}
                  </div>
               )}

               {/* Tools Row */}
               <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                        title="Attach files"
                      >
                         <Plus size={20} strokeWidth={2} />
                      </button>
                      <button 
                         onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                         className={`
                           flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors duration-200 border
                           ${isWebSearchEnabled 
                             ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400' 
                             : 'border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}
                         `}
                         title="Toggle Search"
                      >
                         <Globe size={18} strokeWidth={2} />
                         <span className={`text-sm font-medium ${isWebSearchEnabled ? '' : 'hidden'}`}>Search</span>
                      </button>
                  </div>

                  <button
                    onClick={isGenerating ? handleStopGeneration : handleSendMessage}
                    disabled={!isGenerating && (!inputMessage.trim() && attachments.length === 0)}
                    className={`
                       w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200
                       ${(inputMessage.trim() || attachments.length > 0) || isGenerating 
                         ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-80' 
                         : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}
                    `}
                  >
                     {isGenerating ? <Square fill="currentColor" size={10} className="animate-pulse" /> : <ArrowUp size={18} className="stroke-[2.5px]" />}
                  </button>
               </div>
            </>
         )}
      </div>
    );
  };

  // --- RENDER ---

  return (
    <div className="flex h-screen bg-white dark:bg-[#212121] text-gray-900 dark:text-gray-100 overflow-hidden font-sans selection:bg-gray-300/30 dark:selection:bg-gray-600/30 transition-colors duration-300">
      
      {/* FIXED TOP LEFT CONTROLS - Always visible and stationary */}
      <div className="fixed top-0 left-0 z-[60] h-14 flex items-center gap-2 px-4 pointer-events-none w-full sm:w-auto">
         {/* Pointer events auto for the interactive elements */}
         <div className="pointer-events-auto flex items-center gap-2">
           {/* Sidebar Toggle */}
           <button 
             onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
             title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
           >
             {isSidebarOpen ? <PanelLeft size={20} /> : <Menu size={20} />}
           </button>

           {/* New Chat Button */}
           <button 
             onClick={createNewSession}
             className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
             title="New chat"
           >
             <PenSquare size={20} />
           </button>
         </div>
      </div>

      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileUpload}
        accept="image/*,text/*,.js,.py,.json,.ts,.tsx,.md,.txt,.pdf" 
      />

      {/* MOBILE OVERLAY */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-50 bg-gray-50 dark:bg-sidebar flex flex-col transition-all duration-300 ease-in-out border-r border-gray-200 dark:border-white/5 
        ${isSidebarOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0'}
        overflow-hidden
      `}>
        {/* 
          Fixed-width wrapper prevents text wrapping/squashing during width transition 
          Added pt-14 to accommodate the fixed top controls
        */}
        <div className="w-[260px] min-w-[260px] flex flex-col h-full pt-14">
          
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500">Recent</div>
            {sortedSessions.map(session => (
              <button
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`
                  group relative flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-left transition-all
                  ${currentSessionId === session.id 
                     ? 'bg-gray-200 dark:bg-[#2f2f2f] text-gray-900 dark:text-white font-medium' 
                     : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-[#212121]'}
                `}
              >
                <span className="truncate flex-1 pr-8">{session.title || 'New Chat'}</span>
                <div 
                  onClick={(e) => deleteSession(e, session.id)}
                  className={`absolute right-2 p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity ${currentSessionId === session.id ? 'opacity-100' : ''}`}
                >
                  <Trash2 size={14} />
                </div>
              </button>
            ))}
          </div>

          <div className="p-2 border-t border-gray-200 dark:border-white/5 space-y-1">
             <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center gap-3 px-3 py-3 w-full hover:bg-gray-200 dark:hover:bg-[#2f2f2f] rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent flex items-center justify-center text-gray-700 dark:text-gray-200">
                 <Settings size={16} />
              </div>
              <div className="flex flex-col items-start">
                 <span className="font-medium">Settings</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-white dark:bg-main transition-colors duration-300">
        
        {/* TOP BAR - Spacer / Background for content scrolling */}
        <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 sticky top-0 z-20 bg-white/80 dark:bg-main/95 backdrop-blur border-b border-transparent transition-all duration-300">
          <div className={`flex items-center gap-2 transition-all duration-300 ${!isSidebarOpen ? 'pl-24' : ''}`}>
             {/* Model Selector - Moves with content, padded if sidebar closed to avoid fixed buttons */}
             <ModelSelector 
               models={models} 
               selectedModelId={selectedModelId} 
               onSelect={(id) => {
                 setSelectedModelId(id);
                 if (currentSessionId && sessions[currentSessionId]?.messages.length === 0) {
                   setSessions(prev => ({...prev, [currentSessionId]: {...prev[currentSessionId], modelId: id}}));
                 }
               }}
               isLoading={isLoadingModels} 
             />
          </div>

          {/* Right section left empty as before */}
        </div>

        {/* CHAT AREA */}
        <div 
          className="flex-1 overflow-y-auto relative scrollbar-thin scroll-smooth scroll-pb-32 md:scroll-pb-48" 
          ref={chatContainerRef}
          onScroll={handleScroll}
        >
          {isLandingPage ? (
             // EMPTY STATE (New Chat)
             <div className="flex flex-col items-center justify-center h-full px-4 animate-fade-in pb-48">
                <h2 className="text-3xl font-medium text-gray-800 dark:text-gray-100 mb-8 text-center">
                    Ready when you are.
                </h2>
                <div className="w-full max-w-2xl">
                    {renderInputArea(true)}
                </div>
             </div>
          ) : (
            // MESSAGES
            <div className="flex flex-col w-full max-w-3xl mx-auto px-4 pt-6 space-y-6 pb-[85vh]">
              {currentSession?.messages.map((msg, index) => {
                const isLast = index === currentSession.messages.length - 1;
                const isAssistant = msg.role === Role.Assistant;
                const isEditing = editingMessageId === msg.id;

                return (
                  <div 
                    key={msg.id} 
                    id={`message-${msg.id}`}
                    className={`
                       w-full group scroll-mt-20 animate-slide-up 
                       ${isEditing ? 'block' : (msg.role === Role.User ? 'flex justify-end' : 'flex justify-start')}
                    `}
                  >
                     <div className={`
                        flex gap-4 max-w-full
                        ${isEditing ? 'w-full' : (msg.role === Role.User ? 'justify-end' : '')}
                        ${msg.role === Role.Assistant ? 'w-full' : (isEditing ? 'w-full' : 'md:max-w-[90%]')}
                     `}>
                        
                        <div className={`
                          relative flex flex-col min-w-0
                          ${isEditing ? 'w-full' : (msg.role === Role.User ? 'items-end w-full' : 'items-start flex-1')}
                        `}>
                           
                           {/* Content Bubble */}
                           {editingMessageId === msg.id ? (
                               <div className="w-full bg-gray-50 dark:bg-[#2f2f2f] p-4 rounded-xl border border-gray-200 dark:border-gray-600 animate-fade-in">
                                   <textarea
                                      ref={editTextareaRef}
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none resize-none font-sans text-[15px] leading-relaxed"
                                   />
                                   <div className="flex justify-end gap-2 mt-3">
                                       <button 
                                         onClick={() => setEditingMessageId(null)}
                                         className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium transition-colors"
                                       >
                                           Cancel
                                       </button>
                                       <button 
                                         onClick={() => handleEdit(msg.id, editContent)}
                                         className="px-3 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 text-sm font-medium transition-colors"
                                       >
                                           Send
                                       </button>
                                   </div>
                               </div>
                           ) : (
                               <>
                                  {/* Attachments */}
                                  {msg.attachments && msg.attachments.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mb-2 justify-end">
                                      {msg.attachments.map(att => (
                                          <div key={att.id} className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 w-32 md:w-48">
                                          {att.type === 'image' ? (
                                              <img src={att.content} alt="att" className="w-full h-auto" />
                                          ) : (
                                              <div className="p-3 bg-gray-100 dark:bg-gray-800 text-xs flex items-center gap-2">
                                              <FileText size={14} className="text-gray-500" />
                                              <span className="truncate text-gray-700 dark:text-gray-300">{att.name}</span>
                                              </div>
                                          )}
                                          </div>
                                      ))}
                                      </div>
                                  )}
  
                                  <div className={`
                                  text-[15px] leading-relaxed max-w-full relative group
                                  ${msg.role === Role.User 
                                      ? 'bg-gray-100 dark:bg-[#2f2f2f] text-gray-900 dark:text-gray-100 rounded-3xl rounded-br-md px-5 py-3.5' 
                                      : 'bg-transparent text-gray-900 dark:text-gray-100 w-full pt-1 pb-2'}
                                  `}>
                                      <MarkdownRenderer 
                                          content={msg.content} 
                                          isThinking={msg.isThinking} 
                                      />

                                      {/* Streaming Marker */}
                                      {isLast && isAssistant && isGenerating && <div id="streaming-end-marker" className="h-1 w-1 opacity-0" />}
                                          
                                      {/* User Edit & Copy Actions (Hover Only) */}
                                      {msg.role === Role.User && !isGenerating && (
                                        <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                          <button 
                                            onClick={() => startEditing(msg)}
                                            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                                            title="Edit message"
                                          >
                                            <Pencil size={14} />
                                          </button>
                                          <button 
                                            onClick={() => handleCopy(msg.content, msg.id)}
                                            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                                            title="Copy message"
                                          >
                                            {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                          </button>
                                        </div>
                                      )}
                                  </div>
                               </>
                           )}
  
                           {/* Assistant Tools Row (Below message) - Hover Only */}
                           {!editingMessageId && !msg.isThinking && !msg.isError && msg.role === Role.Assistant && (
                             <div className="flex items-center gap-2 mt-2 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <button 
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                  className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
                                  title="Copy"
                                >
                                  {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                                {index === currentSession.messages.length - 1 && (
                                  <button 
                                    onClick={handleRegenerate}
                                    className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
                                    title="Regenerate"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                             </div>
                           )}
                        </div>
                     </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* INPUT AREA - Only shown at bottom when NOT landing page */}
        {!isLandingPage && (
            <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-main px-4 pb-6 pt-2 transition-colors duration-300">
                <div className="max-w-3xl mx-auto relative">
                    {showScrollButton && (
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                            <button 
                            className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all animate-fade-in"
                            onClick={scrollToBottom}
                            >
                            <ArrowDown size={14} />
                            <span>Scroll to bottom</span>
                            </button>
                        </div>
                    )}
                    
                    {renderInputArea(false)}

                    <div className="text-center mt-2">
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            OmniChat can make mistakes. Check important info.
                        </p>
                    </div>
                </div>
            </div>
        )}

      </div>

      {/* SETTINGS MODAL (Merged API Key & Custom Instructions) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center px-4 backdrop-blur-sm">
           <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings size={20} className="text-gray-500" />
                  Settings
                </h2>
                <button onClick={() => setIsSettingsModalOpen(false)} className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSettingsSubmit} className="space-y-6">
                 {/* Appearance Section */}
                 <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Appearance</label>
                    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-[#2d2d2d] rounded-xl">
                       <button 
                         type="button"
                         onClick={() => { if(theme !== 'light') toggleTheme(); }}
                         className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                       >
                         <Sun size={16} /> Light
                       </button>
                       <button 
                         type="button"
                         onClick={() => { if(theme !== 'dark') toggleTheme(); }}
                         className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-[#404040] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                       >
                         <Moon size={16} /> Dark
                       </button>
                    </div>
                 </div>

                 {/* API Key Section */}
                 <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">OpenRouter API Key</label>
                    <div className="relative">
                      <input 
                        ref={apiKeyInputRef}
                        type="password" 
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-or-..."
                        className="w-full bg-gray-100 dark:bg-[#2d2d2d] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all pl-10"
                        autoComplete="off"
                      />
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Required to access models. Stored locally on your device.
                    </p>
                 </div>
                 
                 {/* Custom Instructions Section */}
                 <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">System Prompt / Custom Instructions</label>
                    <div className="relative">
                      <textarea 
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                        placeholder="e.g. 'You are a senior React engineer. Always answer with code examples first.'"
                        className="w-full bg-gray-100 dark:bg-[#2d2d2d] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all min-h-[120px] resize-y text-sm leading-relaxed"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">
                      These instructions are injected into every conversation as the "System" role.
                    </p>
                 </div>

                 <div className="pt-2">
                   <button 
                     type="submit" 
                     disabled={!apiKey.trim()}
                     className={`
                       w-full py-3 rounded-xl font-semibold text-sm transition-all transform active:scale-[0.99]
                       ${apiKey.trim() ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-80' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'}
                     `}
                   >
                     Save Settings
                   </button>
                 </div>
              </form>
              
              {!apiKey && (
                <div className="mt-4 text-center">
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 underline transition-colors">
                    Get your API key here
                  </a>
                </div>
              )}
           </div>
        </div>
      )}

    </div>
  );
};

export default App;
