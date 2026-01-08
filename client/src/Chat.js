import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

// Available rooms with tier requirements
const ROOMS = [
  { id: 'general', name: '💬 General', color: '#2196F3', requiredTier: 'free' },
  { id: 'forex', name: '💱 Forex', color: '#4CAF50', requiredTier: 'pro' },
  { id: 'crypto', name: '₿ Crypto', color: '#FF9800', requiredTier: 'pro' },
  { id: 'stocks', name: '📈 Stocks', color: '#9C27B0', requiredTier: 'premium' }
];

// Subscription tiers
const TIERS = {
  free: { name: 'Free', price: '$0', rooms: ['General'] },
  pro: { name: 'Pro', price: '$9.99/mo', rooms: ['General', 'Forex', 'Crypto'] },
  premium: { name: 'Premium', price: '$19.99/mo', rooms: ['General', 'Forex', 'Crypto', 'Stocks'] }
};

// Available reactions
const REACTIONS = ['👍', '❤️', '😂', '😮', '🎯', '🚀', '💎', '🔥'];

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [showSignalForm, setShowSignalForm] = useState(false);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [userTier, setUserTier] = useState('free');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Signal form state
  const [signalData, setSignalData] = useState({
    pair: '',
    direction: 'BUY',
    entry: '',
    stopLoss: '',
    takeProfit: ''
  });

  // Generate avatar URL using DiceBear API
  const getAvatar = (username) => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  };

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Register user and get tier
  useEffect(() => {
    if (joined && username) {
      socket.emit('register_user', username);
    }
  }, [joined, username]);

  // Handle typing indicator
  const handleTyping = () => {
    socket.emit('typing', { username, room: currentRoom });
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { username, room: currentRoom });
    }, 2000);
  };

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

    socket.on('message_updated', (updatedMsg) => {
      setMessages(prev => prev.map(msg => 
        msg.id === updatedMsg.id ? updatedMsg : msg
      ));
    });

    socket.on('message_deleted', (messageId) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    });

    socket.on('message_reacted', (data) => {
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId ? { ...msg, reactions: data.reactions } : msg
      ));
    });

    socket.on('online_users', (users) => {
      setOnlineUsers(users);
    });

    socket.on('user_typing', (data) => {
      if (data.username !== username) {
        setTypingUsers(prev => {
          if (!prev.includes(data.username)) {
            return [...prev, data.username];
          }
          return prev;
        });
      }
    });

    socket.on('user_stop_typing', (data) => {
      setTypingUsers(prev => prev.filter(u => u !== data.username));
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

    return () => {
      socket.off('user_registered');
      socket.off('previous_messages');
      socket.off('new_message');
      socket.off('message_updated');
      socket.off('message_deleted');
      socket.off('message_reacted');
      socket.off('online_users');
      socket.off('user_typing');
      socket.off('user_stop_typing');
      socket.off('room_locked');
      socket.off('upgrade_success');
      socket.off('upgrade_error');
    };
  }, [username]);

  // Join room when component mounts or room changes
  useEffect(() => {
    if (joined && username) {
      socket.emit('join_room', { room: currentRoom, username });
    }
  }, [currentRoom, joined, username]);

  const sendMessage = () => {
    if (input.trim()) {
      if (editingMessage) {
        // Update existing message
        socket.emit('edit_message', {
          messageId: editingMessage.id,
          newText: input,
          username
        });
        setEditingMessage(null);
      } else {
        // Send new message
        socket.emit('send_message', {
          type: 'text',
          username,
          text: input,
          room: currentRoom,
          timestamp: new Date().toISOString()
        });
      }
      setInput('');
      socket.emit('stop_typing', { username, room: currentRoom });
    }
  };

  const handleEditMessage = (msg) => {
    setEditingMessage(msg);
    setInput(msg.text);
  };

  const handleDeleteMessage = (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      socket.emit('delete_message', { messageId, username });
    }
  };

  const handleReaction = (messageId, emoji) => {
    socket.emit('add_reaction', {
      messageId,
      username,
      emoji,
      room: currentRoom
    });
    setShowReactionPicker(null);
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
        timestamp: new Date().toISOString()
      });

      setSignalData({
        pair: '',
        direction: 'BUY',
        entry: '',
        stopLoss: '',
        takeProfit: ''
      });
      setShowSignalForm(false);
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
    setTypingUsers([]);
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

  const currentRoomInfo = ROOMS.find(r => r.id === currentRoom);

  return (
    <div style={{
      padding: '20px',
      maxWidth: '1100px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Main Chat Area */}
        <div style={{ flex: 1 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img 
                src={getAvatar(username)} 
                alt={username}
                style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%',
                  border: '3px solid #2196F3'
                }}
              />
              <div>
                <h2 style={{ margin: 0, color: '#333' }}>Trader Chat</h2>
                <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
                  <strong>{username}</strong> · {userTier === 'free' ? '🆓 Free' : userTier === 'pro' ? '💎 Pro' : '👑 Premium'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
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
            </div>
          </div>

          {/* Room Selector */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '15px',
            flexWrap: 'wrap'
          }}>
            {ROOMS.map(room => {
              const hasAccess = hasAccessToRoom(room);
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
                  <MessageCard
                    msg={msg}
                    currentUsername={username}
                    formatTime={formatTime}
                    currentRoomColor={currentRoomInfo.color}
                    getAvatar={getAvatar}
                    onEdit={handleEditMessage}
                    onDelete={handleDeleteMessage}
                    onReact={handleReaction}
                    showReactionPicker={showReactionPicker}
                    setShowReactionPicker={setShowReactionPicker}
                  />
                ) : (
                  <SignalCard
                    signal={msg.signal}
                    username={msg.username}
                    timestamp={msg.timestamp}
                    formatTime={formatTime}
                    getAvatar={getAvatar}
                    reactions={msg.reactions}
                    currentUsername={username}
                    onReact={handleReaction}
                    messageId={msg.id}
                    showReactionPicker={showReactionPicker}
                    setShowReactionPicker={setShowReactionPicker}
                  />
                )}
              </div>
            ))}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div style={{
                padding: '10px',
                color: '#666',
                fontSize: '14px',
                fontStyle: 'italic'
              }}>
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </div>
            )}
            
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
              onChange={(e) => {
                setInput(e.target.value);
                handleTyping();
              }}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={editingMessage ? 'Edit your message...' : `Message ${currentRoomInfo.name}...`}
              style={{
                flex: 1,
                padding: '12px',
                border: `2px solid ${editingMessage ? '#FF9800' : currentRoomInfo.color}`,
                borderRadius: '8px',
                fontSize: '15px'
              }}
            />
            {editingMessage && (
              <button
                onClick={() => {
                  setEditingMessage(null);
                  setInput('');
                }}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={sendMessage}
              style={{
                padding: '12px 24px',
                backgroundColor: editingMessage ? '#FF9800' : currentRoomInfo.color,
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {editingMessage ? 'Update' : 'Send'}
            </button>
          </div>

          {/* Post Signal Button */}
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
        </div>

        {/* Online Users Sidebar */}
        <div style={{ width: '250px' }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'sticky',
            top: '20px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>
              🟢 Online Users ({onlineUsers.length})
            </h3>
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {onlineUsers.map((user, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px',
                  backgroundColor: user === username ? '#E3F2FD' : '#f5f5f5',
                  borderRadius: '8px',
                  marginBottom: '8px'
                }}>
                  <img 
                    src={getAvatar(user)} 
                    alt={user}
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      borderRadius: '50%'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontSize: '14px',
                      color: user === username ? '#2196F3' : '#333'
                    }}>
                      {user} {user === username && '(You)'}
                    </div>
                  </div>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#4CAF50',
                    borderRadius: '50%'
                  }} />
                </div>
              ))}
              {onlineUsers.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#999', 
                  padding: '20px',
                  fontSize: '14px'
                }}>
                  No users online
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          currentTier={userTier}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
          suggestedTier={selectedUpgradeTier}
        />
      )}
    </div>
  );
}

