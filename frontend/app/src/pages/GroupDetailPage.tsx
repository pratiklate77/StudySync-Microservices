/* eslint-disable */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { groupsApi } from '../api/groups';
import { resolveUserDisplayName } from '../utils/displayName';
import type { Group, GroupMember } from '../types';
import GlassCard from '../components/GlassCard';
import { Users, ArrowLeft, MessageSquarePlus, DoorOpen, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';

export const GroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchGroupDetails = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      const data = await groupsApi.getById(groupId);
      setGroup(data);

      const memberList = await groupsApi.getMembers(groupId);
      setMembers(memberList);

      const names: Record<string, string> = {};
      await Promise.all(
        memberList.map(async (member) => {
          names[member.user_id] = await resolveUserDisplayName(
            member.user_id,
            member.email,
          );
        }),
      );
      setMemberNames(names);
    } catch {
      setGroup(null);
      setMembers([]);
      setMemberNames({});
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  const handleJoinCircle = async () => {
    if (!groupId) return;
    try {
      await groupsApi.join(groupId);
      Swal.fire({
        title: 'Joined Study Circle!',
        text: 'You can now exchange chat messages with this group.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
      fetchGroupDetails();
    } catch (err: unknown) {
      const error = err as { detail?: string };
      Swal.fire('Join Circle Failed', error.detail || 'Could not join group.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-brand-indigo border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex-1 max-w-xl mx-auto flex flex-col items-center justify-center p-8 text-center space-y-4">
        <p className="text-slate-400 font-light">Study circle not found or has been disbanded.</p>
        <Link to="/groups" className="text-brand-indigo font-bold hover:underline">← Back to Groups</Link>
      </div>
    );
  }

  return (
    <div className="page-transition flex-1 max-w-5xl w-full mx-auto px-6 py-10 space-y-8">
      
      <div className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" />
        <Link to="/groups" className="text-xs font-bold font-sans">Back to study circles</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        
        {/* Main Details Panel Column */}
        <div className="md:col-span-2 space-y-6">
          <GlassCard className="space-y-4" hoverEffect={false}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20">
                {group.privacy} Group
              </span>
              <span className="flex items-center space-x-1 text-xs text-slate-400">
                <Users className="h-4.5 w-4.5" />
                <span>{members.length} Members</span>
              </span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">{group.name}</h1>
            <p className="text-sm text-slate-300 leading-relaxed font-light">{group.description}</p>
          </GlassCard>

          {/* Members list table */}
          <GlassCard className="space-y-4" hoverEffect={false}>
            <h3 className="text-md font-extrabold text-white flex items-center space-x-2">
              <Users className="h-5 w-5 text-brand-indigo" />
              <span>Circle Roster</span>
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-2">Member Email</th>
                    <th className="py-3 px-2">Joined Date</th>
                    <th className="py-3 px-2">Chat Rights</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, i) => (
                    <tr key={i} className="border-b border-slate-850 hover:bg-slate-900/40 text-slate-300 font-light">
                      <td className="py-3 px-2 font-bold">
                        {memberNames[member.user_id] ?? member.email ?? member.user_id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-2">{member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'N/A'}</td>
                      <td className="py-3 px-2 flex items-center space-x-1 text-brand-emerald">
                        <ShieldCheck className="h-4.5 w-4.5" />
                        <span>Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* Sidebar Actions Column */}
        <div className="space-y-6">
          <GlassCard className="space-y-6 text-center" hoverEffect={false}>
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Circle Actions</span>
              <h3 className="text-lg font-bold text-slate-200">Study Sync Workspace</h3>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-850">
              <button 
                onClick={handleJoinCircle}
                className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-850 border border-slate-850 text-slate-200 font-semibold py-3 rounded-xl transition-all"
              >
                <DoorOpen className="h-4.5 w-4.5" />
                <span>Join study circle</span>
              </button>

              <button 
                onClick={() => navigate(`/chat/${group.id}`)}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold py-3 rounded-xl shadow-lg transition-all"
              >
                <MessageSquarePlus className="h-4.5 w-4.5" />
                <span>Enter Chat Room</span>
              </button>
            </div>
          </GlassCard>
        </div>

      </div>

    </div>
  );
};
export default GroupDetailPage;
