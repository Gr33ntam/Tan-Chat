import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

// Available PUBLIC rooms with tier requirements
const PUBLIC_ROOMS = [
  { id: 'general', name: '💬 General', color: '#2196F3', requiredTier: 'free', isPrivate: false },
  { id: 'forex', name: '💱 Forex', color: '#4CAF50', requiredTier: 'pro', isPrivate: false },
  { id: 'crypto', name: '₿ Crypto', color: '#FF9800', requiredTier: 'pro', isPrivate: false },
  { id: 'stocks', name: '📈 Stocks', color: '#9C27B0', requiredTier: 'premium', isPrivate: false }
];

// Subscription tiers
const TIERS = {
  free: { name: 'Free', price: '$0', rooms: ['General'] },
  pro: { name: 'Pro', price: '$9.99/mo', rooms: ['General', 'Forex', 'Crypto'] },
  premium: { name: 'Premium', price: '$19.99/mo', rooms: ['General', 'Forex', 'Crypto', 'Stocks'] }
};

function Chat({ onUsernameSet }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [joined, setJoined] = useState(!!localStorage.getItem('username'));
  const [showSignalForm, setShowSignalForm] = useState(false);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [userTier, setUserTier] = useState('free');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState(null);
  const [isOfficialPost, setIsOfficialPost] = useState(false);
  const [privateRooms, setPrivateRooms] = useState([]);
  const [showPrivateRoomModal, setShowPrivateRoomModal] = useState(false);
  const messagesEndRef = useRef(null);

  // Signal form state
  const [signalData, setSignalData] = useState({
    pair: '',
    direction: 'BUY',
    entry: '',
    stopLoss: '',
    takeProfit: ''
  });

  // Private room form state
  const [newRoomData, setNewRoomData] = useState({
    name: '',
    description: ''
  });

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadPrivateRooms = () => {
    if (username) {
      socket.emit('get_my_rooms', { username });
    }
  };

  // Register user and get tier
  useEffect(() => {
    if (joined && username) {
      socket.emit('register_user', username);
      loadPrivateRooms();
      if (onUsernameSet) {
        onUsernameSet(username);
      }
    }
  }, [joined, username, onUsernameSet]);

  // Socket listeners
  useEffect(() => {
    socket.on('user_registered', (data) => {
      setUserTier(data.tier);
      console.log('User registered:', data);
    });

    socket.on('previous_messages', (msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('message_deleted', (data) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
    });

    socket.on('room_locked', (data) => {
      alert(`🔒 ${data.message}\n\nUpgrade to unlock this room!`);
      setShowUpgradeModal(true);
      setSelectedUpgradeTier(data.requiredTier);
    });

    socket.on('upgrade_success', (data) => {
      setUserTier(data.tier);
      alert(`🎉 Upgraded to ${data.tier.toUpperCase()}!\n\nYou now have access to more rooms!`);
      setShowUpgradeModal(false);
    });

    socket.on('upgrade_error', (message) => {
      alert('❌ Upgrade failed. Please try again.');
    });

    socket.on('room_created', (data) => {
      alert('✅ Private room created successfully!');
      loadPrivateRooms();
      setShowPrivateRoomModal(false);
      setNewRoomData({ name: '', description: '' });
    });

    socket.on('room_error', (data) => {
      alert(`❌ ${data.message}`);
    });

    socket.on('my_rooms', (data) => {
      setPrivateRooms(data.rooms || []);
    });

    return () => {
      socket.off('user_registered');
      socket.off('previous_messages');
      socket.off('new_message');
      socket.off('message_deleted');
      socket.off('room_locked');
      socket.off('upgrade_success');
      socket.off('upgrade_error');
      socket.off('room_created');
      socket.off('room_error');
      socket.off('my_rooms');
    };
  }, [username]);

  // Join room when component mounts or room changes
  useEffect(() => {
    if (joined && username) {
      socket.emit('join_room', { room: currentRoom, username });
    }
  }, [currentRoom, joined, username]);

  const canCreateOfficialPost = () => {
    return userTier === 'premium';
  };

  const canCreateSignal = () => {
    return userTier === 'pro' || userTier === 'premium';
  };

  const canCreatePrivateRoom = () => {
    return userTier === 'premium';
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setJoined(false);
    setUserTier('free');
    setMessages([]);
    setPrivateRooms([]);
  };

  const deleteMessage = (messageId) => {
    socket.emit('delete_message', { messageId, username, room: currentRoom });
  };

  const sendMessage = () => {
    if (input.trim()) {
      socket.emit('send_message', {
        type: 'text',
        username,
        text: input,
        room: currentRoom,
        timestamp: new Date().toISOString(),
        is_official: false,
        post_type: 'comment'
      });
      setInput('');
    }
  };

  const calculateRR = () => {
    const entry = parseFloat(signalData.entry);
    const sl = parseFloat(signalData.stopLoss);
    const tp = parseFloat(signalData.takeProfit);

    if (!entry || !sl || !tp) return '0.00';

    if (signalData.direction === 'BUY') {
      const risk = entry - sl;
      const reward = tp - entry;
      return (reward / risk).toFixed(2);
    } else {
      const risk = sl - entry;
      const reward = entry - tp;
      return (reward / risk).toFixed(2);
    }
  };

  const sendSignal = () => {
    if (signalData.pair && signalData.entry && signalData.stopLoss && signalData.takeProfit) {
      socket.emit('send_message', {
        type: 'signal',
        username,
        room: currentRoom,
        signal: {
          pair: signalData.pair,
          direction: signalData.direction,
          entry: parseFloat(signalData.entry),
          stopLoss: parseFloat(signalData.stopLoss),
          takeProfit: parseFloat(signalData.takeProfit),
          riskReward: calculateRR()
        },
        timestamp: new Date().toISOString(),
        is_official: isOfficialPost,
        post_type: isOfficialPost ? 'official_signal' : 'comment'
      });

      setSignalData({
        pair: '',
        direction: 'BUY',
        entry: '',
        stopLoss: '',
        takeProfit: ''
      });
      setShowSignalForm(false);
      setIsOfficialPost(false);
    }
  };

  const createPrivateRoom = () => {
    if (newRoomData.name.trim()) {
      socket.emit('create_private_room', {
        username,
        roomName: newRoomData.name,
        description: newRoomData.description
      });
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const switchRoom = (roomId) => {
    setCurrentRoom(roomId);
    setMessages([]);
  };

  const hasAccessToRoom = (room) => {
    const tierHierarchy = { free: 0, pro: 1, premium: 2 };
    const userLevel = tierHierarchy[userTier] || 0;
    const requiredLevel = tierHierarchy[room.requiredTier] || 0;
    return userLevel >= requiredLevel;
  };

  const handleUpgrade = (tier) => {
    socket.emit('upgrade_subscription', { username, tier });
  };

  if (!joined) {
    return (
      <div style={{
        padding: '20px',
        maxWidth: '400px',
        margin: '50px auto',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>
          Welcome to Trader Chat
        </h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && username) {
              localStorage.setItem('username', username);
              setJoined(true);
            }
          }}
          placeholder="Enter your username"
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '12px',
            fontSize: '16px',
            border: '2px solid #ddd',
            borderRadius: '8px',
            boxSizing: 'border-box'
          }}
        />
        <button
          onClick={() => {
            if (username) {
              localStorage.setItem('username', username);
              setJoined(true);
            }
          }}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}
        >
          Join Chat
        </button>
      </div>
    );
  }

  const allRooms = [
    ...PUBLIC_ROOMS,
    ...privateRooms.map(pr => ({
      id: pr.private_rooms.room_id,
      name: `🔒 ${pr.private_rooms.name}`,
      color: '#673AB7',
      requiredTier: 'premium',
      isPrivate: true
    }))
  ];

  const currentRoomInfo = allRooms.find(r => r.id === currentRoom) || PUBLIC_ROOMS[0];

  return (
    <div style={{
      padding: '20px',
      maxWidth: '900px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#333' }}>Trader Chat</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            <strong>{username}</strong> · {userTier === 'free' ? '🆓 Free' : userTier === 'pro' ? '💎 Pro' : '👑 Premium'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canCreatePrivateRoom() && (
            <button
              onClick={() => setShowPrivateRoomModal(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#673AB7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              ➕ New Room
            </button>
          )}
          <button
            onClick={() => window.location.href = '/account'}
            style={{
              padding: '8px 16px',
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
            onClick={() => setShowUpgradeModal(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: userTier === 'premium' ? '#ccc' : '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: userTier === 'premium' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
            disabled={userTier === 'premium'}
          >
            {userTier === 'premium' ? '✓ Premium' : '⬆️ Upgrade'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Room Selector */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '15px',
        flexWrap: 'wrap'
      }}>
        {allRooms.map(room => {
          const hasAccess = room.isPrivate ? true : hasAccessToRoom(room);
          return (
            <button
              key={room.id}
              onClick={() => hasAccess ? switchRoom(room.id) : setShowUpgradeModal(true)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: currentRoom === room.id ? room.color : '#fff',
                color: currentRoom === room.id ? '#fff' : hasAccess ? '#333' : '#999',
                border: `2px solid ${room.color}`,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: hasAccess ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                minWidth: '120px',
                opacity: hasAccess ? 1 : 0.5,
                position: 'relative'
              }}
            >
              {room.name} {!hasAccess && '🔒'}
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div style={{
        border: `2px solid ${currentRoomInfo.color}`,
        height: '450px',
        overflowY: 'auto',
        marginBottom: '15px',
        padding: '15px',
        backgroundColor: '#f5f5f5',
        borderRadius: '12px',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#999',
            marginTop: '150px',
            fontSize: '16px'
          }}>
            No messages in {currentRoomInfo.name} yet. Start the conversation! 💬
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '15px' }}>
            {msg.type === 'text' ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '12px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ color: currentRoomInfo.color }}>{msg.username}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#999' }}>
                      {formatTime(msg.timestamp)}
                    </span>
                    {msg.username === username && (
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ color: '#333' }}>{msg.text}</div>
              </div>
            ) : (
              <SignalCard
                signal={msg.signal}
                username={msg.username}
                timestamp={msg.timestamp}
                formatTime={formatTime}
                isOfficial={msg.is_official}
                canDelete={msg.username === username}
                onDelete={() => deleteMessage(msg.id)}
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Signal Form */}
      {showSignalForm && (
        <div style={{
          border: '2px solid #2196F3',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '15px',
          backgroundColor: '#E3F2FD',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, color: '#1976D2' }}>📊 Post Trading Signal</h3>

          {canCreateOfficialPost() && (
            <div style={{
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: isOfficialPost ? '#FF9800' : '#fff',
              borderRadius: '8px',
              border: '2px solid #FF9800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => setIsOfficialPost(!isOfficialPost)}
            >
              <span style={{ fontWeight: 'bold', color: isOfficialPost ? '#fff' : '#333' }}>
                ⭐ Mark as Official Signal (Premium Only)
              </span>
              <input
                type="checkbox"
                checked={isOfficialPost}
                onChange={() => setIsOfficialPost(!isOfficialPost)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </div>
          )}

          <input
            placeholder="Pair (e.g. XAUUSD, BTCUSDT)"
            value={signalData.pair}
            onChange={(e) => setSignalData({ ...signalData, pair: e.target.value.toUpperCase() })}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />

          <select
            value={signalData.direction}
            onChange={(e) => setSignalData({ ...signalData, direction: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="BUY">BUY (Long)</option>
            <option value="SELL">SELL (Short)</option>
          </select>

          <input
            placeholder="Entry Price"
            type="number"
            step="0.01"
            value={signalData.entry}
            onChange={(e) => setSignalData({ ...signalData, entry: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />

          <input
            placeholder="Stop Loss"
            type="number"
            step="0.01"
            value={signalData.stopLoss}
            onChange={(e) => setSignalData({ ...signalData, stopLoss: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />

          <input
            placeholder="Take Profit"
            type="number"
            step="0.01"
            value={signalData.takeProfit}
            onChange={(e) => setSignalData({ ...signalData, takeProfit: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '12px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />

          <p style={{
            fontWeight: 'bold',
            color: '#4CAF50',
            fontSize: '18px',
            marginBottom: '15px'
          }}>
            Risk:Reward Ratio: {calculateRR()}
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={sendSignal}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              Post Signal
            </button>

            <button
              onClick={() => setShowSignalForm(false)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '10px'
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={`Message ${currentRoomInfo.name}...`}
          style={{
            flex: 1,
            padding: '12px',
            border: `2px solid ${currentRoomInfo.color}`,
            borderRadius: '8px',
            fontSize: '15px'
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '12px 24px',
            backgroundColor: currentRoomInfo.color,
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          Send
        </button>
      </div>

      {/* Post Signal Button */}
      {canCreateSignal() && (
        <button
          onClick={() => setShowSignalForm(!showSignalForm)}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
          }}
        >
          📊 {showSignalForm ? 'Hide Signal Form' : 'Post Trading Signal'}
        </button>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          currentTier={userTier}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
          suggestedTier={selectedUpgradeTier}
        />
      )}

      {/* Create Private Room Modal */}
      {showPrivateRoomModal && (
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
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>🔒 Create Private Room</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Premium feature - Create your own private trading room
            </p>

            <input
              placeholder="Room Name"
              value={newRoomData.name}
              onChange={(e) => setNewRoomData({ ...newRoomData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />

            <textarea
              placeholder="Description (optional)"
              value={newRoomData.description}
              onChange={(e) => setNewRoomData({ ...newRoomData, description: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '20px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                minHeight: '80px',
                resize: 'vertical'
              }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={createPrivateRoom}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#673AB7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                Create Room
              </button>
              <button
                onClick={() => {
                  setShowPrivateRoomModal(false);
                  setNewRoomData({ name: '', description: '' });
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f0f0f0',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Upgrade Modal Component
function UpgradeModal({ currentTier, onClose, onUpgrade, suggestedTier }) {
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
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>🚀 Manage Your Plan</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Upgrade or downgrade your subscription
        </p>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {Object.entries(TIERS).map(([tier, info]) => {
            const isCurrent = tier === currentTier;
            const isSuggested = tier === suggestedTier;

            return (
              <div key={tier} style={{
                flex: 1,
                minWidth: '150px',
                border: isSuggested ? '3px solid #FF9800' : '2px solid #ddd',
                borderRadius: '12px',
                padding: '20px',
                backgroundColor: isCurrent ? '#f0f0f0' : '#fff',
                position: 'relative'
              }}>
                {isSuggested && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '10px',
                    backgroundColor: '#FF9800',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    Recommended
                  </div>
                )}

                <h3 style={{ marginTop: 0, textAlign: 'center' }}>
                  {tier === 'free' ? '🆓' : tier === 'pro' ? '💎' : '👑'} {info.name}
                </h3>
                <p style={{
                  textAlign: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  margin: '10px 0',
                  color: '#333'
                }}>
                  {info.price}
                </p>

                <div style={{ marginTop: '15px' }}>
                  <strong>Access to:</strong>
                  <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
                    {info.rooms.map(room => (
                      <li key={room}>{room}</li>
                    ))}
                  </ul>
                </div>

                {tier === 'pro' && (
                  <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    📊 Post Trading Signals
                  </div>
                )}

                {tier === 'premium' && (
                  <>
                    <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                      ⭐ Official Signal Badge
                    </div>
                    <div style={{ marginTop: '5px', fontSize: '14px', color: '#666' }}>
                      🔒 Create Private Rooms
                    </div>
                  </>
                )}

                {!isCurrent && (
                  <button
                    onClick={() => {
                      onUpgrade(tier);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: isSuggested ? '#FF9800' : (tier === 'free' ? '#9E9E9E' : '#4CAF50'),
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      marginTop: '10px'
                    }}
                  >
                    {tier === 'free' ? 'Downgrade' : 'Upgrade'} to {info.name}
                  </button>
                )}

                {isCurrent && (
                  <div style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#ddd',
                    color: '#666',
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    marginTop: '10px'
                  }}>
                    Current Plan
                  </div>
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

// Signal Card Component
function SignalCard({ signal, username, timestamp, formatTime, isOfficial, canDelete, onDelete }) {
  const isBuy = signal.direction === 'BUY';

  return (
    <div style={{
      border: `3px solid ${isBuy ? '#4CAF50' : '#f44336'}`,
      borderRadius: '12px',
      padding: '18px',
      backgroundColor: isOfficial 
        ? (isBuy ? '#E8F5E9' : '#FFEBEE') 
        : (isBuy ? '#F1F8E9' : '#FCE4EC'),
      boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
      ...(isOfficial ? { border: '3px solid #FF9800' } : {})
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '22px',
            fontWeight: 'bold',
            color: isBuy ? '#2E7D32' : '#C62828'
          }}>
            {signal.direction} {signal.pair}
          </div>
          {isOfficial && (
            <span style={{
              backgroundColor: '#FF9800',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              ⭐ OFFICIAL
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {formatTime(timestamp)}
          </span>
          {canDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold'
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: '15px', lineHeight: '1.8' }}>
        <div><strong>Entry:</strong> {signal.entry}</div>
        <div><strong>Stop Loss:</strong> {signal.stopLoss}</div>
        <div><strong>Take Profit:</strong> {signal.takeProfit}</div>
        <div style={{
          fontWeight: 'bold',
          color: '#4CAF50',
          fontSize: '18px',
          marginTop: '8px'
        }}>
          R:R {signal.riskReward}
        </div>
      </div>

      <div style={{
        fontSize: '13px',
        color: '#666',
        marginTop: '12px',
        borderTop: '1px solid #ccc',
        paddingTop: '10px'
      }}>
        Posted by <strong>{username}</strong>
      </div>
    </div>
  );
}

export default Chat;