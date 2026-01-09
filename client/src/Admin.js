// client/src/Admin.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

// SIMPLE ADMIN PASSWORD – CHANGE IF YOU WANT
const ADMIN_PASSWORD = 'admin123';

const ROOMS = [
    { id: 'general', label: '💬 General' },
    { id: 'forex', label: '💱 Forex' },
    { id: 'crypto', label: '₿ Crypto' },
    { id: 'stocks', label: '📈 Stocks' }
];

function Admin() {
    const navigate = useNavigate();

    const [passwordInput, setPasswordInput] = useState('');
    const [isAuthed, setIsAuthed] = useState(
        () => localStorage.getItem('isAdminAuthed') === 'true'
    );

    const [activeTab, setActiveTab] = useState('overview');

    // Data
    const [users, setUsers] = useState([]);
    const [messages, setMessages] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState('general');

    const [loadingUsers, setLoadingUsers] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [savingUserId, setSavingUserId] = useState(null);
    const [deletingMessageId, setDeletingMessageId] = useState(null);

    const [stats, setStats] = useState({
        totalUsers: 0,
        freeUsers: 0,
        proUsers: 0,
        premiumUsers: 0,
        totalMessages: 0
    });

    // --- AUTH ---

    const handleLogin = (e) => {
        e.preventDefault();
        if (passwordInput === ADMIN_PASSWORD) {
            setIsAuthed(true);
            localStorage.setItem('isAdminAuthed', 'true');
        } else {
            alert('Incorrect admin password');
        }
    };

    const handleLogout = () => {
        setIsAuthed(false);
        localStorage.removeItem('isAdminAuthed');
    };

    // --- DATA LOADERS ---

    const loadUsers = async () => {
        try {
            setLoadingUsers(true);
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading users:', error);
                alert('Failed to load users');
                return;
            }

            setUsers(data || []);

            // Stats
            const total = data?.length || 0;
            const free = data?.filter(u => u.subscription_tier === 'free').length || 0;
            const pro = data?.filter(u => u.subscription_tier === 'pro').length || 0;
            const premium = data?.filter(u => u.subscription_tier === 'premium').length || 0;

            setStats((prev) => ({
                ...prev,
                totalUsers: total,
                freeUsers: free,
                proUsers: pro,
                premiumUsers: premium
            }));
        } catch (err) {
            console.error('Unexpected error loading users:', err);
            alert('Unexpected error loading users');
        } finally {
            setLoadingUsers(false);
        }
    };

    const loadMessages = async (roomId = selectedRoom) => {
        try {
            setLoadingMessages(true);
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room', roomId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('Error loading messages:', error);
                alert('Failed to load messages');
                return;
            }

            setMessages(data || []);
        } catch (err) {
            console.error('Unexpected error loading messages:', err);
            alert('Unexpected error loading messages');
        } finally {
            setLoadingMessages(false);
        }
    };

    const loadTotalMessages = async () => {
        try {
            const { count, error } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true });

            if (!error && typeof count === 'number') {
                setStats((prev) => ({ ...prev, totalMessages: count }));
            }
        } catch (err) {
            console.error('Error loading total message count:', err);
        }
    };

    // initial load after auth
    useEffect(() => {
        if (isAuthed) {
            loadUsers();
            loadMessages(selectedRoom);
            loadTotalMessages();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed]);

    // reload messages when room changes
    useEffect(() => {
        if (isAuthed) {
            loadMessages(selectedRoom);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRoom]);

    // --- ACTIONS ---

    const handleTierChange = (userId, newTier) => {
        setUsers((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, subscription_tier: newTier } : u))
        );
    };

    useEffect(() => {
        const onDeleted = ({ messageId }) => {
            setMessages((prev) => prev.filter((m) => m.id !== messageId));
            setDeletingMessageId(null);
        };

        socket.on('message_deleted', onDeleted);

        return () => {
            socket.off('message_deleted', onDeleted);
        };
    }, []);


    const saveUserTier = async (user) => {
        try {
            setSavingUserId(user.id);
            const { data, error } = await supabase
                .from('users')
                .update({
                    subscription_tier: user.subscription_tier,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)
                .select()
                .single();

            if (error) {
                console.error('Error updating user tier:', error);
                alert('Failed to update user tier');
                return;
            }

            setUsers((prev) =>
                prev.map((u) => (u.id === user.id ? data : u))
            );
            alert(`Updated ${user.username} to ${data.subscription_tier.toUpperCase()}`);
        } catch (err) {
            console.error('Unexpected error updating user tier:', err);
            alert('Unexpected error updating user tier');
        } finally {
            setSavingUserId(null);
        }
    };

    const deleteMessage = async (msg) => {
        if (!window.confirm(`Delete message from ${msg.username}?`)) return;

        try {
            setDeletingMessageId(msg.id);

            // ✅ NEW: Just emit socket event - let server handle the deletion
            socket.emit('delete_message', {
                messageId: msg.id,
                username: 'admin'
            });

        } catch (err) {
            console.error('Unexpected error deleting message:', err);
            alert('Unexpected error deleting message');
            setDeletingMessageId(null);
        }
    };
    const clearRoomMessages = async (roomId) => {
        if (!window.confirm(`Delete ALL messages in the "${roomId}" room? This cannot be undone.`)) {
            return;
        }

        try {
            setLoadingMessages(true);
            const { error } = await supabase
                .from('messages')
                .delete()
                .eq('room', roomId);

            if (error) {
                console.error('Error clearing room messages:', error);
                alert('Failed to clear messages for this room');
                return;
            }

            // Emit socket event so chat users see the deletion in real-time
            socket.emit('clear_room_messages', { room: roomId });

            // Reload to see the change
            await loadMessages(roomId);
            await loadTotalMessages();
        } catch (err) {
            console.error('Unexpected error clearing room messages:', err);
            alert('Unexpected error clearing room messages');
        } finally {
            setLoadingMessages(false);
        }
    };

    const deleteUserMessages = async (username, roomId) => {
        if (!window.confirm(`Delete ALL messages from "${username}" in "${roomId}"?`)) {
            return;
        }

        try {
            setLoadingMessages(true);
            const { error } = await supabase
                .from('messages')
                .delete()
                .eq('username', username)
                .eq('room', roomId);

            if (error) {
                console.error('Error deleting user messages:', error);
                alert('Failed to delete user messages');
                return;
            }

            // Emit socket event so chat users see the deletion in real-time
            socket.emit('delete_user_messages', { username, room: roomId });

            // Reload to see the change
            await loadMessages(roomId);
            await loadTotalMessages();
        } catch (err) {
            console.error('Unexpected error deleting user messages:', err);
            alert('Unexpected error deleting user messages');
        } finally {
            setLoadingMessages(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    // --- RENDER HELPERS ---

    if (!isAuthed) {
        return (
            <div
                style={{
                    maxWidth: '400px',
                    margin: '60px auto',
                    padding: '24px',
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
            >
                <h2 style={{ textAlign: 'center', marginBottom: '16px' }}>Admin Login</h2>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                    Enter the admin password to access the Trader Chat dashboard.
                </p>
                <form onSubmit={handleLogin}>
                    <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Admin password"
                        style={{
                            width: '100%',
                            padding: '10px',
                            marginBottom: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '14px',
                            boxSizing: 'border-box'
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: '#4CAF50',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Enter Dashboard
                    </button>
                </form>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        marginTop: '12px',
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#f0f0f0',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    ⬅ Back to Chat
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                maxWidth: '1100px',
                margin: '20px auto',
                padding: '20px',
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    alignItems: 'center'
                }}
            >
                <div>
                    <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
                    <p style={{ margin: '4px 0', color: '#666' }}>
                        Manage users, subscriptions & messages for Trader Chat.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        ⬅ Back to Chat
                    </button>
                    <button
                        onClick={handleLogout}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#f44336',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Log Out
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px'
                }}
            >
                <TabButton
                    label="Overview"
                    active={activeTab === 'overview'}
                    onClick={() => setActiveTab('overview')}
                />
                <TabButton
                    label="Users"
                    active={activeTab === 'users'}
                    onClick={() => {
                        setActiveTab('users');
                        loadUsers();
                    }}
                />
                <TabButton
                    label="Messages"
                    active={activeTab === 'messages'}
                    onClick={() => {
                        setActiveTab('messages');
                        loadMessages(selectedRoom);
                    }}
                />
            </div>

            {/* Content */}
            {activeTab === 'overview' && (
                <OverviewTab stats={stats} loadingUsers={loadingUsers} />
            )}
            {activeTab === 'users' && (
                <UsersTab
                    users={users}
                    loading={loadingUsers}
                    savingUserId={savingUserId}
                    onTierChange={handleTierChange}
                    onSaveTier={saveUserTier}
                />
            )}
            {activeTab === 'messages' && (
                <MessagesTab
                    messages={messages}
                    loading={loadingMessages}
                    selectedRoom={selectedRoom}
                    onRoomChange={setSelectedRoom}
                    onDelete={deleteMessage}
                    onDeleteUserMessages={deleteUserMessages}
                    onClearRoom={clearRoomMessages}
                    deletingMessageId={deletingMessageId}
                    formatTime={formatTime}
                />
            )}
        </div>
    );
}

// --- Small Presentational Components ---

function TabButton({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '10px 18px',
                borderRadius: '999px',
                border: active ? 'none' : '1px solid #ddd',
                backgroundColor: active ? '#2196F3' : '#fff',
                color: active ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: active ? 'bold' : 'normal',
                fontSize: '14px'
            }}
        >
            {label}
        </button>
    );
}

function OverviewTab({ stats, loadingUsers }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px'
            }}
        >
            <StatCard
                label="Total Users"
                value={loadingUsers ? '...' : stats.totalUsers}
            />
            <StatCard label="Free Users" value={stats.freeUsers} />
            <StatCard label="Pro Users" value={stats.proUsers} />
            <StatCard label="Premium Users" value={stats.premiumUsers} />
            <StatCard label="Total Messages" value={stats.totalMessages} />
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <div
            style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
            }}
        >
            <div style={{ fontSize: '13px', color: '#777', marginBottom: '8px' }}>
                {label}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{value}</div>
        </div>
    );
}

