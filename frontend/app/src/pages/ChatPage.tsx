/* eslint-disable */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../api/chat';
import { groupsApi } from '../api/groups';
import { authApi } from '../api/auth';
import { formatDisplayName } from '../utils/displayName';
import type { Message, Group } from '../types';
import { Send, Trash, Edit3, MessageCircle, Users, Sparkles, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';

export const ChatPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { token, user, isAdmin } = useAuth();
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [onlineCount, setOnlineCount] = useState(1);
  
  // Time and date formatters
  const formatMessageTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getDayLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else {
        return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      }
    } catch {
      return '';
    }
  };

  // Cached username map: uuid -> display name
  const userNameCache = useRef<Record<string, string>>({});
  const [, forceRender] = useState(0);

  const resolveUsername = useCallback((senderId: string, email?: string): string => {
    if (user?.id && senderId === user.id) return 'You';
    if (userNameCache.current[senderId]) return userNameCache.current[senderId];

    authApi.getUserById(senderId).then((profile) => {
      if (profile) {
        const label = formatDisplayName(profile, 'Collaborator');
        userNameCache.current[senderId] = label;
        forceRender((n) => n + 1);
      }
    });

    if (email) {
      return formatDisplayName({ email }, 'Collaborator');
    }
    return 'Collaborator';
  }, [user?.id]);
  
  // Edit states
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchGroups = async () => {
    try {
      const joined = await groupsApi.getAll();
      setGroups(joined);
    } catch {
      // Quiet fail
    }
  };

  const fetchHistoryAndDetails = async () => {
    if (!groupId) return;
    try {
      // Fetch details
      const details = await groupsApi.getById(groupId);
      setActiveGroup(details);

      // Fetch messages history and sort chronological ASC (oldest first)
      const history = await chatApi.getMessages(groupId);
      const sortedMessages = [...(history.messages || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(sortedMessages);

      // Fetch online count
      const online = await chatApi.getOnlineCount(groupId);
      setOnlineCount(online.online_count || 1);
    } catch {
      // Quiet fail
    }
  };

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchHistoryAndDetails();
    
    // Setup WebSocket connection directly to port 8003
    if (groupId && token) {
      const wsUrl = `ws://localhost:8003/api/v1/groups/${groupId}/ws?token=${token}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        // Mark messages as read on entry
        chatApi.markRead(groupId);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Respond to server-driven ping events to preserve TTL
          if (data.event === 'ping') {
            ws.send(JSON.stringify({ event: 'pong' }));
            return;
          }

          if (data.event === 'message') {
            const newMessage: Message = {
              id: data.id,
              group_id: data.group_id,
              sender_id: data.sender_id,
              content: data.content,
              created_at: data.created_at,
              is_deleted: false,
              is_edited: false,
              sender_email: data.sender_id === user?.id ? user?.email : 'Collaborator',
            };
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });
            
            // Mark as read dynamically
            chatApi.markRead(groupId);
          } else if (data.event === 'message_edited') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === data.message_id ? { ...msg, content: data.content, is_edited: true } : msg
              )
            );
          } else if (data.event === 'message_deleted') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === data.message_id ? { ...msg, content: 'This message was deleted.', is_deleted: true } : msg
              )
            );
          }
        } catch {
          // Quiet ignore parse errors
        }
      };

      ws.onclose = () => {
        // Handle reconnection or simple graceful closure
      };

      return () => {
        ws.close();
      };
    }
  }, [groupId, token]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !inputContent.trim()) return;

    const messageText = inputContent.trim();
    setInputContent('');

    try {
      const sentMsg = await chatApi.sendMessage(groupId, messageText);
      // Instant local append with mock details to be updated by real socket metadata if needed
      const formattedMsg: Message = {
        ...sentMsg,
        sender_email: user?.email || 'Me'
      };
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === formattedMsg.id)) {
          return prev;
        }
        return [...prev, formattedMsg];
      });
    } catch (err: any) {
      Swal.fire('Message Error', err.detail || 'Could not send message.', 'error');
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingContent.trim()) return;
    try {
      await chatApi.editMessage(messageId, editingContent.trim());
      setEditingMessageId(null);
      setEditingContent('');
    } catch (err: any) {
      Swal.fire('Edit Failed', err.detail || 'Could not modify message.', 'error');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    Swal.fire({
      title: 'Delete Message?',
      text: 'Are you sure you want to remove this message permanently?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      background: '#12121e',
      color: '#f8fafc',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#27273a',
    }).then(async (res) => {
      if (res.isConfirmed) {
        try {
          await chatApi.deleteMessage(messageId);
          // Optimistic local update — no need to wait for WS broadcast
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, content: 'This message was deleted.', is_deleted: true }
                : msg
            )
          );
        } catch (err: any) {
          Swal.fire('Delete Failed', err.detail || 'Could not remove message.', 'error');
        }
      }
    });
  };

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col md:flex-row gap-6 h-[calc(100vh-100px)] overflow-hidden">
      
      {/* Left Sidebar: Active Groups selector list */}
      <div className="w-full md:w-80 flex flex-col space-y-4 h-full overflow-hidden">
        <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
          <MessageCircle className="h-5.5 w-5.5 text-brand-indigo" />
          <span>My Study Circles</span>
        </h2>
        
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {groups.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">Join a circle to start chatting</p>
          ) : (
            groups.map((group) => (
              <Link
                key={group.id}
                to={`/chat/${group.id}`}
                className={`block p-3.5 rounded-xl border transition-all ${group.id === groupId ? 'bg-brand-indigo/15 border-brand-indigo text-slate-200' : 'bg-slate-900/40 hover:bg-slate-900 border-slate-850 text-slate-400'}`}
              >
                <div className="font-bold text-xs truncate text-slate-200">{group.name}</div>
                <div className="text-[10px] truncate mt-0.5">{group.description}</div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Live Chat timeline box */}
      <div className="flex-1 flex flex-col h-full bg-slate-900/40 border border-slate-850 rounded-2xl overflow-hidden relative">
        {activeGroup ? (
          <>
            {/* Header info */}
            <div className="px-6 py-4 border-b border-slate-850 flex justify-between items-center bg-slate-950/40">
              <div>
                <h3 className="text-sm font-extrabold text-white">{activeGroup.name}</h3>
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mt-0.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>{onlineCount} Online Now</span>
                </div>
              </div>
              
              <div className="inline-flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850 text-[10px] font-medium text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-brand-violet animate-pulse" />
                <span>WebSocket Connected</span>
              </div>
            </div>

            {/* Messages Feed History */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
                  <AlertCircle className="h-10 w-10 text-slate-600" />
                  <p className="text-xs text-slate-500 font-light">No messages exchanged yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isOwn = msg.sender_id === user?.id;

                  // Date section banners divider (e.g. "Today", "Yesterday", "Friday, May 29")
                  const prevMsg = index > 0 ? messages[index - 1] : null;
                  const showDateSeparator = !prevMsg || 
                    new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex justify-center my-4">
                          <span className="text-[10px] bg-slate-950/60 border border-slate-800/40 text-slate-400 font-bold px-3.5 py-1 rounded-full shadow-sm uppercase tracking-wider select-none">
                            {getDayLabel(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[70%] space-y-1 ${isOwn ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                        <span className="text-[9px] text-slate-500 px-1">{resolveUsername(msg.sender_id, msg.sender_email)}</span>
                        
                        <div className={`p-3.5 pb-5 rounded-2xl text-xs relative group/item transition-colors min-w-28 ${msg.is_deleted ? 'bg-slate-950/40 text-slate-500 italic border border-slate-850' : isOwn ? 'bg-gradient-to-br from-brand-indigo to-brand-violet text-white' : 'bg-slate-900 border border-slate-800 text-slate-300'}`}>
                          {editingMessageId === msg.id ? (
                            <div className="flex items-center space-x-2 min-w-44">
                              <input
                                type="text"
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleEditMessage(msg.id)}
                                className="flex-1 bg-slate-950 px-2 py-1 border border-slate-850 rounded text-slate-200 outline-none"
                                autoFocus
                              />
                              <button onClick={() => handleEditMessage(msg.id)} className="text-[10px] bg-brand-emerald text-slate-950 font-bold px-2 py-1 rounded">Save</button>
                              <button onClick={() => setEditingMessageId(null)} className="text-[10px] text-slate-500 font-bold">✕</button>
                            </div>
                          ) : (
                            <>
                              <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>

                              {/* Edited label */}
                              {msg.is_edited && !msg.is_deleted && (
                                <span className="text-[8px] opacity-50 italic"> · edited</span>
                              )}
                              
                              {/* WhatsApp style bottom-right timestamp balloon */}
                              <span className="absolute bottom-1 right-2.5 text-[8px] opacity-60 pointer-events-none select-none">
                                {formatMessageTime(msg.created_at)}
                              </span>

                              {/* Hover Edit and Delete controls */}
                              {!msg.is_deleted && (isOwn || isAdmin) && (
                                <div className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover/item:opacity-100 flex items-center space-x-1 transition-opacity`}>
                                  {isOwn && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditingContent(msg.content);
                                      }}
                                      title="Edit"
                                      className="p-1 bg-slate-950 border border-slate-800 hover:text-brand-indigo rounded text-slate-500 transition-colors"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    title="Delete"
                                    className="p-1 bg-slate-950 border border-slate-800 hover:text-red-400 rounded text-slate-500 transition-colors"
                                  >
                                    <Trash className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="px-6 py-4 border-t border-slate-850 bg-slate-950/20 flex items-center space-x-3">
              <input
                type="text"
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-brand-indigo outline-none rounded-xl px-4 py-3 text-xs text-slate-200"
              />
              <button
                type="submit"
                className="bg-brand-indigo hover:opacity-95 p-3 rounded-xl shadow text-white transition-all"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <MessageCircle className="h-14 w-14 text-slate-700 animate-pulse" />
            <div>
              <h3 className="font-extrabold text-slate-400">Select a study circle</h3>
              <p className="text-xs text-slate-500 font-light mt-1">Choose a group on the left to start live collaborating.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
export default ChatPage;
