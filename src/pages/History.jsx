import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ImageGallery from '../components/ImageGallery';
import ImageViewer from '../components/ImageViewer';
import { api } from '../services/api';

export default function HistoryPage({ config, favoritesOnly, onRegenerate }) {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [preview, setPreview] = useState(null);

  const load = () => api.historyList({ search, providerId, modelId, favoritesOnly }).then(setRecords).catch(() => {});
  useEffect(() => { load(); }, [search, providerId, modelId, favoritesOnly]);

  const models = useMemo(() => {
    const p = (config.providers || []).find((x) => x.id === providerId);
    return p ? p.models || [] : (config.providers || []).flatMap((x) => x.models || []);
  }, [config, providerId]);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search by prompt</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input className="input !pl-9" placeholder="Search prompts…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="w-52">
          <label className="label">Provider</label>
          <select className="input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId(''); }}>
            <option value="">All providers</option>
            {(config.providers || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="w-52">
          <label className="label">Model</label>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            <option value="">All models</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <span className="text-xs text-mute pb-2.5">{records.length} image{records.length === 1 ? '' : 's'}, newest first</span>
      </div>
      <ImageGallery records={records} onChanged={load} onRegenerate={onRegenerate} onPreview={setPreview} />
      {preview && (
        <ImageViewer record={preview} onClose={() => setPreview(null)}
          onRegenerate={(r) => { setPreview(null); onRegenerate(r); }} />
      )}
    </div>
  );
}
