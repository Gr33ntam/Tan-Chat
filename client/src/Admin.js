import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';

const socket = io('https://tan-chat.onrender.com');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const ADMIN_PASSWORD = 'admin123';

function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    freeUsers: 0,
    proUsers: 0,
    premiumUsers: 0,
    totalMessages: 0,
    totalRevenue: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Generate avatar URL using DiceBear API
  const getAvatar = (username) => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadUsers();
      loadStats();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    socket.on('upgrade_success', () => {
      loadUsers();
      loadStats();
    });
    return () => {
      socket.off('upgrade_success');
    };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading users:', error);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('subscription_tier');
      const freeCount = usersData?.filter(u => u.subscription_tier === 'free').length || 0;
      const proCount = usersData?.filter(u => u.subscription_tier === 'pro').length || 0;
      const premiumCount = usersData?.filter(u => u.subscription_tier === 'premium').length || 0;
      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });
      const revenue = (proCount * 9.99) + (premiumCount * 19.99);
      setStats({
        totalUsers: usersData?.length || 0,
        freeUsers: freeCount,
        proUsers: proCount,
        premiumUsers: premiumCount,
        totalMessages: messageCount || 0,
        totalRevenue: revenue.toFixed(2)
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPassword('');
    } else {
      alert('❌ Incorrect password!');
      setPassword('');
    }
  };

  const handleUpgradeUser = (username, newTier) => {
    socket.emit('upgrade_subscription', { username, tier: newTier });
    setTimeout(() => {
      loadUsers();
      loadStats();
    }, 500);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          backgroundColor: '#fff',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          width: '400px'
        }}>
          <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
            🔐 Admin Login
          </h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Login
            </button>
          </form>
          <p style={{ textAlign: 'center', color: '#999', fontSize: '14px', marginTop: '20px' }}>
            Default password: <code style={{ backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '4px' }}>admin123</code>
          </p>
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <a href="/" style={{ color: '#2196F3', textDecoration: 'none' }}>
              ← Back to Chat
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#333' }}>👑 Admin Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Manage users and view analytics
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="/"
            style={{
              padding: '10px 20px',
              backgroundColor: '#f0f0f0',
              color: '#333',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 'bold'
            }}
          >
            💬 Chat
          </a>
          <button
            onClick={handleLogout}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color="#2196F3" />
        <StatCard title="Free Users" value={stats.freeUsers} icon="🆓" color="#9E9E9E" />
        <StatCard title="Pro Users" value={stats.proUsers} icon="💎" color="#4CAF50" />
        <StatCard title="Premium Users" value={stats.premiumUsers} icon="👑" color="#9C27B0" />
        <StatCard title="Total Messages" value={stats.totalMessages} icon="💬" color="#FF9800" />
        <StatCard title="Monthly Revenue" value={`$${stats.totalRevenue}`} icon="💰" color="#4CAF50" />
      </div>

      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0 }}>User Management</h2>
          <button
            onClick={loadUsers}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🔄 Refresh
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            border: '2px solid #ddd',
            borderRadius: '8px',
            marginBottom: '20px',
            boxSizing: 'border-box'
          }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            No users found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                  <th style={tableHeaderStyle}>User</th>
                  <th style={tableHeaderStyle}>Tier</th>
                  <th style={tableHeaderStyle}>Joined</th>
                  <th style={tableHeaderStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr key={user.id} style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa'
                  }}>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img 
                          src={getAvatar(user.username)} 
                          alt={user.username}
                          style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%',
                            border: '2px solid #ddd'
                          }}
                        />
                        <strong>{user.username}</strong>
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        backgroundColor: getTierColor(user.subscription_tier),
                        color: 'white'
                      }}>
                        {user.subscription_tier === 'free' ? '🆓 Free' :
                         user.subscription_tier === 'pro' ? '💎 Pro' : '👑 Premium'}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {user.subscription_tier !== 'free' && (
                          <button
                            onClick={() => handleUpgradeUser(user.username, 'free')}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#9E9E9E',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            ⬇️ Free
                          </button>
                        )}
                        {user.subscription_tier !== 'pro' && (
                          <button
                            onClick={() => handleUpgradeUser(user.username, 'pro')}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#4CAF50',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            {user.subscription_tier === 'free' ? '⬆️' : '⬇️'} Pro
                          </button>
                        )}
                        {user.subscription_tier !== 'premium' && (
                          <button
                            onClick={() => handleUpgradeUser(user.username, 'premium')}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#9C27B0',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            ⬆️ Premium
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: '#999', fontSize: '14px' }}>{title}</p>
          <h2 style={{ margin: '8px 0 0 0', color: '#333', fontSize: '32px' }}>{value}</h2>
        </div>
        <div style={{ fontSize: '40px' }}>{icon}</div>
      </div>
    </div>
  );
}

function getTierColor(tier) {
  switch (tier) {
    case 'free': return '#9E9E9E';
    case 'pro': return '#4CAF50';
    case 'premium': return '#9C27B0';
    default: return '#9E9E9E';
  }
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

export default Admin;