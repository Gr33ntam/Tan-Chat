import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer } from 'recharts';

const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

const COLORS = ['#4CAF50', '#f44336', '#FF9800'];

function Analytics() {
    const navigate = useNavigate();
    const username = localStorage.getItem('username');

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalSignals: 0,
        won: 0,
        lost: 0,
        pending: 0,
        winRate: 0,
        totalPips: 0,
        bestPair: '-',
        worstPair: '-',
        currentStreak: 0,
        streakType: 'none'
    });
    const [signals, setSignals] = useState([]);
    const [timelineData, setTimelineData] = useState([]);
    const [pairPerformance, setPairPerformance] = useState([]);
    const [dateFilter, setDateFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const calculatePips = (direction, entry, closePrice) => {
        if (!entry || !closePrice) return 0;
        const pips = direction === 'BUY'
            ? (closePrice - entry)
            : (entry - closePrice);
        return pips * 10000;
    };

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            let dateFilterObj = null;
            if (dateFilter === 'week') {
                dateFilterObj = new Date();
                dateFilterObj.setDate(dateFilterObj.getDate() - 7);
            } else if (dateFilter === 'month') {
                dateFilterObj = new Date();
                dateFilterObj.setMonth(dateFilterObj.getMonth() - 1);
            }

            let query = supabase
                .from('messages')
                .select('*')
                .eq('username', username)
                .eq('is_official', true)
                .eq('type', 'signal')
                .order('created_at', { ascending: true });

            if (dateFilterObj) {
                query = query.gte('created_at', dateFilterObj.toISOString());
            }

            const { data: messages, error: messagesError } = await query;

            if (messagesError) {
                console.error('Error loading signals:', messagesError);
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

            let won = 0, lost = 0, pending = 0;
            let totalPips = 0;
            const pairStats = {};
            const processedSignals = [];
            let cumulativePips = 0;
            const timeline = [];

            messages.forEach(msg => {
                const meta = metadataMap[msg.id];
                const pair = msg.signal.pair;

                let outcome = 'pending';
                let pips = 0;

                if (meta) {
                    outcome = meta.outcome;
                    if (outcome === 'win' || outcome === 'loss') {
                        pips = calculatePips(
                            msg.signal.direction,
                            msg.signal.entry,
                            meta.close_price
                        );
                        totalPips += pips;
                        cumulativePips += pips;

                        if (!pairStats[pair]) {
                            pairStats[pair] = { won: 0, lost: 0, pips: 0 };
                        }
                        if (outcome === 'win') {
                            won++;
                            pairStats[pair].won++;
                        } else {
                            lost++;
                            pairStats[pair].lost++;
                        }
                        pairStats[pair].pips += pips;

                        timeline.push({
                            date: new Date(meta.closed_at || msg.created_at).toLocaleDateString(),
                            pips: parseFloat(cumulativePips.toFixed(1)),
                            outcome
                        });
                    } else {
                        pending++;
                    }
                }

                processedSignals.push({
                    ...msg,
                    metadata: meta,
                    outcome,
                    pips
                });
            });

            const pairArray = Object.entries(pairStats).map(([pair, data]) => ({
                pair,
                ...data,
                winRate: data.won + data.lost > 0
                    ? ((data.won / (data.won + data.lost)) * 100).toFixed(1)
                    : 0
            }));

            const bestPair = pairArray.sort((a, b) => b.pips - a.pips)[0];
            const worstPair = pairArray.sort((a, b) => a.pips - b.pips)[0];

            let currentStreak = 0;
            let streakType = 'none';
            const completedSignals = processedSignals.filter(s => s.outcome !== 'pending').reverse();

            if (completedSignals.length > 0) {
                const lastOutcome = completedSignals[0].outcome;
                streakType = lastOutcome;

                for (const signal of completedSignals) {
                    if (signal.outcome === lastOutcome) {
                        currentStreak++;
                    } else {
                        break;
                    }
                }
            }

            setStats({
                totalSignals: messages.length,
                won,
                lost,
                pending,
                winRate: won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : 0,
                totalPips: totalPips.toFixed(1),
                bestPair: bestPair ? `${bestPair.pair} (+${bestPair.pips.toFixed(1)})` : '-',
                worstPair: worstPair ? `${worstPair.pair} (${worstPair.pips.toFixed(1)})` : '-',
                currentStreak,
                streakType
            });

            setSignals(processedSignals);
            setTimelineData(timeline);
            setPairPerformance(pairArray.slice(0, 10));

        } catch (err) {
            console.error('Error loading analytics:', err);
        }
        setLoading(false);
    }, [username, dateFilter]);

    useEffect(() => {
        if (!username) {
            navigate('/');
            return;
        }
        loadAnalytics();
    }, [username, loadAnalytics, navigate]);

    const exportToCSV = () => {
        const filteredSignals = getFilteredSignals();

        const csvContent = [
            ['Date', 'Pair', 'Direction', 'Entry', 'Stop Loss', 'Take Profit', 'Outcome', 'Close Price', 'Pips'].join(','),
            ...filteredSignals.map(signal => [
                new Date(signal.created_at).toLocaleDateString(),
                signal.signal.pair,
                signal.signal.direction,
                signal.signal.entry,
                signal.signal.stopLoss,
                signal.signal.takeProfit,
                signal.outcome,
                signal.metadata?.close_price || '-',
                signal.pips.toFixed(1)
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${username}_trading_history_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const getFilteredSignals = () => {
        return signals.filter(signal => {
            if (outcomeFilter !== 'all' && signal.outcome !== outcomeFilter) {
                return false;
            }
            return true;
        });
    };

    const pieData = [
        { name: 'Won', value: stats.won },
        { name: 'Lost', value: stats.lost },
        { name: 'Pending', value: stats.pending }
    ].filter(d => d.value > 0);

    const filteredSignals = getFilteredSignals();

    if (!username) {
        return null;
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f5f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '20px'
        }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
                            📊 Trading Analytics
                        </h1>
                        <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '16px' }}>
                            Performance dashboard for <strong>{username}</strong>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
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
                                backgroundColor: '#4CAF50',
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

                <div style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    display: 'flex',
                    gap: '15px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
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
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
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
                            <option value="month">Last 30 Days</option>
                            <option value="week">Last 7 Days</option>
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
                            Filter History:
                        </label>
                        <select
                            value={outcomeFilter}
                            onChange={(e) => setOutcomeFilter(e.target.value)}
                            style={{
                                padding: '10px',
                                border: '2px solid #ddd',
                                borderRadius: '8px',
                                fontSize: '14px',
                                cursor: 'pointer',
                                minWidth: '150px'
                            }}
                        >
                            <option value="all">All Outcomes</option>
                            <option value="win">Wins Only</option>
                            <option value="loss">Losses Only</option>
                            <option value="pending">Pending Only</option>
                        </select>
                    </div>

                    <button
                        onClick={exportToCSV}
                        disabled={filteredSignals.length === 0}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: filteredSignals.length > 0 ? '#FF9800' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: filteredSignals.length > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            marginTop: '20px'
                        }}
                    >
                        📥 Export to CSV
                    </button>
                </div>

                {loading ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px',
                        color: '#999',
                        fontSize: '18px',
                        backgroundColor: '#fff',
                        borderRadius: '12px'
                    }}>
                        Loading analytics...
                    </div>
                ) : signals.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px',
                        color: '#999',
                        fontSize: '18px',
                        backgroundColor: '#fff',
                        borderRadius: '12px'
                    }}>
                        No signals found. Start posting official signals to see your analytics! 📊
                    </div>
                ) : (
                    <>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '15px',
                            marginBottom: '20px'
                        }}>
                            <StatCard label="Total Signals" value={stats.totalSignals} icon="📊" color="#2196F3" />
                            <StatCard label="Win Rate" value={`${stats.winRate}%`} icon="🎯" color={parseFloat(stats.winRate) >= 60 ? '#4CAF50' : parseFloat(stats.winRate) >= 40 ? '#FF9800' : '#f44336'} />
                            <StatCard label="Total Pips" value={parseFloat(stats.totalPips) > 0 ? `+${stats.totalPips}` : stats.totalPips} icon="💰" color={parseFloat(stats.totalPips) >= 0 ? '#4CAF50' : '#f44336'} />
                            <StatCard label="Won" value={stats.won} icon="✅" color="#4CAF50" />
                            <StatCard label="Lost" value={stats.lost} icon="❌" color="#f44336" />
                            <StatCard label="Pending" value={stats.pending} icon="🟡" color="#FF9800" />
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: '15px',
                            marginBottom: '20px'
                        }}>
                            <InfoCard label="Best Performing Pair" value={stats.bestPair} icon="🏆" color="#4CAF50" />
                            <InfoCard label="Worst Performing Pair" value={stats.worstPair} icon="📉" color="#f44336" />
                            <InfoCard label="Current Streak" value={stats.currentStreak > 0 ? `${stats.currentStreak} ${stats.streakType === 'win' ? '🔥 Wins' : '❄️ Losses'}` : 'No active streak'} icon={stats.streakType === 'win' ? '🔥' : '❄️'} color={stats.streakType === 'win' ? '#4CAF50' : '#f44336'} />
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                            gap: '20px',
                            marginBottom: '20px'
                        }}>
                            {timelineData.length > 0 && (
                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '20px',
                                    borderRadius: '12px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}>
                                    <h3 style={{ margin: '0 0 20px 0' }}>📈 Cumulative Pips Over Time</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={timelineData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="date" />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend />
                                            <Line type="monotone" dataKey="pips" stroke="#2196F3" strokeWidth={2} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {pieData.length > 0 && (
                                <div style={{
                                    backgroundColor: '#fff',
                                    padding: '20px',
                                    borderRadius: '12px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}>
                                    <h3 style={{ margin: '0 0 20px 0' }}>🥧 Win/Loss Distribution</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {pairPerformance.length > 0 && (
                            <div style={{
                                backgroundColor: '#fff',
                                padding: '20px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                                <h3 style={{ margin: '0 0 20px 0' }}>📊 Performance by Pair (Top 10)</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={pairPerformance}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="pair" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="pips" fill="#2196F3" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        <div style={{
                            backgroundColor: '#fff',
                            borderRadius: '12px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '20px', borderBottom: '2px solid #f0f0f0' }}>
                                <h3 style={{ margin: 0 }}>📋 Trade History ({filteredSignals.length})</h3>
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f5f5f5', zIndex: 1 }}>
                                        <tr>
                                            <th style={tableHeaderStyle}>Date</th>
                                            <th style={tableHeaderStyle}>Pair</th>
                                            <th style={tableHeaderStyle}>Direction</th>
                                            <th style={tableHeaderStyle}>Entry</th>
                                            <th style={tableHeaderStyle}>SL</th>
                                            <th style={tableHeaderStyle}>TP</th>
                                            <th style={tableHeaderStyle}>Outcome</th>
                                            <th style={tableHeaderStyle}>Close</th>
                                            <th style={tableHeaderStyle}>Pips</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSignals.reverse().map((signal, index) => (
                                            <tr key={signal.id} style={{
                                                borderBottom: '1px solid #eee',
                                                backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa'
                                            }}>
                                                <td style={tableCellStyle}>{new Date(signal.created_at).toLocaleDateString()}</td>
                                                <td style={tableCellStyle}><strong>{signal.signal.pair}</strong></td>
                                                <td style={{
                                                    ...tableCellStyle,
                                                    color: signal.signal.direction === 'BUY' ? '#4CAF50' : '#f44336',
                                                    fontWeight: 'bold'
                                                }}>{signal.signal.direction}</td>
                                                <td style={tableCellStyle}>{signal.signal.entry}</td>
                                                <td style={tableCellStyle}>{signal.signal.stopLoss}</td>
                                                <td style={tableCellStyle}>{signal.signal.takeProfit}</td>
                                                <td style={tableCellStyle}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold',
                                                        backgroundColor: signal.outcome === 'win' ? '#4CAF50' :
                                                            signal.outcome === 'loss' ? '#f44336' : '#FF9800',
                                                        color: 'white'
                                                    }}>
                                                        {signal.outcome === 'win' ? '✅ Win' :
                                                            signal.outcome === 'loss' ? '❌ Loss' : '🟡 Pending'}
                                                    </span>
                                                </td>
                                                <td style={tableCellStyle}>{signal.metadata?.close_price || '-'}</td>
                                                <td style={{
                                                    ...tableCellStyle,
                                                    color: signal.pips >= 0 ? '#4CAF50' : '#f44336',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {signal.outcome !== 'pending'
                                                        ? `${signal.pips > 0 ? '+' : ''}${signal.pips.toFixed(1)}`
                                                        : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
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
            borderLeft: `4px solid ${color}`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <p style={{ margin: 0, color: '#999', fontSize: '14px' }}>{label}</p>
                    <h2 style={{ margin: '8px 0 0 0', color: color, fontSize: '32px' }}>{value}</h2>
                </div>
                <div style={{ fontSize: '40px' }}>{icon}</div>
            </div>
        </div>
    );
}

function InfoCard({ label, value, icon, color }) {
    return (
        <div style={{
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderTop: `4px solid ${color}`
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '32px' }}>{icon}</div>
                <div>
                    <p style={{ margin: 0, color: '#999', fontSize: '13px' }}>{label}</p>
                    <h3 style={{ margin: '5px 0 0 0', color: '#333', fontSize: '18px' }}>{value}</h3>
                </div>
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
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '2px solid #ddd'
};

const tableCellStyle = {
    padding: '12px',
    fontSize: '14px'
};

export default Analytics;