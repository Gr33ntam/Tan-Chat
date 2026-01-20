import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

function SignalHistory() {
    const navigate = useNavigate();
    const username = localStorage.getItem('username');

    const [signals, setSignals] = useState([]);
    const [filteredSignals, setFilteredSignals] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [outcomeFilter, setOutcomeFilter] = useState('all');
    const [pairFilter, setPairFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    // Available pairs (will be populated from data)
    const [availablePairs, setAvailablePairs] = useState([]);

    useEffect(() => {
        if (username) {
            loadSignals();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    useEffect(() => {
        applyFilters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signals, outcomeFilter, pairFilter, dateFilter, sortBy]);

    const loadSignals = async () => {
        setLoading(true);
        try {
            // Get all official posts by this user
            const { data: posts, error: postsError } = await supabase
                .from('official_posts_metadata')
                .select('*')
                .eq('author_username', username)
                .order('created_at', { ascending: false });

            if (postsError) {
                console.error('Error loading signals:', postsError);
                return;
            }

            // Extract unique pairs
            const pairs = [...new Set(posts.map(p => p.pair))].sort();
            setAvailablePairs(pairs);

            setSignals(posts || []);
        } catch (err) {
            console.error('Error:', err);
        }
        setLoading(false);
    };

    const applyFilters = () => {
        let filtered = [...signals];

        // Outcome filter
        if (outcomeFilter !== 'all') {
            filtered = filtered.filter(s => s.outcome === outcomeFilter);
        }

        // Pair filter
        if (pairFilter !== 'all') {
            filtered = filtered.filter(s => s.pair === pairFilter);
        }

        // Date filter
        const now = new Date();
        if (dateFilter === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(s => new Date(s.created_at) >= weekAgo);
        } else if (dateFilter === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(s => new Date(s.created_at) >= monthAgo);
        } else if (dateFilter === '3months') {
            const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(s => new Date(s.created_at) >= threeMonthsAgo);
        }

        // Sort
        if (sortBy === 'newest') {
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortBy === 'oldest') {
            filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        } else if (sortBy === 'highest-pips') {
            filtered.sort((a, b) => (b.pips_gained || 0) - (a.pips_gained || 0));
        } else if (sortBy === 'lowest-pips') {
            filtered.sort((a, b) => (a.pips_gained || 0) - (b.pips_gained || 0));
        }

        setFilteredSignals(filtered);
    };

    const exportToCSV = () => {
        if (filteredSignals.length === 0) {
            alert('No signals to export!');
            return;
        }

        const headers = ['Date', 'Pair', 'Direction', 'Entry', 'Stop Loss', 'Take Profit', 'R:R', 'Outcome', 'Close Price', 'Pips Gained', 'Closed At'];

        const rows = filteredSignals.map(signal => [
            new Date(signal.created_at).toLocaleDateString(),
            signal.pair,
            signal.direction,
            signal.entry_price,
            signal.stop_loss,
            signal.take_profit,
            signal.risk_reward,
            signal.outcome || 'pending',
            signal.close_price || 'N/A',
            signal.pips_gained || 0,
            signal.closed_at ? new Date(signal.closed_at).toLocaleDateString() : 'N/A'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `signal-history-${username}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const getOutcomeColor = (outcome) => {
        if (outcome === 'win') return '#4CAF50';
        if (outcome === 'loss') return '#f44336';
        return '#FF9800';
    };

    const getOutcomeIcon = (outcome) => {
        if (outcome === 'win') return '✅';
        if (outcome === 'loss') return '❌';
        return '🟡';
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!username) {
        return (
            <div style={{
                padding: '40px',
                textAlign: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <h2>Please log in to view your signal history</h2>
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

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f5f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '20px'
        }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
                            📊 Signal History
                        </h1>
                        <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
                            View and analyze all your trading signals
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={exportToCSV}
                            disabled={filteredSignals.length === 0}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: filteredSignals.length > 0 ? '#4CAF50' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: filteredSignals.length > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                        >
                            📥 Export CSV
                        </button>
                        <button
                            onClick={() => navigate('/account')}
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
                            👤 Account
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
                    </div>
                </div>

                {/* Filters */}
                <div style={{
                    backgroundColor: '#fff',
                    padding: '25px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>🔍 Filters</h3>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '15px'
                    }}>
                        {/* Outcome Filter */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#666' }}>
                                Outcome
                            </label>
                            <select
                                value={outcomeFilter}
                                onChange={(e) => setOutcomeFilter(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '2px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">All Outcomes</option>
                                <option value="win">✅ Won</option>
                                <option value="loss">❌ Lost</option>
                                <option value="pending">🟡 Pending</option>
                            </select>
                        </div>

                        {/* Pair Filter */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#666' }}>
                                Trading Pair
                            </label>
                            <select
                                value={pairFilter}
                                onChange={(e) => setPairFilter(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '2px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">All Pairs</option>
                                {availablePairs.map(pair => (
                                    <option key={pair} value={pair}>{pair}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Filter */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#666' }}>
                                Time Period
                            </label>
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '2px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">All Time</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                                <option value="3months">Last 3 Months</option>
                            </select>
                        </div>

                        {/* Sort By */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#666' }}>
                                Sort By
                            </label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '2px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="highest-pips">Highest Pips</option>
                                <option value="lowest-pips">Lowest Pips</option>
                            </select>
                        </div>
                    </div>

                    <div style={{
                        marginTop: '15px',
                        padding: '12px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#666'
                    }}>
                        Showing <strong>{filteredSignals.length}</strong> of <strong>{signals.length}</strong> signals
                    </div>
                </div>

                {/* Signals Table */}
                <div style={{
                    backgroundColor: '#fff',
                    padding: '25px',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    overflowX: 'auto'
                }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                            Loading signals...
                        </div>
                    ) : filteredSignals.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
                                No signals found
                            </div>
                            <div style={{ fontSize: '14px' }}>
                                {signals.length === 0
                                    ? "You haven't posted any signals yet"
                                    : "Try adjusting your filters"}
                            </div>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                                        <th style={tableHeaderStyle}>Date</th>
                                        <th style={tableHeaderStyle}>Pair</th>
                                        <th style={tableHeaderStyle}>Direction</th>
                                        <th style={tableHeaderStyle}>Entry</th>
                                        <th style={tableHeaderStyle}>SL</th>
                                        <th style={tableHeaderStyle}>TP</th>
                                        <th style={tableHeaderStyle}>R:R</th>
                                        <th style={tableHeaderStyle}>Outcome</th>
                                        <th style={tableHeaderStyle}>Close Price</th>
                                        <th style={tableHeaderStyle}>Pips</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSignals.map((signal, index) => (
                                        <tr key={signal.id} style={{
                                            borderBottom: '1px solid #eee',
                                            backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                                            transition: 'background-color 0.2s'
                                        }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fafafa'}
                                        >
                                            <td style={tableCellStyle}>
                                                <div style={{ fontSize: '13px', color: '#666' }}>
                                                    {formatDate(signal.created_at)}
                                                </div>
                                            </td>
                                            <td style={{ ...tableCellStyle, fontWeight: 'bold', color: '#333' }}>
                                                {signal.pair}
                                            </td>
                                            <td style={tableCellStyle}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '12px',
                                                    fontWeight: 'bold',
                                                    backgroundColor: signal.direction === 'BUY' ? '#E8F5E9' : '#FFEBEE',
                                                    color: signal.direction === 'BUY' ? '#4CAF50' : '#f44336'
                                                }}>
                                                    {signal.direction}
                                                </span>
                                            </td>
                                            <td style={tableCellStyle}>{signal.entry_price}</td>
                                            <td style={{ ...tableCellStyle, color: '#f44336' }}>{signal.stop_loss}</td>
                                            <td style={{ ...tableCellStyle, color: '#4CAF50' }}>{signal.take_profit}</td>
                                            <td style={{ ...tableCellStyle, fontWeight: 'bold', color: '#673AB7' }}>
                                                {signal.risk_reward}
                                            </td>
                                            <td style={tableCellStyle}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '12px',
                                                    fontWeight: 'bold',
                                                    backgroundColor: `${getOutcomeColor(signal.outcome)}20`,
                                                    color: getOutcomeColor(signal.outcome)
                                                }}>
                                                    {getOutcomeIcon(signal.outcome)} {(signal.outcome || 'pending').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={tableCellStyle}>
                                                {signal.close_price || '-'}
                                            </td>
                                            <td style={{
                                                ...tableCellStyle,
                                                fontWeight: 'bold',
                                                color: signal.pips_gained > 0 ? '#4CAF50' : signal.pips_gained < 0 ? '#f44336' : '#666'
                                            }}>
                                                {signal.pips_gained
                                                    ? `${signal.pips_gained > 0 ? '+' : ''}${signal.pips_gained.toFixed(1)}`
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Summary Stats */}
                {filteredSignals.length > 0 && (
                    <div style={{
                        backgroundColor: '#fff',
                        padding: '25px',
                        borderRadius: '12px',
                        marginTop: '20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>📈 Summary</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '15px'
                        }}>
                            <SummaryStat
                                label="Total Signals"
                                value={filteredSignals.length}
                                color="#2196F3"
                            />
                            <SummaryStat
                                label="Won"
                                value={filteredSignals.filter(s => s.outcome === 'win').length}
                                color="#4CAF50"
                            />
                            <SummaryStat
                                label="Lost"
                                value={filteredSignals.filter(s => s.outcome === 'loss').length}
                                color="#f44336"
                            />
                            <SummaryStat
                                label="Pending"
                                value={filteredSignals.filter(s => !s.outcome || s.outcome === 'pending').length}
                                color="#FF9800"
                            />
                            <SummaryStat
                                label="Total Pips"
                                value={filteredSignals.reduce((sum, s) => sum + (s.pips_gained || 0), 0).toFixed(1)}
                                color={filteredSignals.reduce((sum, s) => sum + (s.pips_gained || 0), 0) >= 0 ? '#4CAF50' : '#f44336'}
                                prefix={filteredSignals.reduce((sum, s) => sum + (s.pips_gained || 0), 0) > 0 ? '+' : ''}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryStat({ label, value, color, prefix = '' }) {
    return (
        <div style={{
            padding: '15px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            borderLeft: `4px solid ${color}`
        }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                {label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>
                {prefix}{value}
            </div>
        </div>
    );
}

const tableHeaderStyle = {
    padding: '12px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#666',
    whiteSpace: 'nowrap'
};

const tableCellStyle = {
    padding: '12px',
    fontSize: '14px',
    whiteSpace: 'nowrap'
};

export default SignalHistory;