import React from 'react';

export const OracleLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    {/* Mountain Peak (Outer Frame) */}
    <path 
      d="M15 80L35 55L45 65L65 25L85 80" 
      stroke="white" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    
    {/* Circuit Pattern inside */}
    <g stroke="#71717a" strokeWidth="1" strokeLinecap="round">
      <path d="M40 80V60" />
      <circle cx="40" cy="60" r="1.5" fill="#71717a" />
      
      <path d="M50 80V45" />
      <circle cx="50" cy="45" r="1.5" fill="#71717a" />
      
      <path d="M60 80V65" />
      <circle cx="60" cy="65" r="1.5" fill="#71717a" />
      
      <path d="M45 80V70H35V65" />
      <circle cx="35" cy="65" r="1" fill="#71717a" />
    </g>

    {/* Central Yellow Eye (Iris) */}
    <circle cx="50" cy="60" r="7" stroke="#eab308" strokeWidth="2" />
    <circle cx="50" cy="60" r="3" fill="#eab308" />
    <path 
      d="M50 53V55 M50 65V67 M57 60H59 M41 60H43" 
      stroke="#eab308" 
      strokeWidth="1" 
    />
  </svg>
);
