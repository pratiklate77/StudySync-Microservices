/* eslint-disable */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { groupsApi } from '../api/groups';
import type { Group } from '../types';
import GlassCard from '../components/GlassCard';
import { Users, Search, PlusCircle, Sparkles, BookOpen } from 'lucide-react';
import Swal from 'sweetalert2';

export const GroupListPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrivacy, setNewPrivacy] = useState<'public' | 'private'>('public');

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await groupsApi.getAll();
      setGroups(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newDesc) return;
    try {
      await groupsApi.create(newName, newDesc, newPrivacy);
      Swal.fire({
        title: 'Study Circle Created!',
        text: 'Your collaborative circle is now live.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
      fetchGroups();
    } catch (err: unknown) {
      const error = err as { detail?: string };
      Swal.fire('Creation Failed', error.detail || 'Could not spin up group.', 'error');
    }
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-8">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Users className="h-7 w-7 text-brand-indigo" />
            <span>Study Circles</span>
          </h1>
          <p className="text-sm text-slate-400 font-light font-sans">Find study partners, prep homework, or debate projects details.</p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg transition-all"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Form a Group</span>
        </button>
      </div>

      <div className="flex items-center space-x-4 bg-slate-900/60 border border-slate-850 p-3 rounded-2xl">
        <Search className="h-5 w-5 text-slate-500 ml-2" />
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search study groups by keywords or titles..."
          className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-500"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-44 bg-slate-900/50 border border-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredGroups.length === 0 ? (
            <div className="sm:col-span-2 md:col-span-3 py-16 text-center text-slate-500 bg-slate-900/10 border border-slate-850 rounded-3xl">
              No study circles active. Be the first to form a group!
            </div>
          ) : (
            filteredGroups.map((group) => (
              <GlassCard key={group.id} className="space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20">
                      {group.privacy}
                    </span>
                    <BookOpen className="h-4 w-4 text-slate-500" />
                  </div>
                  <h3 className="text-md font-bold text-slate-200 line-clamp-1">{group.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{group.description}</p>
                </div>

                <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Collaborative circle</span>
                  <Link 
                    to={`/groups/${group.id}`}
                    className="text-xs font-bold text-brand-indigo hover:text-white transition-colors"
                  >
                    View Group →
                  </Link>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* Group Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 animate-fadeIn">
          <div className="w-full max-w-md">
            <GlassCard className="space-y-6" hoverEffect={false} glowEffect={true}>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand-violet animate-pulse" />
                  <span>Form Study Group</span>
                </h3>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleCreateGroup} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="name">Group Title</label>
                  <input 
                    type="text" 
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Algorithms Study Circle"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="desc">Topic Details</label>
                  <textarea 
                    id="desc"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief outline of goals, projects or subjects..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all resize-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="privacy">Circle Privacy</label>
                  <select 
                    id="privacy"
                    value={newPrivacy}
                    onChange={(e) => setNewPrivacy(e.target.value as 'public' | 'private')}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none"
                  >
                    <option value="public">Public Group</option>
                    <option value="private">Private (Invite only)</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold py-3.5 rounded-xl shadow-lg transition-all mt-2"
                >
                  Create Group
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      )}

    </div>
  );
};
export default GroupListPage;
