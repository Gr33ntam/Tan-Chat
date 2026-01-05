import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [showSignalForm, setShowSignalForm] = useState(false);
  const messagesEndRef = useRef(null);

  // Signal form state
  const [signalData, setSignalData] = useState({
    pair: '',
    direction: 'BUY',
    entry: '',
    stopLoss: '',
    takeProfit: ''
  });

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    socket.on('previous_messages', (msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
    });

    return () => {
      socket.off('previous_messages');
      socket.off('new_message');
    };
  }, []);

  const sendMessage = () => {
    if (input.trim()) {
      socket.emit('send_message', {
        type: 'text',
        username,
        text: input,
        timestamp: new Date().toISOString()
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

      // Reset form
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
          onKeyPress={(e) => e.key === 'Enter' && username && setJoined(true)}
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
          onClick={() => username && setJoined(true)}
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

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '900px', 
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
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
            Logged in as: <strong>{username}</strong>
          </p>
        </div>
        <div style={{ fontSize: '24px' }}>📊</div>
      </div>

      {/* Messages */}
      <div style={{ 
        border: '2px solid #e0e0e0', 
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
            No messages yet. Start the conversation! 💬
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '15px' }}>
            {msg.type === 'text' ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '12px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong style={{ color: '#2196F3' }}>{msg.username}</strong>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div style={{ color: '#333' }}>{msg.text}</div>
              </div>
            ) : (
              <SignalCard 
                signal={msg.signal} 
                username={msg.username} 
                timestamp={msg.timestamp}
                formatTime={formatTime}
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
          
          <input
            placeholder="Pair (e.g. XAUUSD, BTCUSDT)"
            value={signalData.pair}
            onChange={(e) => setSignalData({...signalData, pair: e.target.value.toUpperCase()})}
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
            onChange={(e) => setSignalData({...signalData, direction: e.target.value})}
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
            onChange={(e) => setSignalData({...signalData, entry: e.target.value})}
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
            onChange={(e) => setSignalData({...signalData, stopLoss: e.target.value})}
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
            onChange={(e) => setSignalData({...signalData, takeProfit: e.target.value})}
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
          placeholder="Type a message..."
          style={{ 
            flex: 1, 
            padding: '12px',
            border: '2px solid #ddd',
            borderRadius: '8px',
            fontSize: '15px'
          }}
        />
        <button 
          onClick={sendMessage}
          style={{
            padding: '12px 24px',
            backgroundColor: '#2196F3',
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
  );
}

// Signal Card Component
function SignalCard({ signal, username, timestamp, formatTime }) {
  const isBuy = signal.direction === 'BUY';
  
  return (
    <div style={{
      border: `3px solid ${isBuy ? '#4CAF50' : '#f44336'}`,
      borderRadius: '12px',
      padding: '18px',
      backgroundColor: isBuy ? '#E8F5E9' : '#FFEBEE',
      boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
    }}>
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