import { UIConfigField } from '@/lib/config/types';
import SettingsField from '../../SettingsField';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';

const VoicePicker = ({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) => {
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value ?? '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchVoices = async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/tts/voices');
      const data = await res.json();
      setVoices((data.voices || []).map((v: any) => ({ id: v.id, name: v.name })));
    } catch (err) {
      console.error('Failed to fetch voices:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleChange = useCallback((newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
    const key = 'tts.voice';
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: newValue }),
    }).catch(() => {});
  }, [onChange]);

  const handleSelect = (voiceId: string) => {
    handleChange(voiceId);
    setOpen(false);
  };

  const filteredVoices = inputValue
    ? voices.filter((v) =>
        v.name.toLowerCase().includes(inputValue.toLowerCase()) ||
        v.id.toLowerCase().includes(inputValue.toLowerCase()),
      )
    : voices;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative">
        <input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            handleChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type or select a voice"
          className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-3 py-2 lg:px-4 lg:py-3 pr-10 !text-xs lg:!text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/60">
          <ChevronDown className="h-4 w-4" />
        </span>

        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-light-200 bg-light-primary dark:border-dark-200 dark:bg-dark-primary shadow-lg">
            {fetching ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-black/50 dark:text-white/50">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading voices...
              </div>
            ) : filteredVoices.length === 0 ? (
              <div className="px-3 py-2 text-xs text-black/40 dark:text-white/40">
                No voices found. Click "Reload voices" to fetch.
              </div>
            ) : (
              filteredVoices.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleSelect(v.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    inputValue === v.id || inputValue === v.name
                      ? 'bg-light-secondary dark:bg-dark-secondary text-black dark:text-white'
                      : 'text-black/80 dark:text-white/80 hover:bg-light-secondary dark:hover:bg-dark-secondary'
                  }`}
                >
                  <div className="font-medium">{v.name}</div>
                  {v.id !== v.name && (
                    <div className="text-[11px] text-black/40 dark:text-white/40 font-mono">{v.id}</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        onClick={fetchVoices}
        disabled={fetching}
        className="flex flex-row items-center space-x-1 text-[11px] text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 transition-colors duration-200 disabled:opacity-50"
      >
        {fetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        <span>{fetching ? 'Loading...' : 'Reload voices'}</span>
      </button>
    </div>
  );
};

const TTS = ({
  fields,
  values,
}: {
  fields: UIConfigField[];
  values: Record<string, any>;
}) => {
  const [voiceValue, setVoiceValue] = useState(values?.voice ?? 'af_aoede');

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
      {fields.map((field) => {
        if (field.key === 'voice') {
          return (
            <div
              key={field.key}
              className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80"
            >
              <div className="space-y-3 lg:space-y-5">
                <div>
                  <h4 className="text-sm lg:text-sm text-black dark:text-white">
                    {field.name}
                  </h4>
                  <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
                    {field.description}
                  </p>
                </div>
                <VoicePicker value={voiceValue} onChange={setVoiceValue} />
              </div>
            </div>
          );
        }

        return (
          <SettingsField
            key={field.key}
            field={field}
            value={
              (field.scope === 'client'
                ? localStorage.getItem(field.key)
                : values[field.key]) ?? field.default
            }
            dataAdd="tts"
          />
        );
      })}
    </div>
  );
};

export default TTS;
