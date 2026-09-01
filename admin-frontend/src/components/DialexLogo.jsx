import React from 'react';

export const DialexIcon = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="100 95 312 322" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Left Earcup */}
    <rect x="116" y="210" width="48" height="84" rx="24" fill="#4B88FF" />
    
    {/* Right Earcup */}
    <rect x="348" y="210" width="48" height="84" rx="24" fill="#4B88FF" />

    {/* Headset Arch */}
    <path 
      d="M140 240 C140 140, 210 130, 256 130 C302 130, 372 140, 372 240" 
      stroke="#4B88FF" 
      strokeWidth="40" 
      strokeLinecap="round" 
      fill="none" 
    />

    {/* Microphone Arm */}
    <path 
      d="M372 270 C372 370, 300 400, 250 400" 
      stroke="#4B88FF" 
      strokeWidth="26" 
      strokeLinecap="round" 
      fill="none" 
    />

    {/* Central Dark Speech Bubble */}
    <path 
      d="M256 172 C204 172, 162 214, 162 266 C162 284, 167 301, 176 315 L164 366 L215 352 C227 358, 241 360, 256 360 C308 360, 350 318, 350 266 C350 214, 308 172, 256 172 Z" 
      fill="#0D1E36" 
    />

    {/* White Sound Waveforms */}
    <rect x="206" y="246" width="16" height="40" rx="8" fill="#FFFFFF" />
    <rect x="238" y="226" width="16" height="80" rx="8" fill="#FFFFFF" />
    <rect x="270" y="246" width="16" height="40" rx="8" fill="#FFFFFF" />
  </svg>
);

export const DialexLogo = ({ showText = true, className = "", iconSize = "w-8 h-8", textSize = "text-xl" }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    <div className="relative flex items-center justify-center">
      <DialexIcon className={iconSize} />
    </div>
    {showText && (
      <span className={`font-bold tracking-wider text-slate-900 ${textSize}`}>
        DIALEX
      </span>
    )}
  </div>
);

export default DialexLogo;
