import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../utils/constants';
import { ChatContainer } from './chat';
import '../styles/VideoPage.css';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimeToSeconds(input) {
  if (input === null || input === undefined || input === '') return null;
  const inputStr = String(input);
  
  if (/[hms]/i.test(inputStr)) {
    const hMatch = inputStr.match(/(\d+)h/i);
    const mMatch = inputStr.match(/(\d+)m/i);
    const sMatch = inputStr.match(/(\d+)s/i);
    return (hMatch ? parseInt(hMatch[1]) : 0) * 3600 +
           (mMatch ? parseInt(mMatch[1]) : 0) * 60 +
           (sMatch ? parseInt(sMatch[1]) : 0);
  }
  
  const asNumber = parseInt(inputStr);
  return (!isNaN(asNumber) && asNumber >= 0) ? asNumber : null;
}

function formatTimeForUrl(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  let parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join('');
}

function parseTimecode(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export default function VideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [video, setVideo] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [initialTime, setInitialTime] = useState(null);
  const [hideVideoInfo, setHideVideoInfo] = useState(false);
  const [isWideChat, setIsWideChat] = useState(false);
  const [, setCurrentPlaylistIndex] = useState(-1);
  const [pageTheme, setPageTheme] = useState(() => {
    return localStorage.getItem('chatTheme') || 'blue';
  });
  const playerRef = useRef(null);
  const descriptionRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const infoContainerRef = useRef(null);
  const infoHeightRef = useRef(0);
  const partSelectorRef = useRef(null);
  const partDropdownRef = useRef(null);
  const dropdownScrolledRef = useRef(false);
  const infoTouchRef = useRef({ time: 0, x: 0, y: 0 });
  const playlistVideosRef = useRef([]);

  const lastInitializedIdRef = useRef(null);
  
  useEffect(() => {
    if (lastInitializedIdRef.current !== id) {
      hasInitializedRef.current = false;
      lastInitializedIdRef.current = id;
    }

    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const timeParam = searchParams.get('time');
    if (timeParam) {
      const seconds = parseTimeToSeconds(timeParam);
      if (seconds !== null && seconds >= 0) {
        setInitialTime(seconds);
        return;
      }
    }
    
    try {
      const saved = localStorage.getItem('videoPlaybackState');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.videoId === id) {
          setInitialTime(Math.max(0, state.time - 5));
        }
      }
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, searchParams]);

  const isPartSwitchRef = useRef(false);
  
  useEffect(() => {
    if (isPartSwitchRef.current) {
      isPartSwitchRef.current = false;
      const idx = playlistVideosRef.current.findIndex(v => v.youtubeId === id);
      if (idx >= 0) setCurrentPlaylistIndex(idx);
      return;
    }
    
    setLoading(true);
    setVideo(null);
    setPlaylist(null);
    setCurrentTime(0);
    setCurrentPlaylistIndex(-1);
    
    axios.get(`${API_URL}/video/${id}`)
      .then(res => {
        setVideo(res.data);
        if (res.data.playlistYoutubeId) {
          return axios.get(`${API_URL}/playlist/${res.data.playlistYoutubeId}`);
        }
        return null;
      })
      .then(playlistRes => {
        if (playlistRes) {
          setPlaylist(playlistRes.data);
          playlistVideosRef.current = playlistRes.data.videos || [];
          const idx = playlistRes.data.videos?.findIndex(v => v.youtubeId === id) ?? -1;
          setCurrentPlaylistIndex(idx);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const currentVideoIdRef = useRef(video?.youtubeId);
  useEffect(() => {
    currentVideoIdRef.current = video?.youtubeId;
  }, [video?.youtubeId]);

  const lastProcessedTimeRef = useRef(0);
  
  useEffect(() => {
    if (!playlist && !video) return;
    
    let cancelled = false;
    let intervalId = null;
    let player = null;
    
    function loadYT() {
      return new Promise(resolve => {
        if (window.YT?.Player) { resolve(); return; }
        if (window.onYouTubeIframeAPIReadyCallbacks) {
          window.onYouTubeIframeAPIReadyCallbacks.push(resolve);
          return;
        }
        window.onYouTubeIframeAPIReadyCallbacks = [resolve];
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        window.onYouTubeIframeAPIReady = () => {
          window.onYouTubeIframeAPIReadyCallbacks.forEach(cb => cb());
          window.onYouTubeIframeAPIReadyCallbacks = null;
        };
        document.body.appendChild(tag);
      });
    }

    const handleYTMessage = (event) => {
      if (event.origin !== 'https://www.youtube.com') return;
      
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      
      if (data?.event === 'infoDelivery' && Number.isInteger(data?.info?.playlistIndex)) {
        const newIndex = data.info.playlistIndex;
        const videos = playlistVideosRef.current;
        
        if (videos.length > 0 && newIndex >= 0 && newIndex < videos.length) {
          const newVideo = videos[newIndex];
          if (newVideo?.youtubeId && newVideo.youtubeId !== currentVideoIdRef.current) {
            setVideo(newVideo);
            setCurrentPlaylistIndex(newIndex);
            setCurrentTime(0);
            setInitialTime(null);
            hasInitializedRef.current = false;
            setShowDescription(false);

            window.history.replaceState(null, '', `#/video/${newVideo.youtubeId}`);
          }
        }
      }
    };
    
    window.addEventListener('message', handleYTMessage);

    const initPlayer = async () => {
      await loadYT();
      if (cancelled) return;
      
      const iframeId = playlist?.youtubeId || video?.youtubeId;
      const iframe = document.getElementById(`yt-player-${iframeId}`);
      if (!iframe || cancelled) return;
      
      if (playerRef.current) return;
      
      player = new window.YT.Player(iframe, {
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            try {
              player.playVideo?.();
            } catch {}
            intervalId = setInterval(() => {
              if (cancelled || !playerRef.current) return;
              try {
                setCurrentTime(playerRef.current.getCurrentTime?.() || 0);
                setIsPlaying(playerRef.current.getPlayerState?.() === window.YT.PlayerState.PLAYING);
              } catch {}
            }, 200);
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            
            const state = ev.data;
            setIsPlaying(state === window.YT.PlayerState.PLAYING);
            
            if (state === window.YT.PlayerState.BUFFERING) {
              try {
                const currentTime = playerRef.current?.getCurrentTime?.() || 0;
                if (Math.abs(currentTime - lastProcessedTimeRef.current) >= 2) {
                  setShowPartDropdown(false);
                }
                lastProcessedTimeRef.current = currentTime;
              } catch {}
            }
          }
        }
      });
    };
    
    const timeoutId = setTimeout(initPlayer, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('message', handleYTMessage);
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.youtubeId]);

  const updateUrlTime = useCallback((time) => {
    if (time > 0) {
      setSearchParams({ time: formatTimeForUrl(time) }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  const savePlaybackState = useCallback(() => {
    if (!video || !playerRef.current) return;
    
    const time = playerRef.current.getCurrentTime?.() || currentTime;
    const state = {
      videoId: id,
      time: Math.floor(time),
      updatedAt: Date.now()
    };
    
    localStorage.setItem('videoPlaybackState', JSON.stringify(state));
  }, [video, id, currentTime]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        savePlaybackState();
      }
    };
    
    const handleBeforeUnload = () => {
      savePlaybackState();
    };
    
    const intervalId = setInterval(() => {
      savePlaybackState();
    }, 30000);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      savePlaybackState();
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [savePlaybackState]);

  useEffect(() => {
    if (!video?.youtubeId || !playlist?.youtubeId) return;
    localStorage.setItem('lastPlayedVideo', video.youtubeId);
    localStorage.setItem('lastPlayedPlaylist', playlist.youtubeId);
  }, [video?.youtubeId, playlist?.youtubeId]);

  const handleSeek = useCallback((time, updateUrl = true) => {
    if (playerRef.current?.seekTo) {
      const timeDiff = Math.abs(time - currentTime);
      if (timeDiff >= 2) {
        setShowPartDropdown(false);
      }
      
      playerRef.current.seekTo(time, true);
      setCurrentTime(time);
      if (updateUrl) updateUrlTime(time);
      savePlaybackState();
    }
  }, [currentTime, updateUrlTime, savePlaybackState]);

  useEffect(() => {
    if (!descriptionRef.current) return;
    
    const handleClick = (e) => {
      const target = e.target.closest('.timecode');
      if (target && target.dataset.seek) {
        e.preventDefault();
        e.stopPropagation();
        const seconds = parseInt(target.dataset.seek, 10);
        handleSeek(seconds);
      }
    };
    
    const el = descriptionRef.current;
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [handleSeek, showDescription]);

  const handlePartClick = (e, videoId, index) => {
    e.preventDefault();
    setShowPartDropdown(false);
    
    if (playerRef.current?.playVideoAt && playlist?.videos?.length > 1) {
      playerRef.current.playVideoAt(index);
      
      const newVideo = playlist.videos[index];
      if (newVideo) {
        isPartSwitchRef.current = true;
        window.history.replaceState(null, '', `#/video/${videoId}`);
        
        setVideo(newVideo);
        setCurrentPlaylistIndex(index);
        setCurrentTime(0);
        setInitialTime(null);
        hasInitializedRef.current = false;
        setShowDescription(false);
      }
    } else {
      navigate(`/video/${videoId}`, { replace: true });
    }
  };

  useEffect(() => {
    if (!showPartDropdown) {
      dropdownScrolledRef.current = false;
      return;
    }
    
    const handleClickOutside = (e) => {
      if (partSelectorRef.current && !partSelectorRef.current.contains(e.target)) {
        setShowPartDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showPartDropdown]);

  useEffect(() => {
    if (!showPartDropdown || dropdownScrolledRef.current) return;
    
    requestAnimationFrame(() => {
      if (partDropdownRef.current) {
        const activeItem = partDropdownRef.current.querySelector('.part-dropdown-item.active');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest' });
          dropdownScrolledRef.current = true;
        }
      }
    });
  }, [showPartDropdown]);

  const handleToggleDescription = () => {
    const newShowDescription = !showDescription;
    setShowDescription(newShowDescription);
    
    if (descriptionRef.current) {
      const descriptionEl = descriptionRef.current;
      const containerEl = descriptionEl.parentElement;
      
      if (newShowDescription) {
        const descStyle = getComputedStyle(descriptionEl);
        const margin = parseFloat(descStyle.marginTop) + parseFloat(descStyle.marginBottom);
        const contentHeight = descriptionEl.offsetHeight + margin;
        
        const isMobile = window.innerWidth <= 1100;
        const maxHeight = isMobile ? 70 : 200;
        
        containerEl.style.overflow = contentHeight <= maxHeight ? 'hidden' : 'auto';
      } else {
        containerEl.style.overflow = 'hidden';
      }
    }
  };

  const handleToggleHideInfo = useCallback((hide) => {
    setHideVideoInfo(hide);
    if (hide && infoContainerRef.current) {
      infoHeightRef.current = infoContainerRef.current.offsetHeight;
    }
  }, []);

  const handleInfoTouchStart = useCallback((e) => {
    const touch = e.changedTouches[0];
    infoTouchRef.current = { ...infoTouchRef.current, startX: touch.screenX, startY: touch.screenY };
  }, []);

  const handleInfoTouchEnd = useCallback((e) => {
    const touch = e.changedTouches[0];
    const endX = touch.screenX;
    const endY = touch.screenY;
    const startX = infoTouchRef.current.startX || 0;
    const startY = infoTouchRef.current.startY || 0;
    
    const TAP_MOVE_THRESHOLD = 10;
    const DOUBLE_TAP_DELAY = 300;
    const DOUBLE_TAP_DISTANCE = 30;
    
    const absX = Math.abs(endX - startX);
    const absY = Math.abs(endY - startY);
    
    if (absX < TAP_MOVE_THRESHOLD && absY < TAP_MOVE_THRESHOLD) {
      const now = Date.now();
      const timeDiff = now - (infoTouchRef.current.time || 0);
      const distX = Math.abs(endX - (infoTouchRef.current.x || 0));
      const distY = Math.abs(endY - (infoTouchRef.current.y || 0));
      
      if (
        timeDiff < DOUBLE_TAP_DELAY &&
        distX < DOUBLE_TAP_DISTANCE &&
        distY < DOUBLE_TAP_DISTANCE
      ) {
        setHideVideoInfo(true);
        infoTouchRef.current = { time: 0, x: 0, y: 0 };
        return;
      }
      
      infoTouchRef.current = { time: now, x: endX, y: endY };
    }
  }, []);

  const handleThemeChange = useCallback((theme) => {
    setPageTheme(theme);
    localStorage.setItem('chatTheme', theme);
  }, []);

  if (loading) return <div className="video-page" style={{ color: '#fff', padding: 20 }}>Loading...</div>;
  if (!video) return <div className="video-page" style={{ color: '#fff', padding: 20 }}>Video not found</div>;

  const hasDescription = video.description && !video.description.startsWith('Broadcasted live on Twitch');
  const videos = playlist?.videos || [];
  const currentIndex = videos.findIndex(v => v.youtubeId === video.youtubeId);
  const partMatch = video.name?.match(/\(Part\s+(\d+(?:\.\d+)?)/);
  const partNumber = partMatch ? partMatch[1] : (currentIndex + 1);

  const formattedDescription = video.description
    ?.replace(/https?:\/\/\S+/g, url => `<a class="description-link" target="_blank" rel="noopener noreferrer" href="${url}">${url}</a>`)
    .replace(/\b(\d{1,2}:)?(\d{1,2}):(\d{2})\b/g, (match) => {
      const seconds = parseTimecode(match);
      const timeStr = formatTimeForUrl(seconds);
      return `<a href="#/video/${id}?time=${timeStr}" class="description-link timecode" data-seek="${seconds}">${match}</a>`;
    });

  return (
    <div className="video-page" data-theme={pageTheme}>
      <div className="video-content">
        <div className={`video-wrapper ${isWideChat ? 'wide-chat' : ''}`}>
          {!hideVideoInfo && (
            <div className="compact-header">
              <Link to="/" className="header-logo-link">
                <img src={require('../images/logo.png')} alt="logo" className="header-logo" />
                <span className="header-site-name">tsunami's twitch vods</span>
              </Link>
            </div>
          )}
          
          <div className="youtube-player-container">
            <iframe
              key={playlist?.youtubeId || video.youtubeId}
              id={`yt-player-${playlist?.youtubeId || video.youtubeId}`}
              title={video.name}
              src={(() => {
                const hasPlaylist = playlist?.youtubeId && videos.length > 1;
                if (hasPlaylist) {
                  return `https://www.youtube.com/embed?listType=playlist&list=${playlist.youtubeId}&index=${currentIndex + 1}&enablejsapi=1&playsinline=1&rel=0&autoplay=1&origin=${encodeURIComponent(window.location.origin)}${initialTime ? `&start=${initialTime}` : ''}`;
                }
                return `https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&origin=${encodeURIComponent(window.location.origin)}${initialTime ? `&start=${initialTime}` : ''}`;
              })()}
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
          
          <div 
            ref={infoContainerRef}
            className={`info-container ${showDescription ? 'expanded' : ''} ${hideVideoInfo ? 'hidden' : ''}`}
            onTouchStart={handleInfoTouchStart}
            onTouchEnd={handleInfoTouchEnd}
          >
            <div className="info-topbar">
              <div className="video-metadata-container">
                {playlist?.gameCover && (
                  <Link 
                    to={`/playlist/${playlist.youtubeId}`}
                    className="game-cover" 
                    title="Go to Playlist"
                  >
                    <img src={playlist.gameCover} alt="Game Cover" className="game-cover-img" />
                    <div className="game-cover-overlay">
                      <svg className="back-arrow" viewBox="4 4 16 16">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
                      </svg>
                    </div>
                  </Link>
                )}
                <div className="video-text-container">
                  <div className="video-header">
                    <div className="video-title">{video.name}</div>
                    {video.subTitle && <div className="video-subtitle" title="Twitch Stream Title">{video.subTitle}</div>}
                    <div className="video-date">{formatDate(video.publishedAt || video.createdAt)}</div>
                  </div>
                </div>
              </div>
              
              <div className="video-controls">
                {videos.length > 1 && (
                  <div className="part-selector-container" ref={partSelectorRef}>
                    <label id="part-selector-label">Part</label>
                    <button 
                      className="part-selector-button"
                      aria-haspopup="listbox"
                      aria-expanded={showPartDropdown}
                      aria-labelledby="part-selector-label"
                      onClick={() => setShowPartDropdown(!showPartDropdown)}
                    >
                      {partNumber} ▾
                    </button>
                    {showPartDropdown && (
                      <div 
                        className="part-dropdown" 
                        role="listbox" 
                        aria-label="Select video part"
                        tabIndex={0}
                        ref={partDropdownRef}
                      >
                        {videos.map((v, idx) => (
                          <Link 
                            key={v.youtubeId}
                            to={`/video/${v.youtubeId}`}
                            className={`part-dropdown-item ${v.youtubeId === video.youtubeId ? 'active' : ''}`}
                            role="option"
                            aria-selected={v.youtubeId === video.youtubeId}
                            tabIndex={v.youtubeId === video.youtubeId ? 0 : -1}
                            onClick={(e) => handlePartClick(e, v.youtubeId, idx)}
                          >
                            <div className="part-dropdown-thumb-container">
                              <img 
                                src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`}
                                alt=""
                                className="part-dropdown-thumb"
                              />
                              {v.duration && (
                                <div className="part-duration-badge">{formatDuration(v.duration)}</div>
                              )}
                            </div>
                            <div className="part-dropdown-text">
                              <div className="part-video-title">{v.name}</div>
                              <div className="part-video-date">{formatDate(v.publishedAt)}</div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {hasDescription && (
                  <div className="description-expander-container" onClick={handleToggleDescription}>
                    <label className="description-button-label">
                      {showDescription ? 'Hide' : 'Show'} Description
                    </label>
                    <div className="description-button-container">
                      <button className="svg-button">
                        <svg className="description-icon" viewBox="4 4 16 16">
                          <path d="M14 17H4v2h10zm6-8H4v2h16zM4 15h16v-2H4zM4 5v2h16V5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {hasDescription && (
              <div className={`video-description-container ${showDescription ? 'show' : ''}`}>
                <div 
                  ref={descriptionRef}
                  className="video-description"
                  dangerouslySetInnerHTML={{ __html: formattedDescription }}
                  onClick={(e) => {
                    if (e.target.classList.contains('timecode') && e.target.dataset.seek) {
                      e.preventDefault();
                      handleSeek(parseInt(e.target.dataset.seek, 10));
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
        
        <ChatContainer
          key={video.id}
          videoId={video.id}
          youtubeVideoId={video.youtubeId}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          delayTime={3}
          onThemeChange={handleThemeChange}
          onHideVideoInfoChange={handleToggleHideInfo}
          hideVideoInfo={hideVideoInfo}
          theme={pageTheme}
          onWideChatChange={setIsWideChat}
        />
      </div>
    </div>
  );
}
