import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

const calculatePips = (direction, entry, closePrice) => {
    if (!entry || !closePrice) return 0;

    const pips = direction === 'BUY'
        ? (closePrice - entry)
        : (entry - closePrice);

    return pips * 10000;
};

function Leaderboard() {
    const navigate = useNavigate();
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeFilter, setTimeFilter] = useState('all');
    const [sortBy, setSortBy] = useState('winRate');
    const [minSignals] = useState(5);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        loadLeaderboard();

        // Real-time updates when signals are updated
        socket.on('signal_updated', () => {
            console.log('Signal updated, refreshing leaderboard...');
            loadLeaderboard();
        });

        return () => {
            socket.off('signal_updated');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeFilter]);

    const loadLeaderboard = async () => {
        setLoading(true);
        try {
            let dateFilter = null;
            if (timeFilter === 'week') {
                dateFilter = new Date();
                dateFilter.setDate(dateFilter.getDate() - 7);
            } else if (timeFilter === 'month') {
                dateFilter = new Date();
                dateFilter.setMonth(dateFilter.getMonth() - 1);
            }

            // Get official signals with metadata
            let query = supabase
                .from('messages')
                .select(`
                    id,
                    username,
                    signal,
                    timestamp,
                    created_at
                `)
                .eq('is_official', true)
                .eq('type', 'signal');

            if (dateFilter) {
                query = query.gte('created_at', dateFilter.toISOString());
            }

            const { data: messages, error: messagesError } = await query;

            if (messagesError) {
                console.error('Error loading messages:', messagesError);
                setLoading(false);
                return;
            }

            // Get metadata for these signals
            const messageIds = messages.map(m => m.id);
            const { data: metadata, error: metadataError } = await supabase
                .from('official_posts_metadata')
                .select('*')
                .in('message_id', messageIds);

            if (metadataError) {
                console.error('Error loading metadata:', metadataError);
            }

            // Create metadata map
            const metadataMap = {};
            (metadata || []).forEach(meta => {
                metadataMap[meta.message_id] = meta;
            });

            // Get user tiers
            const usernames = [...new Set(messages.map(m => m.username))];
            const { data: users } = await supabase
                .from('users')
                .select('username, subscription_tier')
                .in('username', usernames);

            const tierMap = {};
            (users || []).forEach(user => {
                tierMap[user.username] = user.subscription_tier;
            });

            // Group by author and calculate stats
            const statsMap = {};

            messages.forEach(msg => {
                const author = msg.username;
                const meta = metadataMap[msg.id];

                if (!statsMap[author]) {
                    statsMap[author] = {
                        username: author,
                        tier: tierMap[author] || 'free',
                        totalSignals: 0,
                        won: 0,
                        lost: 0,
                        pending: 0,
                        totalPips: 0,
                        signals: []
                    };
                }

                statsMap[author].totalSignals++;
                statsMap[author].signals.push({ ...msg, metadata: meta });

                if (meta) {
                    if (meta.outcome === 'win') {
                        statsMap[author].won++;
                        const pips = calculatePips(
                            msg.signal.direction,
                            msg.signal.entry,
                            meta.close_price
                        );
                        statsMap[author].totalPips += pips;
                    } else if (meta.outcome === 'loss') {
                        statsMap[author].lost++;
                        const pips = calculatePips(
                            msg.signal.direction,
                            msg.signal.entry,
                            meta.close_price
                        );
                        statsMap[author].totalPips += pips;
                    } else {
                        statsMap[author].pending++;
                    }
                } else {
                    statsMap[author].pending++;
                }
            });

            // Convert to array and calculate win rates
            const leaderboard = Object.values(statsMap)
                .filter(user => (user.won + user.lost) >= minSignals)
                .map(user => ({
                    ...user,
                    winRate: user.won + user.lost > 0
                        ? ((user.won / (user.won + user.lost)) * 100).toFixed(1)
                        : 0,
                    completedSignals: user.won + user.lost
                }));

            setLeaderboardData(leaderboard);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Error:', err);
        }
        setLoading(false);
    };

    const sortLeaderboard = (data) => {
        const sorted = [...data];

        switch (sortBy) {
            case 'winRate':
                return sorted.sort((a, b) => {
                    const winRateDiff = parseFloat(b.winRate) - parseFloat(a.winRate);
                    if (winRateDiff !== 0) return winRateDiff;
                    return b.completedSignals - a.completedSignals;
                });
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

    const getTierBadge = (tier) => {
        switch (tier) {
            case 'premium':
                return { emoji: '👑', text: 'Premium', color: '#9C27B0' };
            case 'pro':
                return { emoji: '💎', text: 'Pro', color: '#4CAF50' };
            default:
                return null;
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
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <div>
                        <h1 style={{ margin: 0, color: '#333', fontSize: '32px' }}>
                            🏆 Leaderboard
                        </h1>
                        <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
                            Top signal providers ranked by performance
                        </p>
                        {lastUpdate && (
                            <p style={{ margin: '5px 0 0 0', color: '#999', fontSize: '12px' }}>
                                Last updated: {lastUpdate.toLocaleTimeString()}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={loadLeaderboard}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                        >
                            🔄 Refresh
                        </button>
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
                                        <th style={tableHeaderStyle}>Completed</th>
                                        <th style={tableHeaderStyle}>Won</th>
                                        <th style={tableHeaderStyle}>Lost</th>
                                        <th style={tableHeaderStyle}>Pending</th>
                                        <th style={tableHeaderStyle}>Total Pips</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedData.map((trader, index) => {
                                        const tierBadge = getTierBadge(trader.tier);
                                        return (
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <strong style={{ fontSize: '16px' }}>{trader.username}</strong>
                                                        {tierBadge && (
                                                            <span style={{
                                                                padding: '2px 8px',
                                                                borderRadius: '8px',
                                                                fontSize: '11px',
                                                                fontWeight: 'bold',
                                                                backgroundColor: tierBadge.color,
                                                                color: 'white'
                                                            }}>
                                                                {tierBadge.emoji} {tierBadge.text}
                                                            </span>
                                                        )}
                                                    </div>
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
                                                    <strong>{trader.completedSignals}</strong>
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
                                        );
                                    })}
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