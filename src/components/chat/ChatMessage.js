import React from 'react';
import { calculateColor } from '../../utils/colorReplace';
import Tooltip from './Tooltip';

function getEmoteUrl(emote, size = '1x') {
  switch (emote.source) {
    case 'BetterTTV Global':
    case 'BetterTTV Channel':
      return `https://cdn.betterttv.net/emote/${emote.id}/${size}`;
    case 'FrankerFaceZ Global':
    case 'FrankerFaceZ Channel':
      return `https://cdn.frankerfacez.com/emote/${emote.id}/${size === '1x' ? '1' : size === '2x' ? '2' : '4'}`;
    case '7TV Global':
    case '7TV Channel':
      return `https://cdn.7tv.app/emote/${emote.id}/${size}`;
    case 'Twitch':
    default:
      return `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/${size === '1x' ? '1.0' : size === '2x' ? '2.0' : '3.0'}`;
  }
}

// Cheermote patterns and tiers
const CHEERMOTE_NAMES = [
  'cheer', 'doodlecheer', 'biblethump', 'cheerwhal', 'corgo', 'scoops', 'uni',
  'showlove', 'party', 'seemsgood', 'pride', 'kappa', 'frankerz', 'heyguys',
  'dansgame', 'elegiggle', 'trihard', 'kreygasm', '4head', 'swiftrage',
  'notlikethis', 'failfish', 'vohiyo', 'pjsalt', 'mrdestructoid', 'bday',
  'ripcheer', 'shamrock', 'bitboss', 'streamlabs', 'muxy', 'holidaycheer',
  'goal', 'anon', 'charity'
];

const CHEERMOTE_REGEX = new RegExp(`(?<!\\w)(${CHEERMOTE_NAMES.join('|')})(\\d+)(?!\\w)`, 'gi');

function getCheermoteTier(amount) {
  if (amount >= 10000) return { tier: '10000', color: '#f43021' };
  if (amount >= 5000) return { tier: '5000', color: '#0099fe' };
  if (amount >= 1000) return { tier: '1000', color: '#1db2a5' };
  if (amount >= 100) return { tier: '100', color: '#9c3ee8' };
  return { tier: '1', color: '#979797' };
}

function Cheermote({ name, amount }) {
  const { tier, color } = getCheermoteTier(amount);
  const baseUrl = `https://d3aqoihi2n8ty8.cloudfront.net/actions/${name.toLowerCase()}/dark/animated/${tier}/`;
  const urls = [baseUrl + '1.gif', baseUrl + '2.gif', baseUrl + '4.gif'];
  const srcset = urls.slice(1).map((u, i) => `${u} ${i + 2}x`).join(', ');
  
  return (
    <Tooltip text={`${name}${amount}\nTwitch`} className="chat-emote-container">
      <span className="emote cheermote" style={{ color }}>
        <img
          className="cheermote-img"
          src={urls[0]}
          srcSet={srcset}
          alt={`${name}${amount}`}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.insertAdjacentText('afterend', `${name}${amount}`);
          }}
        />
        <span className="cheermote-amount">{amount}</span>
      </span>
    </Tooltip>
  );
}

function parseMessageContent(message, emotes, emoteList) {
  if (!emotes || emotes.length === 0) {
    // No emotes, but still check for cheermotes in text
    return parseCheermotes(message);
  }

  const sortedEmotes = [...emotes].sort((a, b) => b[1] - a[1]);
  const chars = Array.from(message);
  const parts = [];
  let lastIdx = chars.length;

  for (const [emoteIdx, start, end] of sortedEmotes) {
    const emote = emoteList[emoteIdx];
    if (!emote) continue;

    if (end + 1 < lastIdx) {
      const textAfter = chars.slice(end + 1, lastIdx).join('');
      if (textAfter) {
        // Parse cheermotes in text segments
        parts.unshift(...parseCheermotes(textAfter));
      }
    }

    parts.unshift({ type: 'emote', emote, start, end });
    lastIdx = start;
  }

  if (lastIdx > 0) {
    const textBefore = chars.slice(0, lastIdx).join('');
    if (textBefore) {
      // Parse cheermotes in text segments
      parts.unshift(...parseCheermotes(textBefore));
    }
  }

  return parts;
}

