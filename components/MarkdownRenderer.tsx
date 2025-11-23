
import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ChevronDown, 
  Brain, 
  Loader2, 
  Search, 
  Clock,
  FileText,
  ExternalLink
} from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isThinking?: boolean;
}

interface SearchAction {
  type: 'query' | 'url';
  content: string;
  id: string;
}

// Helper to extract domain for favicon
const getDomain = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return 'web';
  }
};

// Helper to clean URL for display (removes https://, www, trailing slashes)
const formatDisplayUrl = (url: string) => {
  try {
    return url
      .replace(/^https?:\/\/(www\.)?/, '') // Remove protocol & www
      .replace(/\/$/, '');                 // Remove trailing slash
  } catch (e) {
    return url;
  }
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isThinking }) => {
  const [isThoughtOpen, setIsThoughtOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Reset timer when thinking starts
  useEffect(() => {
    if (isThinking) {
      setElapsedTime(0);
      const interval = setInterval(() => setElapsedTime(t => t + 0.1), 100);
      return () => clearInterval(interval);
    }
  }, [isThinking]);

  // Parse content for thoughts and actions
  const { thought, main, searchActions, activeAction } = useMemo(() => {
    let thoughts: string[] = [];
    let mainContent = content;

    // 0. Clean citation style links: ( https://... ) or ( [text](url) )
    // This removes the surrounding parentheses which some models output for citations
    const citationLinkRegex = /\(\s*(https?:\/\/[^\s\)]+)\s*\)/g;
    const citationMarkdownRegex = /\(\s*(\[[^\]]+\]\([^\)]+\))\s*\)/g;
    
    mainContent = mainContent
      .replace(citationLinkRegex, ' $1 ')
      .replace(citationMarkdownRegex, ' $1 ');

    // 1. Extract <think> blocks
    const thoughtRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
    mainContent = mainContent.replace(thoughtRegex, (match, group1) => {
      thoughts.push(group1);
      return ''; 
    });

    // 2. Extract Leaked Tool Calls
    const leakageRegex = /<\|start\|>[\s\S]*?(?:\n\n|$)/g;
    mainContent = mainContent.replace(leakageRegex, (match) => {
      thoughts.push(match.trim());
      return '';
    });

    const fullThought = thoughts.join('\n\n').trim();

    // 3. Parse Search Actions
    const extractedActions: SearchAction[] = [];
    const seenContent = new Set<string>();
    const queryRegex = /"query":\s*"([^"]+)"/g;
    const urlRegex = /"url":\s*"([^"]+)"/g;
    
    // Only look for HTTP links inside the thought block if we haven't found explicit tool calls,
    // and strictly only if the thought block exists.
    const httpRegex = /(https?:\/\/[^\s<)"']+)/g;

    let match;
    while ((match = queryRegex.exec(fullThought)) !== null) {
      const q = match[1];
      if (!seenContent.has(q)) {
        seenContent.add(q);
        extractedActions.push({ type: 'query', content: q, id: `q-${extractedActions.length}` });
      }
    }
    while ((match = urlRegex.exec(fullThought)) !== null) {
      const u = match[1];
      if (!seenContent.has(u)) {
        seenContent.add(u);
        extractedActions.push({ type: 'url', content: u, id: `u-${extractedActions.length}` });
      }
    }
    
    // Fallback: scan fullThought for URLs only if we have thoughts but no structured tool outputs
    if (fullThought.length > 0 && extractedActions.filter(a => a.type === 'url').length === 0) {
       while ((match = httpRegex.exec(fullThought)) !== null) {
          const u = match[1];
          if (!seenContent.has(u) && !u.includes('localhost') && u.length > 10) {
            seenContent.add(u);
            extractedActions.push({ type: 'url', content: u, id: `u-raw-${extractedActions.length}` });
          }
       }
    }

    // Determine active action for the header status
    let active = "Thinking Process";
    if (isThinking) {
       if (extractedActions.length > 0) {
         const last = extractedActions[extractedActions.length - 1];
         if (last.type === 'query') active = `Searching Google for "${last.content}"`;
         else if (last.type === 'url') active = `Reading content from ${getDomain(last.content)}...`;
       }
    } else {
       active = "Thought Process";
    }

    return { 
      thought: fullThought, 
      main: mainContent.trim(),
      searchActions: extractedActions,
      activeAction: active
    };
  }, [content, isThinking]);

  // Only show accordion if we have ACTUAL thought content or search actions.
  // Standard models that just output text will have empty 'thought' and empty 'searchActions'.
  const hasThoughts = thought.length > 0 || searchActions.length > 0;
  const isThinkingActive = isThinking && !main; 
  
  // Auto-open thought if we are searching to show progress, but only once
  useEffect(() => {
     if (searchActions.length > 0 && isThinking) {
         setIsThoughtOpen(true);
     }
  }, [searchActions.length > 0, isThinking]);

  // 1. PONDERING STATE (Start of generation, no tokens yet)
  // This shows briefly for ALL models to indicate responsiveness before the first token arrives.
  if (isThinking && content.trim().length === 0) {
    return (
      <div className="flex items-center py-2 px-3 gap-2.5 bg-gray-50 dark:bg-[#252525] rounded-lg border border-gray-100 dark:border-gray-800/50 animate-pulse max-w-fit mb-2">
         <Loader2 size={14} className="animate-spin text-gray-400" />
         <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Thinking...</span>
      </div>
    );
  }

  return (
    <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-100 max-w-none transition-all">
       
       {/* THOUGHT SECTION - Strictly conditional */}
       {hasThoughts && (
         <div className="mb-6 group">
           <div className={`
             rounded-xl overflow-hidden transition-all duration-300 ease-in-out border
             ${isThoughtOpen 
               ? 'bg-white dark:bg-[#1e1e1e] border-gray-200 dark:border-gray-700 shadow-sm' 
               : 'bg-gray-50 dark:bg-[#212121]/50 border-transparent hover:border-gray-200 dark:hover:border-gray-700'}
           `}>
             
             {/* Header */}
             <button 
               onClick={() => setIsThoughtOpen(!isThoughtOpen)}
               className="w-full text-left select-none focus:outline-none"
             >
               <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {/* Icon State */}
                    <div className={`
                      flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-colors
                      ${isThinkingActive 
                         ? 'text-blue-600 dark:text-blue-400' 
                         : 'text-gray-500 dark:text-gray-400'}
                    `}>
                      {isThinkingActive ? (
                         <Loader2 size={16} className="animate-spin" />
                      ) : (
                         <Brain size={16} />
                      )}
                    </div>
                    
                    {/* Status Text */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                          <span className={`
                            text-sm font-medium truncate
                            ${isThinkingActive ? 'text-gray-900 dark:text-gray-100 animate-pulse' : 'text-gray-600 dark:text-gray-400'}
                          `}>
                            {activeAction}
                          </span>
                          {!isThinkingActive && !isThoughtOpen && (
                             <span className="text-xs text-gray-400 dark:text-gray-600">Click to view</span>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isThinkingActive && searchActions.length === 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono hidden sm:block">
                           {elapsedTime.toFixed(1)}s
                        </span>
                    )}
                    <div className={`text-gray-400 dark:text-gray-600 transition-transform duration-300 shrink-0 ${isThoughtOpen ? '-rotate-180' : ''}`}>
                        <ChevronDown size={16} />
                    </div>
                  </div>
               </div>
               
               {/* Progress Bar (Visual flair when thinking) */}
               {isThinkingActive && !isThoughtOpen && (
                 <div className="h-0.5 w-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                   <div className="h-full bg-blue-500/50 dark:bg-blue-400/50 w-1/3 animate-slide-x" />
                 </div>
               )}
             </button>
             
             {/* Expanded Content */}
             {isThoughtOpen && (
               <div className="border-t border-gray-100 dark:border-gray-800/50 bg-gray-50/30 dark:bg-[#1a1a1a]/30">
                 
                 {/* 1. Activity Feed (If Web Search Used) */}
                 {searchActions.length > 0 && (
                    <div className="px-5 py-4">
                       <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Activity Feed</div>
                       <div className="space-y-0 relative">
                           {/* Connecting Line */}
                           <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

                           {searchActions.map((action, idx) => (
                             <div key={action.id} className="relative pl-8 py-2 animate-fade-in group/item">
                                <div className={`
                                  absolute left-0 top-3 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-gray-50 dark:ring-[#1a1a1a] z-10
                                  ${action.type === 'query' 
                                     ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' 
                                     : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'}
                                `}>
                                   {action.type === 'query' ? <Search size={10} /> : <FileText size={10} />}
                                </div>
                                
                                <div className="flex flex-col">
                                   <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                     {action.type === 'query' ? 'Searched Google' : 'Found Source'}
                                   </div>
                                   <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 truncate pr-4 flex items-center gap-1">
                                     {action.type === 'url' && (
                                       <img 
                                         src={`https://www.google.com/s2/favicons?domain=${getDomain(action.content)}`} 
                                         alt="" 
                                         className="w-3 h-3 rounded-[2px] opacity-70"
                                       />
                                     )}
                                     {formatDisplayUrl(action.content)}
                                   </div>
                                </div>
                             </div>
                           ))}

                           {/* Active Step Indicator */}
                           {isThinkingActive && (
                             <div className="relative pl-8 py-2 animate-pulse">
                                <div className="absolute left-0 top-3 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center ring-4 ring-gray-50 dark:ring-[#1a1a1a] z-10">
                                   <Loader2 size={10} className="animate-spin text-gray-500" />
                                </div>
                                <div className="text-xs text-gray-400 py-1">Processing results...</div>
                             </div>
                           )}
                       </div>
                    </div>
                 )}

                 {/* 2. Raw Thought Content */}
                 {thought && (
                    <div className={`px-5 pb-5 ${searchActions.length > 0 ? 'pt-2' : 'pt-4'}`}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Chain of Thought</div>
                        <div className="relative">
                        <div className="text-xs font-mono text-gray-600 dark:text-gray-400/90 leading-relaxed whitespace-pre-wrap break-words bg-white dark:bg-[#212121] p-4 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
                            {thought}
                            {isThinking && <span className="inline-block w-1.5 h-3 bg-blue-500 ml-1 animate-pulse align-middle"/>}
                        </div>
                        </div>
                    </div>
                 )}

               </div>
             )}
           </div>
         </div>
       )}

       {/* MAIN MARKDOWN CONTENT */}
       {main && (
           <div className="markdown-body animate-fade-in [&>*:first-child]:!mt-0">
             <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({node, href, children, ...props}) => {
                  if (!href) return <span>{children}</span>;
                  const domain = getDomain(href);
                  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                  const displayUrl = formatDisplayUrl(href);
                  
                  // Logic: If the text content of the link is roughly the same as the href, 
                  // it's likely a raw URL pasted by the LLM. Replace it with the clean display URL.
                  // Otherwise (e.g. markdown [link](url)), keep the author's text.
                  let contentToDisplay = children;
                  if (Array.isArray(children) && typeof children[0] === 'string') {
                      const childText = children[0] as string;
                      if (childText.includes('http') || childText.includes('www.') || childText.length > 20) {
                          contentToDisplay = displayUrl;
                      }
                  }

                  return (
                    <a 
                      href={href}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-full bg-gray-100 dark:bg-[#333333] hover:bg-gray-200 dark:hover:bg-[#404040] transition-colors duration-200 text-[10px] font-medium text-gray-700 dark:text-gray-200 no-underline align-middle transform active:scale-[1.02] border border-transparent hover:border-gray-300 dark:hover:border-gray-600 max-w-[160px] sm:max-w-[200px]"
                      {...props}
                    >
                      <img src={faviconUrl} alt="" className="w-3 h-3 rounded-[2px] opacity-80" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      <span className="truncate">{contentToDisplay}</span>
                      <ExternalLink size={8} className="opacity-50 ml-0.5" />
                    </a>
                  );
                },
                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 marker:text-gray-400" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 marker:text-gray-400" {...props} />,
                li: ({node, ...props}) => <li className="" {...props} />,
                p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-7" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 mt-6 text-gray-900 dark:text-white" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 mt-5 text-gray-900 dark:text-white" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-4 text-gray-900 dark:text-white" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic my-4 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 py-1 pr-2 rounded-r" {...props} />,
                code: ({node, className, children, ...props}: any) => {
                   const match = /language-(\w+)/.exec(className || '');
                   const isInline = !match && !String(children).includes('\n');
                   
                   return isInline ? (
                    <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded px-1.5 py-0.5 text-[0.9em] font-mono border border-gray-200 dark:border-gray-700/50" {...props}>
                      {children}
                    </code>
                  ) : (
                    <div className="my-4 rounded-lg overflow-hidden bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-gray-800 shadow-sm group">
                       <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{match ? match[1] : 'text'}</span>
                          <button 
                            onClick={() => navigator.clipboard.writeText(String(children))}
                            className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Clock size={10} className="opacity-0" /> {/* Spacer */}
                            Copy
                          </button>
                       </div>
                       <div className="p-4 overflow-x-auto bg-[#fcfcfc] dark:bg-[#0d0d0d]">
                         <code className={`${className} block font-mono text-sm text-gray-800 dark:text-gray-200 leading-relaxed`} {...props}>
                          {children}
                        </code>
                       </div>
                    </div>
                  )
                },
                table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-gray-700"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" {...props} /></div>,
                th: ({node, ...props}) => <th className="px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider" {...props} />,
                td: ({node, ...props}) => <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700" {...props} />,
                hr: ({node, ...props}) => <hr className="my-8 border-gray-200 dark:border-gray-800" {...props} />
              }}
             >
               {main || ''}
             </ReactMarkdown>
           </div>
       )}
    </div>
  );
};
