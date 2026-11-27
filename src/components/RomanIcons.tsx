import React from 'react';
import { BuildingType, ResourceId } from '../game/types';

export function RomanCrestEmblem({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      {/* Dark outer shield silhouette */}
      <circle cx="40" cy="40" r="36" fill="#1e1812" stroke="#d4a24c" strokeWidth="2.5" />
      <circle cx="40" cy="40" r="31" fill="none" stroke="rgba(212,162,76,0.35)" strokeWidth="1" />
      {/* Laurel wreath arcs */}
      <path
        d="M22 54 C14 42, 16 24, 28 16 M58 54 C66 42, 64 24, 52 16"
        fill="none"
        stroke="#c9963e"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M19 42 L14 39 M18 33 L13 29 M22 24 L18 20 M61 42 L66 39 M62 33 L67 29 M58 24 L62 20"
        stroke="#e2b968"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Roman Column / Aquila geometric centerpiece */}
      <rect x="33" y="25" width="14" height="28" rx="1" fill="#efe4cf" stroke="#5e4323" strokeWidth="1.4" />
      <path d="M29 25 L51 25 L48 20 L32 20 Z" fill="#d9a84e" stroke="#4f3617" strokeWidth="1.2" />
      <path d="M29 53 L51 53 L53 57 L27 57 Z" fill="#d9a84e" stroke="#4f3617" strokeWidth="1.2" />
      <line x1="37" y1="28" x2="37" y2="50" stroke="#b9a484" strokeWidth="1.5" />
      <line x1="40" y1="28" x2="40" y2="50" stroke="#b9a484" strokeWidth="1.5" />
      <line x1="43" y1="28" x2="43" y2="50" stroke="#b9a484" strokeWidth="1.5" />
    </svg>
  );
}