// Message Card Component
function MessageCard({ 
  msg, 
  currentUsername, 
  formatTime, 
  currentRoomColor, 
  getAvatar,
  onEdit,
  onDelete,
  onReact,
  showReactionPicker,
  setShowReactionPicker
}) {
  const isOwnMessage = msg.username === currentUsername;
  
  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '12px',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
        <img 
          src={getAvatar(msg.username)} 
          alt={msg.username}
          style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%',
            flexShrink: 0
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', alignItems: 'center' }}>
            <strong style={{ color: currentRoomColor }}>{msg.username}</strong>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#999' }}>
                {formatTime(msg.timestamp)}
                {msg.edited && <span style={{ marginLeft: '5px', fontStyle: 'italic' }}>(edited)</span>}
              </span>
              {isOwnMessage && (
                <>
                  <button
                    onClick={() => onEdit(msg)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(msg.id)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ color: '#333', marginBottom: '8px' }}>{msg.text}</div>
          
          {/* Reactions */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
            {msg.reactions && Object.entries(msg.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(msg.id, emoji)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: users.includes(currentUsername) ? '#E3F2FD' : '#f5f5f5',
                  border: users.includes(currentUsername) ? '2px solid #2196F3' : '1px solid #ddd',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {emoji} {users.length}
              </button>
            ))}
            <button
              onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ➕
            </button>
          </div>
          
          {/* Reaction Picker */}
          {showReactionPicker === msg.id && (
            <div style={{
              position: 'absolute',
              bottom: '-50px',
              right: '10px',
              backgroundColor: '#fff',
              padding: '8px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              display: 'flex',
              gap: '5px',
              zIndex: 100
            }}>
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onReact(msg.id, emoji)}
                  style={{
                    padding: '5px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
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
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>🚀 Upgrade Your Plan</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Get access to premium trading rooms and exclusive features
        </p>

        {/* Tier Cards */}
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

                {!isCurrent && tier !== 'free' && (
                  <button
                    onClick={() => {
                      onUpgrade(tier);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: isSuggested ? '#FF9800' : '#4CAF50',
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
function SignalCard({ 
  signal, 
  username, 
  timestamp, 
  formatTime, 
  getAvatar,
  reactions,
  currentUsername,
  onReact,
  messageId,
  showReactionPicker,
  setShowReactionPicker
}) {
  const isBuy = signal.direction === 'BUY';

  return (
    <div style={{
      border: `3px solid ${isBuy ? '#4CAF50' : '#f44336'}`,
      borderRadius: '12px',
      padding: '18px',
      backgroundColor: isBuy ? '#E8F5E9' : '#FFEBEE',
      boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <img 
          src={getAvatar(username)} 
          alt={username}
          style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%',
            flexShrink: 0
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <div style={{
              fontSize: '22px',
              fontWeight: 'bold',
              color: isBuy ? '#2E7D32' : '#C62828'
            }}>
              {signal.direction} {signal.pair}
            </div>
            <span style={{ fontSize: '12px', color: '#666' }}>
              {formatTime(timestamp)}
            </span>
          </div>

          <div style={{ fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>
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

          {/* Reactions */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            {reactions && Object.entries(reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(messageId, emoji)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: users.includes(currentUsername) ? '#E3F2FD' : '#f5f5f5',
                  border: users.includes(currentUsername) ? '2px solid #2196F3' : '1px solid #ddd',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {emoji} {users.length}
              </button>
            ))}
            <button
              onClick={() => setShowReactionPicker(showReactionPicker === messageId ? null : messageId)}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ➕
            </button>
          </div>

          {/* Reaction Picker */}
          {showReactionPicker === messageId && (
            <div style={{
              position: 'absolute',
              bottom: '-50px',
              right: '10px',
              backgroundColor: '#fff',
              padding: '8px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              display: 'flex',
              gap: '5px',
              zIndex: 100
            }}>
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onReact(messageId, emoji)}
                  style={{
                    padding: '5px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div style={{
            fontSize: '13px',
            color: '#666',
            borderTop: '1px solid #ccc',
            paddingTop: '10px'
          }}>
            Posted by <strong>{username}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;
