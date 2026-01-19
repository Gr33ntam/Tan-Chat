import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

function Leaderboard() {
  const navigate = useNavigate();
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'month', 'week'
  const [sortBy, setSortBy] = useState('winRate'); // 'winRate', 'totalSignals', 'totalPips'
  const [minSignals] = useState(5); // Minimum signals to appear on leaderboard

  useEffect(() => {
    loadLeaderboard();
  }, [timeFilter]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      // Calculate date filter
      let dateFilter = null;
      if (timeFilter === 'week') {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timeFilter === 'month') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      }

      // Get all official signals with metadata
      let query = supabase
        .from('official_posts_metadata')
        .select('*');

      if (dateFilter) {
        query = query.gte('created_at', dateFilter.toISOString());
      }

      const { data: metadata, error } = await query;

      if (error) {
        console.error('Error loading leaderboard:', error);
        return;
      }

      // Group by author and calculate stats
      const statsMap = {};

      metadata.forEach(signal => {
        const author = signal.author_username;
        
        if (!statsMap[author]) {
          statsMap[author] = {
            username: author,
            totalSignals: 0,
            won: 0,
            lost: 0,
            pending: 0,
            totalPips: 0,
            signals: []
          };
        }

        statsMap[author].totalSignals++;
        statsMap[author].signals.push(signal);

        if (signal.outcome === 'win') {
          statsMap[author].won++;
          statsMap[author].totalPips += signal.pips_gained || 0;
        } else if (signal.outcome === 'loss') {
          statsMap[author].lost++;
          statsMap[author].totalPips += signal.pips_gained || 0; // pips_gained will be negative for losses
        } else {
          statsMap[author].pending++;
        }
      });

      // Convert to array and calculate win rates
      const leaderboard = Object.values(statsMap)
        .filter(user => user.totalSignals >= minSignals)
        .map(user => ({
          ...user,
          winRate: user.won + user.lost > 0 
            ? ((user.won / (user.won + user.lost)) * 100).toFixed(1)
            : 0,
          completedSignals: user.won + user.lost
        }));

      setLeaderboardData(leaderboard);
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  const sortLeaderboard = (data) => {
    const sorted = [...data];
    
    switch (sortBy) {
      case 'winRate':
        return sorted.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
      case 'totalSignals':
        return sorted.sort((a, b) => b.totalSignals - a.totalSignals);
      case 'totalPips':
        return sorted.sort((a, b) => b.totalPips - a.totalPips);
      default:
        return sorted;
    }
  };

  const getRankEmoji = (index) => {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return `#${index + 1}`;
    }
  };

  const sortedData = sortLeaderboard(leaderboardData);

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
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ margin: 0, color: '#333', fontSize: '32px' }}>
              🏆 Leaderboard
            </h1>
            <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
              Top signal providers ranked by performance
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            💬 Back to Chat
          </button>
        </div>

        {/* Filters */}
        <div style={{
          backgroundColor: '#fff',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            display: 'flex', 
            gap: '15px', 
            marginBottom: '15px',
            flexWrap: 'wrap'
          }}>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '5px', 
                fontWeight: 'bold',
                fontSize: '14px',
                color: '#666'
              }}>
                Time Period:
              </label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                style={{
                  padding: '10px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  minWidth: '150px'
                }}
              >
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="week">This Week</option>
              </select>
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '5px', 
                fontWeight: 'bold',
                fontSize: '14px',
                color: '#666'
              }}>
                Sort By:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '10px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  minWidth: '150px'
                }}
              >
                <option value="winRate">Win Rate</option>
                <option value="totalSignals">Total Signals</option>
                <option value="totalPips">Total Pips</option>
              </select>
            </div>
          </div>

          <p style={{ 
            margin: 0, 
            fontSize: '12px', 
            color: '#999' 
          }}>
            * Minimum {minSignals} completed signals required to appear on leaderboard
          </p>
        </div>

        {/* Leaderboard Table */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              color: '#999',
              fontSize: '18px'
            }}>
              Loading leaderboard...
            </div>
          ) : sortedData.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              color: '#999',
              fontSize: '18px'
            }}>
              No traders found. Post {minSignals}+ signals to appear on the leaderboard! 📊
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ 
                    backgroundColor: '#f5f5f5', 
                    borderBottom: '2px solid #ddd' 
                  }}>
                    <th style={tableHeaderStyle}>Rank</th>
                    <th style={tableHeaderStyle}>Trader</th>
                    <th style={tableHeaderStyle}>Win Rate</th>
                    <th style={tableHeaderStyle}>Total Signals</th>
                    <th style={tableHeaderStyle}>Won</th>
                    <th style={tableHeaderStyle}>Lost</th>
                    <th style={tableHeaderStyle}>Pending</th>
                    <th style={tableHeaderStyle}>Total Pips</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((trader, index) => (
                    <tr 
                      key={trader.username}
                      style={{
                        borderBottom: '1px solid #eee',
                        backgroundColor: index < 3 ? '#fffef0' : (index % 2 === 0 ? '#fff' : '#fafafa'),
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index < 3 ? '#fffef0' : (index % 2 === 0 ? '#fff' : '#fafafa')}
                    >
                      <td style={{
                        ...tableCellStyle,
                        fontWeight: 'bold',
                        fontSize: '18px'
                      }}>
                        {getRankEmoji(index)}
                      </td>
                      <td style={tableCellStyle}>
                        <strong style={{ fontSize: '16px' }}>{trader.username}</strong>
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          backgroundColor: parseFloat(trader.winRate) >= 60 ? '#4CAF50' : 
                                         parseFloat(trader.winRate) >= 40 ? '#FF9800' : '#f44336',
                          color: 'white'
                        }}>
                          {trader.winRate}%
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <strong>{trader.totalSignals}</strong>
                      </td>
                      <td style={{ ...tableCellStyle, color: '#4CAF50', fontWeight: 'bold' }}>
                        {trader.won}
                      </td>
                      <td style={{ ...tableCellStyle, color: '#f44336', fontWeight: 'bold' }}>
                        {trader.lost}
                      </td>
                      <td style={{ ...tableCellStyle, color: '#FF9800', fontWeight: 'bold' }}>
                        {trader.pending}
                      </td>
                      <td style={{
                        ...tableCellStyle,
                        color: trader.totalPips >= 0 ? '#4CAF50' : '#f44336',
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}>
                        {trader.totalPips > 0 ? '+' : ''}{trader.totalPips.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {!loading && sortedData.length > 0 && (
          <div style={{
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '12px',
            marginTop: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>📊 Summary Statistics</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px'
            }}>
              <StatBox 
                label="Total Traders"
                value={sortedData.length}
                icon="👥"
                color="#2196F3"
              />
              <StatBox 
                label="Avg Win Rate"
                value={`${(sortedData.reduce((sum, t) => sum + parseFloat(t.winRate), 0) / sortedData.length).toFixed(1)}%`}
                icon="🎯"
                color="#4CAF50"
              />
              <StatBox 
                label="Total Signals"
                value={sortedData.reduce((sum, t) => sum + t.totalSignals, 0)}
                icon="📊"
                color="#FF9800"
              />
              <StatBox 
                label="Total Pips"
                value={`${sortedData.reduce((sum, t) => sum + t.totalPips, 0).toFixed(1)}`}
                icon="💰"
                color={sortedData.reduce((sum, t) => sum + t.totalPips, 0) >= 0 ? '#4CAF50' : '#f44336'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color }) {
  return (
    <div style={{
      padding: '15px',
      borderRadius: '8px',
      border: `2px solid ${color}`,
      backgroundColor: `${color}10`
    }}>
      <div style={{ 
        fontSize: '24px', 
        marginBottom: '5px' 
      }}>
        {icon}
      </div>
      <div style={{ 
        fontSize: '12px', 
        color: '#666',
        marginBottom: '5px'
      }}>
        {label}
      </div>
      <div style={{ 
        fontSize: '24px', 
        fontWeight: 'bold',
        color: color
      }}>
        {value}
      </div>
    </div>
  );
}

const tableHeaderStyle = {
  padding: '15px 12px',
  textAlign: 'left',
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const tableCellStyle = {
  padding: '15px 12px',
  fontSize: '14px'
};

export default Leaderboard;