function UsersTab({
    users,
    loading,
    savingUserId,
    onTierChange,
    onSaveTier
}) {
    if (loading) {
        return <div>Loading users…</div>;
    }

    if (!users.length) {
        return <div>No users found.</div>;
    }

    const tierOptions = [
        { value: 'free', label: 'Free' },
        { value: 'pro', label: 'Pro' },
        { value: 'premium', label: 'Premium' }
    ];

    return (
        <div
            style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
            }}
        >
            <table
                style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '14px'
                }}
            >
                <thead>
                    <tr>
                        <th style={thStyle}>Username</th>
                        <th style={thStyle}>Tier</th>
                        <th style={thStyle}>Created</th>
                        <th style={thStyle}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id}>
                            <td style={tdStyle}>{u.username}</td>
                            <td style={tdStyle}>
                                <select
                                    value={u.subscription_tier || 'free'}
                                    onChange={(e) => onTierChange(u.id, e.target.value)}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #ddd'
                                    }}
                                >
                                    {tierOptions.map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            <td style={tdStyle}>
                                {u.created_at
                                    ? new Date(u.created_at).toLocaleString()
                                    : '—'}
                            </td>
                            <td style={tdStyle}>
                                <button
                                    onClick={() => onSaveTier(u)}
                                    disabled={savingUserId === u.id}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#4CAF50',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    {savingUserId === u.id ? 'Saving…' : 'Save'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function MessagesTab({
    messages,
    loading,
    selectedRoom,
    onRoomChange,
    onDelete,
    onDeleteUserMessages,
    onClearRoom,
    deletingMessageId,
    formatTime
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // all | text | signal

    const filteredMessages = messages.filter((m) => {
        // type filter
        if (typeFilter === 'text' && m.type === 'signal') return false;
        if (typeFilter === 'signal' && m.type !== 'signal') return false;

        if (!searchTerm.trim()) return true;

        const q = searchTerm.toLowerCase();
        const text = (m.text || '').toLowerCase();
        const user = (m.username || '').toLowerCase();
        const pair = (m.signal?.pair || '').toLowerCase();

        return (
            text.includes(q) ||
            user.includes(q) ||
            pair.includes(q)
        );
    });

    return (
        <div>
            {/* Top controls: search, filters, room selector, bulk actions */}
            <div
                style={{
                    marginBottom: '12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center'
                }}
            >
                <input
                    type="text"
                    placeholder="Search by user, text, or pair…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        flex: '1 1 220px',
                        minWidth: '180px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #ddd',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                    }}
                />

                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #ddd',
                        fontSize: '14px'
                    }}
                >
                    <option value="all">All types</option>
                    <option value="text">Text only</option>
                    <option value="signal">Signals only</option>
                </select>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap'
                    }}
                >
                    <span style={{ fontSize: '14px' }}>Room:</span>
                    <select
                        value={selectedRoom}
                        onChange={(e) => onRoomChange(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '14px'
                        }}
                    >
                        {ROOMS.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={() => onClearRoom(selectedRoom)}
                    style={{
                        marginLeft: 'auto',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#f44336',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                    }}
                >
                    Clear Room
                </button>

                <span
                    style={{
                        fontSize: '12px',
                        color: '#666',
                        marginLeft: 'auto'
                    }}
                >
                    Showing {filteredMessages.length} / {messages.length} loaded
                </span>
            </div>

            {/* Content */}
            {loading ? (
                <div>Loading messages…</div>
            ) : !messages.length ? (
                <div>No messages found for this room.</div>
            ) : (
                <div
                    style={{
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        padding: '16px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                    }}
                >
                    {filteredMessages.map((m) => (
                        <div
                            key={m.id}
                            style={{
                                borderBottom: '1px solid #eee',
                                padding: '10px 0',
                                display: 'flex',
                                gap: '10px'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '4px'
                                    }}
                                >
                                    <strong>{m.username}</strong>
                                    <span style={{ fontSize: '12px', color: '#666' }}>
                                        {formatTime(m.timestamp || m.created_at)}
                                    </span>
                                </div>

                                {m.type === 'signal' ? (
                                    <div style={{ fontSize: '13px' }}>
                                        <div>
                                            <strong>Signal:</strong> {m.signal?.direction}{' '}
                                            {m.signal?.pair}
                                        </div>
                                        <div>
                                            <strong>Entry:</strong> {m.signal?.entry} ·{' '}
                                            <strong>SL:</strong> {m.signal?.stopLoss} ·{' '}
                                            <strong>TP:</strong> {m.signal?.takeProfit}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '14px' }}>{m.text}</div>
                                )}
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}
                            >
                                <button
                                    onClick={() => onDelete(m)}
                                    disabled={deletingMessageId === m.id}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#f44336',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    {deletingMessageId === m.id ? 'Deleting…' : 'Delete'}
                                </button>

                                <button
                                    onClick={() => onDeleteUserMessages(m.username, selectedRoom)}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#795548',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    All from user
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const thStyle = {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '1px solid #eee',
    fontSize: '13px',
    color: '#666'
};

const tdStyle = {
    padding: '8px',
    borderBottom: '1px solid #f3f3f3',
    fontSize: '14px'
};

export default Admin;