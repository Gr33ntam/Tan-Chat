import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

function UserProfile() {
  const { username: profileUsername } = useParams();
  const navigate = useNavigate();
  const currentUsername = localStorage.getItem('username');

  const [loading, setLoading] = useState(true);
  const [userExists, setUserExists] = useState(false);
  const [userTier, setUserTier] = useState('free');
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({
    totalSignals: 0,
    won: 0,
    lost: 0,
    pending: 0,
    winRate: 0,
    totalPips: 0
  });
  const [recentSignals, setRecentSignals] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (profileUsername) {
      loadUserProfile();
      checkIfFollowing();
    }
  }, [profileUsername]);

  useEffect(() => {
    socket.on('follow_success', ({ following }) => {
      if (following === profileUsername) {
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
      }
    });

    socket.on('unfollow_success', ({ following }) => {
      if (following === profileUsername) {
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
      }
    });

    return () => {
      socket.off('follow_success');
      socket.off('unfollow_success');
    };
  }, [profileUsername]);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('username, subscription_tier, created_at')
        .eq('username', profileUsername)
        .single();

      if (userError || !user) {
        setUserExists(false);
        setLoading(false);
        return;
      }

      setUserExists(true);
      setUserTier(user.subscription_tier);

      // Get follower/following counts
      const { data: followers } = await supabase
        .from('follows')
        .select('follower')
        .eq('following', profileUsername);

      const { data: following } = await supabase
        .from('follows')
        .select('following')
        .eq('follower', profileUsername);

      setFollowerCount(followers?.length || 0);
      setFollowingCount(following?.length || 0);

      // Get official signals
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('username', profileUsername)
        .eq('is_official', true)
        .eq('type', 'signal')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!messages) {
        setLoading(false);
        return;
      }

      const messageIds = messages.map(m => m.id);
      const { data: metadata } = await supabase
        .from('official_posts_metadata')
        .select('*')
        .in('message_id', messageIds);

      const metadataMap = {};
      (metadata || []).forEach(meta => {
        metadataMap[meta.message_id] = meta;
      });

      // Calculate stats
      let won = 0, lost = 0, pending = 0, totalPips = 0;

      const signalsWithMeta = messages.map(msg => {
        const meta = metadataMap[msg.id];
        if (meta) {
          if (meta.outcome === 'win') {
            won++;
            totalPips += meta.pips_gained || 0;
          } else if (meta.outcome === 'loss') {
            lost++;
            totalPips += meta.pips_gained || 0;
          } else {
            pending++;
          }
        } else {
          pending++;
        }
        return { ...msg, metadata: meta };
      });

      setStats({
        totalSignals: messages.length,
        won,
        lost,
        pending,
        winRate: won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : 0,
        totalPips: totalPips.toFixed(1)
      });

      setRecentSignals(signalsWithMeta);

    } catch (err) {
      console.error('Error loading profile:', err);
    }
    setLoading(false);
  };

  const checkIfFollowing = async () => {
    if (!currentUsername || currentUsername === profileUsername) return;

    try {
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower', currentUsername)
        .eq('following', profileUsername)
        .single();

      setIsFollowing(!!data);
    } catch (err) {
      console.error('Error checking follow status:', err);
    }
  };

  const handleFollow = () => {
    if (!currentUsername) {
      alert('Please log in to follow users');
      navigate('/');
      return;
    }
    socket.emit('follow_user', { follower: currentUsername, following: profileUsername });
  };

  const handleUnfollow = () => {
    socket.emit('unfollow_user', { follower: currentUsername, following: profileUsername });
  };

  const getTierBadge = (tier) => {
    switch (tier) {
      case 'premium':
        return { emoji: '👑', text: 'Premium', color: '#9C27B0' };
      case 'pro':
        return { emoji: '💎', text: 'Pro', color: '#4CAF50' };
      default:
        return { emoji: '🆓', text: 'Free', color: '#9E9E9E' };
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{ textAlign: 'center', color: '#666', fontSize: '18px' }}>
          Loading profile...
        </div>
      </div>
    );
  }

  if (!userExists) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', paddingTop: '100px' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>❌</div>
          <h1 style={{ color: '#333', marginBottom: '10px' }}>User Not Found</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>
            The user <strong>{profileUsername}</strong> does not exist.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  const tierBadge = getTierBadge(userTier);
  const isOwnProfile = currentUsername === profileUsername;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#fff',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: tierBadge.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              color: 'white',
              fontWeight: 'bold'
            }}>
              {profileUsername.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '32px', color: '#333' }}>
                {profileUsername}
              </h1>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '10px'
              }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: tierBadge.color,
                  color: 'white'
                }}>
                  {tierBadge.emoji} {tierBadge.text}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {!isOwnProfile && currentUsername && (
              <button
                onClick={isFollowing ? handleUnfollow : handleFollow}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isFollowing ? '#f44336' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                {isFollowing ? 'Unfollow' : '+ Follow'}
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px'
              }}
            >
              💬 Back to Chat
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '15px',
          marginBottom: '20px'
        }}>
          <StatCard label="Followers" value={followerCount} icon="👥" color="#2196F3" />
          <StatCard label="Following" value={followingCount} icon="➕" color="#FF9800" />
          <StatCard label="Total Signals" value={stats.totalSignals} icon="📊" color="#9C27B0" />
          <StatCard label="Win Rate" value={`${stats.winRate}%`} icon="🎯" color={parseFloat(stats.winRate) >= 60 ? '#4CAF50' : '#FF9800'} />
          <StatCard label="Won" value={stats.won} icon="✅" color="#4CAF50" />
          <StatCard label="Lost" value={stats.lost} icon="❌" color="#f44336" />
          <StatCard label="Total Pips" value={parseFloat(stats.totalPips) > 0 ? `+${stats.totalPips}` : stats.totalPips} icon="💰" color={parseFloat(stats.totalPips) >= 0 ? '#4CAF50' : '#f44336'} />
        </div>

        {/* Recent Signals */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '20px',
            borderBottom: '2px solid #f0f0f0'
          }}>
            <h2 style={{ margin: 0, fontSize: '24px' }}>📊 Recent Signals</h2>
          </div>

          {recentSignals.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              color: '#999',
              fontSize: '16px'
            }}>
              No signals posted yet
            </div>
          ) : (
            <div style={{ padding: '20px' }}>
              {recentSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  formatTime={formatTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '32px', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}

function SignalCard({ signal, formatTime }) {
  const isBuy = signal.signal.direction === 'BUY';
  const meta = signal.metadata;
  const outcome = meta?.outcome || 'pending';

  const getOutcomeBadge = () => {
    switch (outcome) {
      case 'win':
        return { text: '✅ Won', color: '#4CAF50' };
      case 'loss':
        return { text: '❌ Lost', color: '#f44336' };
      default:
        return { text: '🟡 Pending', color: '#FF9800' };
    }
  };

  const outcomeBadge = getOutcomeBadge();

  return (
    <div style={{
      border: `2px solid ${isBuy ? '#4CAF50' : '#f44336'}`,
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '15px',
      backgroundColor: isBuy ? '#E8F5E9' : '#FFEBEE'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: '22px',
            color: isBuy ? '#2E7D32' : '#C62828'
          }}>
            {signal.signal.direction} {signal.signal.pair}
          </h3>
          {signal.is_official && (
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: '#FF9800',
              color: 'white',
              marginTop: '5px',
              display: 'inline-block'
            }}>
              ⭐ OFFICIAL
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            padding: '6px 12px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 'bold',
            backgroundColor: outcomeBadge.color,
            color: 'white'
          }}>
            {outcomeBadge.text}
          </span>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {formatTime(signal.created_at)}
          </span>
        </div>
      </div>

      <div style={{ fontSize: '15px', lineHeight: '1.8' }}>
        <div><strong>Entry:</strong> {signal.signal.entry}</div>
        <div><strong>Stop Loss:</strong> {signal.signal.stopLoss}</div>
        <div><strong>Take Profit:</strong> {signal.signal.takeProfit}</div>
        <div style={{
          fontWeight: 'bold',
          color: '#4CAF50',
          fontSize: '18px',
          marginTop: '8px'
        }}>
          R:R {signal.signal.riskReward}
        </div>

        {meta && outcome !== 'pending' && (
          <div style={{
            marginTop: '15px',
            padding: '12px',
            backgroundColor: outcome === 'win' ? '#C8E6C9' : '#FFCDD2',
            borderRadius: '8px'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
              {outcome === 'win' ? '💰 Profit' : '📉 Loss'}: {Math.abs(meta.pips_gained || 0).toFixed(1)} pips
            </div>
            {meta.close_price && (
              <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                Close Price: {meta.close_price}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;