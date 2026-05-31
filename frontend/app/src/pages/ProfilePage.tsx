import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import { User, Shield, Sparkles, Upload, FileText, BadgeCheck, Clock } from 'lucide-react';
import Swal from 'sweetalert2';

export const ProfilePage: React.FC = () => {
  const { user, tutorProfile, applyAsTutor, isTutor } = useAuth();
  
  // Wizard States
  const [bio, setBio] = useState('');
  const [subjects, setSubjects] = useState('');
  const [rate, setRate] = useState<number>(30);
  const [identityProof, setIdentityProof] = useState<File | null>(null);
  const [highestDegree, setHighestDegree] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bio || !subjects || !identityProof || !highestDegree) {
      Swal.fire('Missing Information', 'Please complete all required fields and upload documents.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('bio', bio);
      formData.append('subjects', subjects);
      formData.append('hourly_rate', String(rate));
      formData.append('identity_proof', identityProof);
      formData.append('highest_degree', highestDegree);

      await applyAsTutor(formData);
    } catch {
      // Handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition flex-1 max-w-4xl w-full mx-auto px-6 py-10 space-y-8">
      
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <User className="h-7 w-7 text-brand-indigo" />
          <span>My Profile</span>
        </h1>
        <p className="text-sm text-slate-400 font-light">Manage your student credentials and tutor registration status.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Left Column: Account Details Widget */}
        <div className="space-y-6">
          <GlassCard className="text-center space-y-4" hoverEffect={false}>
            <div className="mx-auto bg-gradient-to-tr from-brand-indigo to-brand-violet p-4 rounded-full w-fit">
              <User className="h-10 w-10 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-200">{user?.email?.split('@')[0]}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{user?.email}</p>
            </div>
            
            <div className="pt-4 border-t border-slate-850 flex flex-col space-y-2 text-left">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Security Credentials</span>
              <div className="flex items-center space-x-2 text-xs text-slate-300">
                <Shield className="h-4 w-4 text-brand-emerald" />
                <span className="capitalize">{user?.role} Access Mode</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right Column: Tutor Onboarding Wizard Panel */}
        <div className="md:col-span-2 space-y-6">
          {isTutor ? (
            <div className="space-y-6">
              {tutorProfile?.is_verified ? (
                <GlassCard className="border-brand-emerald/20 bg-brand-emerald/5 space-y-4" hoverEffect={false}>
                  <div className="flex items-center space-x-3 text-brand-emerald">
                    <BadgeCheck className="h-7 w-7" />
                    <h3 className="text-lg font-bold">Verified Tutor Workspace</h3>
                  </div>
                  <p className="text-sm text-slate-300 font-light leading-relaxed">
                    Congratulations! Your application credentials have been approved. You are eligible to host paid sessions.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-850 text-xs">
                    <div>
                      <span className="text-slate-500 font-bold uppercase tracking-wider block">Hourly Wage</span>
                      <span className="text-md font-extrabold text-slate-200">${tutorProfile?.hourly_rate}/hr</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold uppercase tracking-wider block">Areas of Expertise</span>
                      <span className="text-md font-extrabold text-slate-200">{tutorProfile?.expertise?.join(', ')}</span>
                    </div>
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="border-brand-violet/20 bg-brand-violet/5 space-y-4" hoverEffect={false}>
                  <div className="flex items-center space-x-3 text-brand-violet">
                    <Clock className="h-7 w-7 animate-pulse" />
                    <h3 className="text-lg font-bold">Verification Pending Review</h3>
                  </div>
                  <p className="text-sm text-slate-300 font-light leading-relaxed">
                    Your tutor onboarding documents have been submitted successfully. An administrator is currently reviewing your certificates.
                  </p>
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-850 text-xs space-y-1">
                    <p className="font-bold text-slate-300">Submitted Bio:</p>
                    <p className="text-slate-400 font-light italic leading-relaxed">"{tutorProfile?.bio || bio}"</p>
                  </div>
                </GlassCard>
              )}
            </div>
          ) : (
            <GlassCard className="space-y-6" hoverEffect={false}>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand-violet animate-pulse" />
                  <span>Become a StudySync Tutor</span>
                </h3>
                <p className="text-xs text-slate-400">Share your expertise and host paid classes or review halls.</p>
              </div>

              <form onSubmit={handleApply} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="bio">Tutor Bio</label>
                  <textarea 
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell students about your qualifications and tutoring style..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400" htmlFor="subjects">Expertise Tags</label>
                    <input 
                      type="text" 
                      id="subjects"
                      value={subjects}
                      onChange={(e) => setSubjects(e.target.value)}
                      placeholder="e.g. Mathematics, React"
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400" htmlFor="rate">Hourly Rate ($)</label>
                    <input 
                      type="number" 
                      id="rate"
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                      min={10}
                      max={200}
                      required
                    />
                  </div>
                </div>

                {/* File Upload Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-400">Identity Proof</span>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-brand-indigo bg-slate-950 p-4 rounded-xl cursor-pointer transition-colors text-center">
                      {identityProof ? (
                        <>
                          <FileText className="h-5 w-5 text-brand-emerald mb-1.5" />
                          <span className="text-[10px] text-slate-300 max-w-full truncate">{identityProof.name}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-slate-500 mb-1.5" />
                          <span className="text-[10px] text-slate-400">Upload ID Card</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*,application/pdf"
                        onChange={(e) => setIdentityProof(e.target.files?.[0] || null)}
                        className="hidden" 
                        required 
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-400">Highest Degree Cert</span>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-brand-indigo bg-slate-950 p-4 rounded-xl cursor-pointer transition-colors text-center">
                      {highestDegree ? (
                        <>
                          <FileText className="h-5 w-5 text-brand-emerald mb-1.5" />
                          <span className="text-[10px] text-slate-300 max-w-full truncate">{highestDegree.name}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-slate-500 mb-1.5" />
                          <span className="text-[10px] text-slate-400">Upload Degree</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*,application/pdf"
                        onChange={(e) => setHighestDegree(e.target.files?.[0] || null)}
                        className="hidden" 
                        required 
                      />
                    </label>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50 mt-4"
                >
                  {loading ? 'Submitting Application...' : 'Submit Tutor Onboarding'}
                </button>
              </form>
            </GlassCard>
          )}
        </div>

      </div>

    </div>
  );
};
export default ProfilePage;
