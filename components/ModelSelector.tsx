import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Search, Zap, Box } from 'lucide-react';
import { OpenRouterModel } from '../types';

interface ModelSelectorProps {
  models: OpenRouterModel[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  isLoading: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ models, selectedModelId, onSelect, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = models.find(m => m.id === selectedModelId);

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const lower = search.toLowerCase();
    return models.filter(m => 
      m.name.toLowerCase().includes(lower) || 
      m.id.toLowerCase().includes(lower)
    );
  }, [models, search]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors text-gray-900 dark:text-gray-200 min-w-[160px] max-w-[240px] md:min-w-[220px] md:max-w-[320px]"
        disabled={isLoading}
        title={selectedModel?.name}
      >
        <div className="flex items-center gap-3 overflow-hidden text-left">
          <div className="w-8 h-8 rounded-md bg-gray-200 dark:bg-gray-700/50 flex items-center justify-center shrink-0">
             <Zap className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex flex-col overflow-hidden">
             <span className="truncate font-medium block w-full leading-tight">
              {selectedModel ? selectedModel.name : (isLoading ? "Loading..." : "Select Model")}
            </span>
            {selectedModel && <span className="text-[10px] text-gray-500 truncate block w-full leading-none mt-0.5 uppercase tracking-wider font-mono">{selectedModel.id.split('/')[0]}</span>}
          </div>
        </div>
        <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-[90vw] md:w-[450px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-[60vh] flex flex-col animate-fade-in ring-1 ring-black/10 dark:ring-black/50">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-xl sticky top-0 z-10">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-gray-900 dark:group-focus-within:text-gray-100 transition-colors" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models (e.g. 'claude', 'gpt-4')..."
                className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm rounded-lg pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
                autoFocus
              />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 scrollbar-thin">
            {filteredModels.length === 0 ? (
              <div className="py-12 text-sm text-gray-500 text-center flex flex-col items-center gap-3">
                <Box size={32} className="opacity-30"/>
                <span>No models found matching "{search}"</span>
              </div>
            ) : (
              filteredModels.map((model) => {
                 const isSelected = selectedModelId === model.id;
                 return (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelect(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-3 text-sm rounded-lg flex items-start justify-between hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all mb-1 border border-transparent group ${
                      isSelected ? 'bg-gray-100 dark:bg-gray-700/80 border-gray-200 dark:border-gray-600' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex flex-col gap-1 pr-3 flex-1 min-w-0">
                      <span className={`font-medium leading-snug break-words ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white'}`}>
                        {model.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-mono opacity-70">
                        <span className="truncate">{model.id}</span>
                        {model.context_length && (
                           <>
                             <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600"></span>
                             <span className="shrink-0">
                               {Math.round(model.context_length / 1000)}k ctx
                             </span>
                           </>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-gray-900 dark:text-white shrink-0 mt-1" />}
                  </button>
                );
              })
            )}
          </div>
           <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl text-[10px] text-gray-500 flex justify-between items-center">
             <span>{filteredModels.length} models available</span>
             <span className="font-mono opacity-50">OpenRouter</span>
           </div>
        </div>
      )}
    </div>
  );
};