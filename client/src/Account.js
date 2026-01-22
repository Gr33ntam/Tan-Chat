import React, { useState, useEffect } from 'react';
import PerformanceCharts from './PerformanceCharts';
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

function Account({ username: propUsername, onLogout }) {
  const navigate = useNavigate();
  const username = propUsername || localStorage.getItem('username');

  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    messageCount: 0,
    accountAge: 0,
    // Trading stats
    totalSignals: 0,
    wonSignals: 0,
    lostSignals: 0,
    pendingSignals: 0,
    winRate: 0,
    totalPips: 0,
    avgRR: 0,
    bestTrade: null,
    worstTrade: null,
    avgPipsPerWin: 0,
    avgPipsPerLoss: 0,
    currentStreak: { type: null, count: 0 }
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signalMetadata, setSignalMetadata] = useState([]);  // ADD THIS
  useEffect(() => {
    if (username) {
      loadUserData();
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    socket.on('upgrade_success', (data) => {
      if (data.username === username) {
        loadUserData();
      }
    });

    return () => {
      socket.off('upgrade_success');
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
      // Get message count
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('username', username);

      // Get account age
      const { data: userData } = await supabase
        .from('users')
        .select('created_at')
        .eq('username', username)
        .single();

      const accountAge = userData
        ? Math.floor((Date.now() - new Date(userData.created_at)) / (1000 * 60 * 60 * 24))
        : 0;

      // Get trading statistics from official_posts_metadata
      const { data: signalMetadata, error: signalError } = await supabase
        .from('official_posts_metadata')
        .select('*')
        .eq('author_username', username)
        .order('created_at', { ascending: true });

      if (signalError) {
        console.error('Error loading signal metadata:', signalError);
      }

      // Calculate trading stats
      let tradingStats = {
        totalSignals: 0,
        wonSignals: 0,
        lostSignals: 0,
        pendingSignals: 0,
        winRate: 0,
        totalPips: 0,
        avgRR: 0,
        bestTrade: null,
        worstTrade: null,
        avgPipsPerWin: 0,
        avgPipsPerLoss: 0,
        currentStreak: { type: null, count: 0 }
      };

      if (signalMetadata && signalMetadata.length > 0) {
        const wins = [];
        const losses = [];
        let totalRR = 0;
        let rrCount = 0;
        let streakType = null;
        let streakCount = 0;

        signalMetadata.forEach(signal => {
          tradingStats.totalSignals++;

          if (signal.outcome === 'win') {
            tradingStats.wonSignals++;
            tradingStats.totalPips += signal.pips_gained || 0;
            wins.push(signal.pips_gained || 0);

            // Update streak
            if (streakType === 'win') {
              streakCount++;
            } else {
              streakType = 'win';
              streakCount = 1;
            }
          } else if (signal.outcome === 'loss') {
            tradingStats.lostSignals++;
            tradingStats.totalPips += signal.pips_gained || 0; // pips_gained is negative for losses
            losses.push(signal.pips_gained || 0);

            // Update streak
            if (streakType === 'loss') {
              streakCount++;
            } else {
              streakType = 'loss';
              streakCount = 1;
            }
          } else {
            tradingStats.pendingSignals++;
            // Pending doesn't break streak, skip
          }

          // Calculate average R:R from signal data if available
          if (signal.risk_reward) {
            totalRR += parseFloat(signal.risk_reward);
            rrCount++;
          }
        });

        // Calculate averages
        const completedSignals = tradingStats.wonSignals + tradingStats.lostSignals;
        tradingStats.winRate = completedSignals > 0
          ? ((tradingStats.wonSignals / completedSignals) * 100).toFixed(1)
          : 0;

        tradingStats.avgRR = rrCount > 0 ? (totalRR / rrCount).toFixed(2) : 0;

        tradingStats.avgPipsPerWin = wins.length > 0
          ? (wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(1)
          : 0;

        tradingStats.avgPipsPerLoss = losses.length > 0
          ? (losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1)
          : 0;

        // Find best and worst trades
        if (wins.length > 0) {
          tradingStats.bestTrade = Math.max(...wins).toFixed(1);
        }
        if (losses.length > 0) {
          tradingStats.worstTrade = Math.min(...losses).toFixed(1);
        }

        // Set current streak
        tradingStats.currentStreak = { type: streakType, count: streakCount };
      }

      setStats({
        messageCount: count || 0,
        accountAge: accountAge,
        ...tradingStats
      });
      setSignalMetadata(signalMetadata || []);  // ADD THIS LINE
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleUpgrade = (tier) => {
    socket.emit('upgrade_subscription', { username, tier });
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
          gap: '15px'
        }}>
          <div>
            <h1 style={{ margin: 0, color: '#333', fontSize: '32px' }}>
              👤 My Account
            </h1>
            <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
              Welcome back, <strong>{username}</strong>!
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/leaderboard')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              🏆 Leaderboard
            </button>
            <button
              onClick={() => navigate('/signal-history')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#673AB7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              📊 Signal History
            </button>
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
              onClick={onLogout}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
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

        {/* Basic Stats Grid */}
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

        {/* Trading Performance Section */}
        {stats.totalSignals > 0 && (
          <>
            <div style={{
              backgroundColor: '#fff',
              padding: '25px',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              marginBottom: '20px'
            }}>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '24px' }}>📊 Your Trading Statistics</h2>

              {/* Performance Charts */}
              {stats.totalSignals > 0 && (
                <PerformanceCharts stats={stats} signalHistory={signalMetadata} />
              )}

              {/* Main Trading Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
                marginBottom: '25px'
              }}>
                <TradingStatCard
                  label="Total Signals"
                  value={stats.totalSignals}
                  icon="📈"
                  color="#2196F3"
                />
                <TradingStatCard
                  label="Won"
                  value={stats.wonSignals}
                  icon="✅"
                  color="#4CAF50"
                />
                <TradingStatCard
                  label="Lost"
                  value={stats.lostSignals}
                  icon="❌"
                  color="#f44336"
                />
                <TradingStatCard
                  label="Pending"
                  value={stats.pendingSignals}
                  icon="🟡"
                  color="#FF9800"
                />
                <TradingStatCard
                  label="Win Rate"
                  value={`${stats.winRate}%`}
                  icon="🎯"
                  color="#9C27B0"
                />
                <TradingStatCard
                  label="Total Pips"
                  value={stats.totalPips > 0 ? `+${stats.totalPips.toFixed(1)}` : stats.totalPips.toFixed(1)}
                  icon="💰"
                  color={stats.totalPips >= 0 ? '#4CAF50' : '#f44336'}
                />
              </div>

              {/* Advanced Stats */}
              <h3 style={{ margin: '25px 0 15px 0', fontSize: '20px', color: '#666' }}>Advanced Metrics</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px'
              }}>
                <TradingStatCard
                  label="Avg Risk:Reward"
                  value={stats.avgRR}
                  icon="⚖️"
                  color="#673AB7"
                />
                <TradingStatCard
                  label="Best Trade"
                  value={stats.bestTrade ? `+${stats.bestTrade} pips` : 'N/A'}
                  icon="🌟"
                  color="#4CAF50"
                />
                <TradingStatCard
                  label="Worst Trade"
                  value={stats.worstTrade ? `${stats.worstTrade} pips` : 'N/A'}
                  icon="📉"
                  color="#f44336"
                />
                <TradingStatCard
                  label="Avg Win"
                  value={stats.avgPipsPerWin > 0 ? `+${stats.avgPipsPerWin} pips` : 'N/A'}
                  icon="📊"
                  color="#4CAF50"
                />
                <TradingStatCard
                  label="Avg Loss"
                  value={stats.avgPipsPerLoss !== 0 ? `${stats.avgPipsPerLoss} pips` : 'N/A'}
                  icon="📉"
                  color="#f44336"
                />
                <TradingStatCard
                  label="Current Streak"
                  value={stats.currentStreak.type ? `${stats.currentStreak.count} ${stats.currentStreak.type}${stats.currentStreak.count > 1 ? 's' : ''}` : 'N/A'}
                  icon={stats.currentStreak.type === 'win' ? '🔥' : stats.currentStreak.type === 'loss' ? '❄️' : '➖'}
                  color={stats.currentStreak.type === 'win' ? '#4CAF50' : stats.currentStreak.type === 'loss' ? '#f44336' : '#9E9E9E'}
                />
              </div>
            </div>
          </>
        )}

        {/* Analytics Link */}
        <div style={{
          backgroundColor: '#fff',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => navigate('/analytics')}
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
              boxShadow: '0 4px 8px rgba(156,39,176,0.3)'
            }}
          >
            📊 View My Trading Analytics
          </button>
        </div>

        {/* Access Info */}

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
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          currentTier={userData.subscription_tier}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
        />
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

function TradingStatCard({ label, value, icon, color }) {
  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
      border: `2px solid ${color}20`,
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px' }}>{icon}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>{label}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>
        {value}
      </div>
    </div>
  );
}

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