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

function Account({ username: propUsername, onLogout }) {
  const navigate = useNavigate();
  const username = propUsername || localStorage.getItem('username');
  
  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    messageCount: 0,
    accountAge: 0
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Generate avatar URL using DiceBear API
  const getAvatar = (username) => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  };

  useEffect(() => {
    if (username) {
      loadUserData();
      loadStats();
    }
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
            <img 
              src={getAvatar(username)} 
              alt={username}
              style={{ 
                width: '80px', 
                height: '80px', 
                borderRadius: '50%',
                border: '4px solid #2196F3',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
              }}
            />
            <div>
              <h1 style={{ margin: 0, color: '#333', fontSize: '32px' }}>
                👤 My Account
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