import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverEffect?: boolean;
  glowEffect?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = true,
  glowEffect = false,
  ...props
}) => {
  return (
    <div
      className={`
        glass-panel rounded-2xl p-6 overflow-hidden relative z-10
        ${hoverEffect ? 'glass-panel-hover' : ''}
        ${glowEffect ? 'neon-border animate-glow' : ''}
        ${className}
      `}
      {...props}
    >
      {/* Background radial gradient highlight */}
      <div className="absolute inset-0 bg-radial from-violet-500/5 to-transparent pointer-events-none -z-10" />
      {children}
    </div>
  );
};
export default GlassCard;
