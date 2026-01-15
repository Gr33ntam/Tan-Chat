import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const socket = io('https://tan-chat.onrender.com');
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const TIERS = {
  free: { name: 'Free', price: '$0', icon: '🆓', color: '#9E9E9E' },
  pro: { name: 'Pro', price: '$9.99/mo', icon: '💎', color: '#4CAF50' },
  premium: { name: 'Premium', price: '$19.99/mo', icon: '👑', color: '#9C27B0' }
};

const AVATAR_OPTIONS = [
  '👤', '😀', '😎', '🤓', '👨‍💼', '👩‍💼', '👨‍💻', '👩‍💻',
  '🧑‍🚀', '👨‍🎨', '👩‍🎨', '🦸', '🦹', '🧙', '🧛', '🧟',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'
];

function Account({ username: propUsername, onLogout }) {
  const navigate = useNavigate();
  const username = propUsername || localStorage.getItem('username');

  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    messageCount: 0,
    accountAge: 0
  });
  // eslint-disable-next-line no-unused-vars
  const [userStats, setUserStats] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [leaderboard, setLeaderboard] = useState([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (username) {
      loadUserData();
      loadStats();
      loadUserStats();
      loadLeaderboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    socket.on('upgrade_success', (data) => {
      if (data.username === username) {
        loadUserData();
      }
    });

    socket.on('user_stats', (data) => {
      setUserStats(data.stats);
    });

    socket.on('leaderboard_data', (data) => {
      setLeaderboard(data.leaderboard || []);
    });

    return () => {
      socket.off('upgrade_success');
      socket.off('user_stats');
      socket.off('leaderboard_data');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const loadUserData = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error) {
        console.error('Error loading user:', error);
      } else {
        setUserData(data);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('username', username);

      const { data: userData } = await supabase
        .from('users')
        .select('created_at')
        .eq('username', username)
        .single();

      const accountAge = userData
        ? Math.floor((Date.now() - new Date(userData.created_at)) / (1000 * 60 * 60 * 24))
        : 0;

      setStats({
        messageCount: count || 0,
        accountAge: accountAge
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadUserStats = () => {
    if (username) {
      socket.emit('get_user_stats', { username });
    }
  };

  const loadLeaderboard = () => {
    socket.emit('get_leaderboard');
  };

  const handleUpgrade = (tier) => {
    socket.emit('upgrade_subscription', { username, tier });
  };

  const handleAvatarChange = async (newAvatar) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar: newAvatar })
        .eq('username', username);

      if (error) {
        console.error('Error updating avatar:', error);
        alert('Failed to update avatar');
      } else {
        setUserData({ ...userData, avatar: newAvatar });
        setShowAvatarModal(false);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to update avatar');
    }
  };

  const handleLogoutClick = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('username');
      if (onLogout) {
        onLogout();
      }
      navigate('/');
    }
  };

  if (!username) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <h2>Please log in to view your account</h2>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            marginTop: '20px'
          }}
        >
          Go to Chat
        </button>
      </div>
    );
  }

  if (loading || !userData) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <h2>Loading...</h2>
      </div>
    );
  }

  const currentTier = TIERS[userData.subscription_tier] || TIERS.free;
  const userAvatar = userData.avatar || '👤';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#fff',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                backgroundColor: '#e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '60px',
                border: '4px solid ' + currentTier.color,
                cursor: 'pointer'
              }}
                onClick={() => setShowAvatarModal(true)}
              >
                {userAvatar}
              </div>
              <button
                onClick={() => setShowAvatarModal(true)}
                style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: '2px solid white',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✏️
              </button>
            </div>
            <div>
              <h1 style={{ margin: 0, color: '#333', fontSize: '32px' }}>
                My Account
              </h1>
              <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
                Welcome back, <strong>{username}</strong>!
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              💬 Chat
            </button>
            <button
              onClick={handleLogoutClick}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Subscription Card */}
        <div style={{
          backgroundColor: '#fff',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: `6px solid ${currentTier.color}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '24px' }}>Current Subscription</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '15px' }}>
                <span style={{ fontSize: '48px' }}>{currentTier.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: currentTier.color }}>
                    {currentTier.name}
                  </p>
                  <p style={{ margin: '5px 0 0 0', fontSize: '18px', color: '#666' }}>
                    {currentTier.price}
                  </p>
                </div>
              </div>
            </div>
            {userData.subscription_tier !== 'premium' && (
              <button
                onClick={() => setShowUpgradeModal(true)}
                style={{
                  padding: '14px 28px',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  boxShadow: '0 4px 8px rgba(255,152,0,0.3)'
                }}
              >
                ⬆️ Upgrade Now
              </button>
            )}
            {userData.subscription_tier === 'premium' && (
              <div style={{
                padding: '14px 28px',
                backgroundColor: '#4CAF50',
                color: 'white',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px'
              }}>
                ✓ You're on the best plan!
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '20px'
        }}>
          <StatCard
            title="Total Messages"
            value={stats.messageCount}
            icon="💬"
            color="#2196F3"
          />
          <StatCard
            title="Account Age"
            value={`${stats.accountAge} days`}
            icon="📅"
            color="#9C27B0"
          />
          <StatCard
            title="Member Since"
            value={new Date(userData.created_at).toLocaleDateString()}
            icon="🎉"
            color="#4CAF50"
          />
        </div>

        {/* Access Info */}
        <div style={{
          backgroundColor: '#fff',
          padding: '25px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '22px' }}>🔓 Your Access</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AccessItem room="💬 General" hasAccess={true} />
            <AccessItem
              room="💱 Forex"
              hasAccess={userData.subscription_tier !== 'free'}
            />
            <AccessItem
              room="₿ Crypto"
              hasAccess={userData.subscription_tier !== 'free'}
            />
            <AccessItem
              room="📈 Stocks"
              hasAccess={userData.subscription_tier === 'premium'}
            />
          </div>
        </div>

        {/* Trading Statistics */}
        {userStats && (userData.subscription_tier === 'pro' || userData.subscription_tier === 'premium') && (
          <div style={{
            backgroundColor: '#fff',
            padding: '25px',
            borderRadius: '12px',
            marginTop: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '22px' }}>📊 Your Trading Statistics</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '15px'
            }}>
              <TradingStatCard
                title="Total Signals"
                value={userStats.totalSignals}
                icon="📈"
                color="#2196F3"
              />
              <TradingStatCard
                title="Won"
                value={userStats.wonSignals}
                icon="✅"
                color="#4CAF50"
              />
              <TradingStatCard
                title="Lost"
                value={userStats.lostSignals}
                icon="❌"
                color="#f44336"
              />
              <TradingStatCard
                title="Pending"
                value={userStats.pendingSignals}
                icon="🟡"
                color="#FF9800"
              />
              <TradingStatCard
                title="Win Rate"
                value={`${userStats.winRate}%`}
                icon="🎯"
                color="#9C27B0"
              />
              <TradingStatCard
                title="Total Pips"
                value={userStats.totalPips > 0 ? `+${userStats.totalPips}` : userStats.totalPips}
                icon="💰"
                color={userStats.totalPips >= 0 ? '#4CAF50' : '#f44336'}
              />
            </div>
          </div>
        )}

        {/* Global Leaderboard */}
        {leaderboard.length > 0 && (
          <div style={{
            backgroundColor: '#fff',
            padding: '25px',
            borderRadius: '12px',
            marginTop: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '22px' }}>🏆 Top Traders Leaderboard</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={tableHeaderStyle}>Rank</th>
                    <th style={tableHeaderStyle}>Trader</th>
                    <th style={tableHeaderStyle}>Win Rate</th>
                    <th style={tableHeaderStyle}>Signals</th>
                    <th style={tableHeaderStyle}>Total Pips</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((trader, index) => (
                    <tr key={trader.username} style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: trader.username === username ? '#E3F2FD' : (index % 2 === 0 ? '#fff' : '#fafafa')
                    }}>
                      <td style={tableCellStyle}>
                        <span style={{ fontSize: '20px' }}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <strong>{trader.username}</strong>
                        {trader.username === username && (
                          <span style={{
                            marginLeft: '8px',
                            padding: '2px 8px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }}>
                            YOU
                          </span>
                        )}
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{
                          fontWeight: 'bold',
                          color: parseFloat(trader.winRate) >= 60 ? '#4CAF50' : parseFloat(trader.winRate) >= 40 ? '#FF9800' : '#f44336'
                        }}>
                          {trader.winRate}%
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        {trader.totalSignals} ({trader.wonSignals}W / {trader.lostSignals}L)
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{
                          fontWeight: 'bold',
                          color: parseFloat(trader.totalPips) >= 0 ? '#4CAF50' : '#f44336'
                        }}>
                          {parseFloat(trader.totalPips) > 0 ? '+' : ''}{trader.totalPips}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '15px', textAlign: 'center' }}>
              * Minimum 3 closed signals required to appear on leaderboard
            </p>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          currentTier={userData.subscription_tier}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Avatar Selection Modal */}
      {showAvatarModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0, textAlign: 'center' }}>Choose Your Avatar</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '10px',
              marginBottom: '20px'
            }}>
              {AVATAR_OPTIONS.map((avatar, index) => (
                <button
                  key={index}
                  onClick={() => handleAvatarChange(avatar)}
                  style={{
                    width: '60px',
                    height: '60px',
                    fontSize: '32px',
                    border: userAvatar === avatar ? '3px solid #2196F3' : '2px solid #ddd',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    backgroundColor: userAvatar === avatar ? '#E3F2FD' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  {avatar}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAvatarModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#f0f0f0',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '25px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: '#999', fontSize: '14px', marginBottom: '8px' }}>
            {title}
          </p>
          <h2 style={{ margin: 0, color: '#333', fontSize: '28px' }}>
            {value}
          </h2>
        </div>
        <div style={{ fontSize: '40px' }}>{icon}</div>
      </div>
    </div>
  );
}

function TradingStatCard({ title, value, icon, color }) {
  return (
    <div style={{
      backgroundColor: '#f9f9f9',
      padding: '20px',
      borderRadius: '8px',
      border: `2px solid ${color}`,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
        {title}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>
        {value}
      </div>
    </div>
  );
}

const tableHeaderStyle = {
  padding: '12px',
  textAlign: 'left',
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#666'
};

const tableCellStyle = {
  padding: '12px',
  fontSize: '14px'
};

function AccessItem({ room, hasAccess }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px',
      backgroundColor: hasAccess ? '#E8F5E9' : '#FFEBEE',
      borderRadius: '8px',
      border: `2px solid ${hasAccess ? '#4CAF50' : '#f44336'}`
    }}>
      <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{room}</span>
      <span style={{
        fontSize: '14px',
        fontWeight: 'bold',
        color: hasAccess ? '#4CAF50' : '#f44336'
      }}>
        {hasAccess ? '✓ Unlocked' : '🔒 Locked'}
      </span>
    </div>
  );
}

function UpgradeModal({ currentTier, onClose, onUpgrade }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '16px',
        padding: '30px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>🚀 Upgrade Your Plan</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Get access to premium trading rooms and exclusive features
        </p>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {Object.entries(TIERS).map(([tier, info]) => {
            const isCurrent = tier === currentTier;
            return (
              <div key={tier} style={{
                flex: 1,
                minWidth: '150px',
                border: isCurrent ? '3px solid #4CAF50' : '2px solid #ddd',
                borderRadius: '12px',
                padding: '20px',
                backgroundColor: isCurrent ? '#f0f0f0' : '#fff',
                position: 'relative'
              }}>
                {isCurrent && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '10px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    Current Plan
                  </div>
                )}
                <h3 style={{ marginTop: 0, textAlign: 'center' }}>
                  {info.icon} {info.name}
                </h3>
                <p style={{
                  textAlign: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  margin: '10px 0',
                  color: info.color
                }}>
                  {info.price}
                </p>
                {!isCurrent && tier !== 'free' && (
                  <button
                    onClick={() => {
                      onUpgrade(tier);
                      onClose();
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: info.color,
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      marginTop: '10px'
                    }}
                  >
                    Upgrade to {info.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '20px' }}>
          💳 This is a mock payment. In production, you'd be redirected to Stripe.
        </p>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#f0f0f0',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '10px'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default Account;