export function ResourceIcon({ resource, className = 'w-4 h-4' }: { resource: ResourceId; className?: string }) {
  const colorMap: Record<ResourceId, string> = {
    wood: '#9e673a',
    stone: '#9aa0a6',
    wheat: '#e4b846',
    flour: '#f2e8cf',
    bread: '#d17f37',
    grapes: '#8b3e73',
    wine: '#b22947',
    clay: '#c56540',
    pottery: '#d67449',
  };
  const fill = colorMap[resource];

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#1d1813" stroke={fill} strokeWidth="1.8" />
      {resource === 'wood' && (
        <path d="M7 15 L17 9 M8 11 L16 15" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
      )}
      {resource === 'stone' && (
        <polygon points="7,16 10,8 16,9 18,16" fill={fill} stroke="#38342e" strokeWidth="1" />
      )}
      {resource === 'wheat' && (
        <path d="M12 18 L12 6 M12 10 L9 7 M12 10 L15 7 M12 14 L9 11 M12 14 L15 11" stroke={fill} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {resource === 'flour' && (
        <path d="M8 16 C7 11, 10 8, 12 8 C14 8, 17 11, 16 16 Z" fill={fill} />
      )}
      {resource === 'bread' && (
        <ellipse cx="12" cy="13" rx="6" ry="4" fill={fill} stroke="#633210" strokeWidth="1" />
      )}
      {resource === 'grapes' && (
        <>
          <circle cx="10" cy="11" r="2" fill={fill} />
          <circle cx="14" cy="11" r="2" fill={fill} />
          <circle cx="12" cy="14.5" r="2" fill={fill} />
        </>
      )}
      {resource === 'wine' && (
        <path d="M10 6 H14 L13 11 C15 13, 15 17, 12 18 C9 17, 9 13, 11 11 Z" fill={fill} />
      )}
      {resource === 'clay' && (
        <ellipse cx="12" cy="13" rx="5.5" ry="3.5" fill={fill} />
      )}
      {resource === 'pottery' && (
        <path d="M9.5 7 H14.5 L13.5 9.5 C16 11, 15.5 16, 12 17.5 C8.5 16, 8 11, 10.5 9.5 Z" fill={fill} />
      )}
    </svg>
  );
}

export function BuildingIcon({ type, className = 'w-6 h-6' }: { type: BuildingType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {type === 'road' && (
        <>
          <polygon points="3,14 12,8 21,14 12,20" fill="#7c756a" stroke="#231d17" strokeWidth="1.4" />
          <line x1="9" y1="12" x2="15" y2="16" stroke="#c8bfa9" strokeWidth="1.4" />
        </>
      )}
      {type === 'horreum' && (
        <>
          <polygon points="4,11 12,6 20,11 20,19 4,19" fill="#dfd2bc" stroke="#2a2016" strokeWidth="1.4" />
          <polygon points="3,11 12,4 21,11" fill="#b34d30" stroke="#2a2016" strokeWidth="1.2" />
          <rect x="9" y="13" width="6" height="6" fill="#4f3722" />
        </>
      )}
      {type === 'market' && (
        <>
          <rect x="4" y="11" width="16" height="8" fill="#dfd4bf" stroke="#2a2016" strokeWidth="1.3" />
          <polygon points="3,11 6,6 18,6 21,11" fill="#c03e2c" stroke="#2a2016" strokeWidth="1.2" />
          <line x1="9" y1="6" x2="9" y2="11" stroke="#f7eedc" strokeWidth="2" />
          <line x1="15" y1="6" x2="15" y2="11" stroke="#f7eedc" strokeWidth="2" />
        </>
      )}
      {(type === 'house_liberti' || type === 'house_cives') && (
        <>
          <rect
            x="5"
            y={type === 'house_cives' ? 8 : 11}
            width="14"
            height={type === 'house_cives' ? 11 : 8}
            fill="#ebe0cb"
            stroke="#2a2016"
            strokeWidth="1.3"
          />
          <polygon
            points={type === 'house_cives' ? '4,8 12,3 20,8' : '4,11 12,5 20,11'}
            fill="#bd5435"
            stroke="#2a2016"
            strokeWidth="1.2"
          />
          <rect x="10.5" y="14" width="3" height="5" fill="#4f3524" />
        </>
      )}
      {type === 'fountain' && (
        <>
          <ellipse cx="12" cy="16" rx="8" ry="4" fill="#dfd6c5" stroke="#2a2016" strokeWidth="1.3" />
          <ellipse cx="12" cy="15.5" rx="5.5" ry="2.4" fill="#3da4bd" />
          <path d="M12 15 V8 M12 8 C10 10, 9 11, 8.5 13 M12 8 C14 10, 15 11, 15.5 13" stroke="#9be5f5" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {(type === 'temple' || type === 'forum') && (
        <>
          <rect x="4" y="18" width="16" height="3" fill="#cfc6b4" stroke="#2a2016" strokeWidth="1.2" />
          <rect x="6" y="10" width="2" height="8" fill="#f3ede0" />
          <rect x="11" y="10" width="2" height="8" fill="#f3ede0" />
          <rect x="16" y="10" width="2" height="8" fill="#f3ede0" />
          <polygon points="3,10 12,4 21,10" fill={type === 'forum' ? '#d4a347' : '#c65e3a'} stroke="#2a2016" strokeWidth="1.2" />
        </>
      )}
      {type === 'watchtower' && (
        <>
          <rect x="8" y="9" width="8" height="11" fill="#e2d8c4" stroke="#2a2016" strokeWidth="1.3" />
          <polygon points="6,9 12,4 18,9" fill="#b65436" stroke="#2a2016" strokeWidth="1.2" />
          <rect x="7" y="16" width="10" height="2.5" fill="#b5aa95" stroke="#2a2016" strokeWidth="1" />
          <circle cx="12" cy="2.5" r="1.6" fill="#f2a13c" />
        </>
      )}
      {type === 'wheat_farm' && (
        <>
          <rect x="4" y="14" width="16" height="6" rx="1" fill="#cfa238" stroke="#2a2016" strokeWidth="1.2" />
          <path d="M7 14 V7 M12 14 V6 M17 14 V7" stroke="#f0cd67" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {type === 'mill' && (
        <>
          <rect x="8" y="9" width="8" height="11" fill="#d8ceba" stroke="#2a2016" strokeWidth="1.3" />
          <polygon points="7,9 12,4 17,9" fill="#a84c31" stroke="#2a2016" strokeWidth="1.2" />
          <path d="M6 6 L18 16 M18 6 L6 16" stroke="#f5ebd6" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {type === 'bakery' && (
        <>
          <rect x="4" y="10" width="16" height="10" fill="#e2d3ba" stroke="#2a2016" strokeWidth="1.3" />
          <path d="M8 20 C8 13, 16 13, 16 20 Z" fill="#b44f32" stroke="#2a2016" strokeWidth="1.2" />
          <circle cx="12" cy="17.5" r="2" fill="#ffa13b" />
        </>
      )}
      {type === 'vineyard' && (
        <>
          <line x1="5" y1="16" x2="19" y2="10" stroke="#506c2e" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="9" cy="14" r="2.2" fill="#7c3262" />
          <circle cx="13" cy="12.5" r="2.2" fill="#7c3262" />
          <circle cx="16" cy="15" r="2.2" fill="#7c3262" />
        </>
      )}
      {type === 'winery' && (
        <>
          <rect x="4" y="10" width="16" height="10" fill="#dccdb4" stroke="#2a2016" strokeWidth="1.3" />
          <polygon points="3,10 12,4 21,10" fill="#8b3343" stroke="#2a2016" strokeWidth="1.2" />
          <circle cx="12" cy="15" r="2.8" fill="#6f4627" stroke="#2a2016" strokeWidth="1" />
        </>
      )}
      {type === 'woodcutter' && (
        <>
          <polygon points="12,4 18,14 6,14" fill="#3b6931" stroke="#233a1d" strokeWidth="1.2" />
          <rect x="10.5" y="14" width="3" height="5" fill="#6e4727" />
          <circle cx="7" cy="18" r="2" fill="#a87549" stroke="#2a2016" strokeWidth="1" />
          <circle cx="17" cy="18" r="2" fill="#a87549" stroke="#2a2016" strokeWidth="1" />
        </>
      )}
      {type === 'stone_quarry' && (
        <>
          <polygon points="4,18 9,8 16,9 20,18" fill="#9a958b" stroke="#2a2620" strokeWidth="1.3" />
          <polygon points="9,18 12,12 18,18" fill="#bdb8ad" stroke="#2a2620" strokeWidth="1" />
        </>
      )}
      {type === 'clay_pit' && (
        <>
          <ellipse cx="12" cy="14" rx="8" ry="5" fill="#9b5435" stroke="#2a2016" strokeWidth="1.3" />
          <ellipse cx="12" cy="13.5" rx="4.5" ry="2.2" fill="#c97d56" />
        </>
      )}
      {type === 'pottery' && (
        <>
          <path d="M8 7 H16 L14 10 C17 12, 16.5 18, 12 20 C7.5 18, 7 12, 10 10 Z" fill="#c6633d" stroke="#2a2016" strokeWidth="1.3" />
        </>
      )}
    </svg>
  );
}