function parseCheermotes(text) {
  const parts = [];
  let lastIndex = 0;
  let match;
  
  CHEERMOTE_REGEX.lastIndex = 0; // Reset regex state
  
  while ((match = CHEERMOTE_REGEX.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    
    // Add cheermote
    parts.push({ 
      type: 'cheermote', 
      name: match[1], 
      amount: parseInt(match[2], 10) 
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  // If no matches, return original text
  if (parts.length === 0) {
    return [{ type: 'text', content: text }];
  }
  
  return parts;
}

function formatTimestamp(seconds, chatDelay = 0) {
  const adjusted = Math.floor(seconds + chatDelay);
  const h = Math.floor(adjusted / 3600);
  const m = Math.floor((adjusted % 3600) / 60);
  const s = adjusted % 60;

  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getTimestampClass(seconds, chatDelay = 0) {
  const formatted = formatTimestamp(seconds, chatDelay);
  if (formatted.length <= 4) return 'short-time';
  if (formatted.length === 5) return 'medium-time';
  if (formatted.length === 7) return 'long-time';
  return 'xlong-time';
}

function formatTimeForUrl(seconds, chatDelay = 0) {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const adjusted = Math.floor(seconds + chatDelay);
  const h = Math.floor(adjusted / 3600);
  const m = Math.floor((adjusted % 3600) / 60);
  const s = Math.floor(adjusted % 60);
  let parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join('');
}

export default function ChatMessage({ 
  message, 
  user, 
  emoteList, 
  badgeList,
  showTimestamps,
  showBadges,
  showBorder,
  onSeek,
  videoId,
  chatDelay = 0
}) {
  const parts = parseMessageContent(message.message, message.emotes, emoteList);
  const displayBadges = message.badges ? message.badges.map(idx => badgeList[idx]).filter(Boolean) : [];

  const handleTimestampClick = (e) => {
    e.preventDefault();
    // Seek to timestamp + 1 so the clicked message stays visible in chat
    if (onSeek) onSeek(Math.floor(message.time + chatDelay) + 1);
  };

  const timestampUrl = videoId ? `#/video/${videoId}?time=${formatTimeForUrl(message.time, chatDelay)}` : '#';

  const messageStyle = showBorder ? { borderBottom: '1px solid rgba(255,255,255,0.1)' } : {};

  return (
    <div className="chat-message" style={messageStyle}>
      {showTimestamps && (
        <span className={`chat-timestamp ${getTimestampClass(message.time, chatDelay)}`}>
          <a 
            href={timestampUrl} 
            onClick={handleTimestampClick} 
            title="Jump to timestamp" 
            className="timestamp-link"
          >
            {formatTimestamp(message.time, chatDelay)}
          </a>
        </span>
      )}
      <span className="chat-data">
        {showBadges && displayBadges.length > 0 && (
          <span className="chat-badges">
            {displayBadges.map((badge, i) => (
              <Tooltip 
                key={i} 
                text={badge.title}
                className="badge"
              >
                <img
                  className="badge-img"
                  src={`https://static-cdn.jtvnw.net/badges/v1/${badge.url}/1`}
                  srcSet={`https://static-cdn.jtvnw.net/badges/v1/${badge.url}/2 2x, https://static-cdn.jtvnw.net/badges/v1/${badge.url}/3 3x`}
                  alt={badge.title}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Tooltip>
            ))}
          </span>
        )}
        <span className="chat-username" style={{ color: calculateColor(user.color.toUpperCase()) }}>
          {user.name}
        </span>
        <span className="chat-colon">:</span>
        <span className="chat-text">
          {parts.map((part, i) => {
            if (part.type === 'text') return <span key={i}>{part.content}</span>;
            if (part.type === 'cheermote') {
              return <Cheermote key={i} name={part.name} amount={part.amount} />;
            }
            const emote = part.emote;
            const url = getEmoteUrl(emote, '1x');
            const srcset = `${getEmoteUrl(emote, '2x')} 2x, ${getEmoteUrl(emote, '3x')} 3x`;
            const highResUrl = getEmoteUrl(emote, '3x');
            const tooltipText = `${emote.text}\n${emote.source || 'Twitch'}`;
            return (
              <Tooltip 
                key={i} 
                text={tooltipText} 
                imageUrl={highResUrl}
                className="chat-emote-container"
              >
                <span className="emote">
                  <img
                    className="emote-img"
                    src={url}
                    srcSet={srcset}
                    alt={emote.text}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.insertAdjacentText('afterend', emote.text);
                    }}
                  />
                </span>
              </Tooltip>
            );
          })}
        </span>
      </span>
    </div>
  );
}
