import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

function Notifications({ username, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (username) {
      loadNotifications();
    }
  }, [username]);

  useEffect(() => {
    socket.on('notifications_loaded', (data) => {
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
      setLoading(false);
    });

    socket.on('new_notification', (data) => {
      if (data.username === username) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(data.title, {
            body: data.message,
            icon: '🔔'
          });
        }
        loadNotifications();
      }
    });

    socket.on('all_notifications_read', () => {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    });

    return () => {
      socket.off('notifications_loaded');
      socket.off('new_notification');
      socket.off('all_notifications_read');
    };
  }, [username]);

  const loadNotifications = () => {
    socket.emit('get_notifications', username);
  };

  const markAsRead = (notificationId) => {
    socket.emit('mark_notification_read', { notificationId });
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    socket.emit('mark_all_read', username);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'signal': return '📊';
      case 'outcome': return '💰';
      case 'follow': return '👤';
      case 'mention': return '💬';
      default: return '🔔';
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '16px',
        padding: '0',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '2px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px' }}>🔔 Notifications</h2>
            {unreadCount > 0 && (
              <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
                {unreadCount} unread
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{
          overflowY: 'auto',
          flex: 1,
          padding: '10px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔔</div>
              <p>No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => !notification.read && markAsRead(notification.id)}
                style={{
                  padding: '15px',
                  marginBottom: '10px',
                  backgroundColor: notification.read ? '#fff' : '#E3F2FD',
                  borderLeft: `4px solid ${notification.read ? '#ddd' : '#2196F3'}`,
                  borderRadius: '8px',
                  cursor: notification.read ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: notification.read ? 'none' : '0 2px 8px rgba(33,150,243,0.2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '20px' }}>
                        {getNotificationIcon(notification.type)}
                      </span>
                      <strong style={{ fontSize: '16px', color: '#333' }}>
                        {notification.title}
                      </strong>
                    </div>
                    <p style={{ margin: '5px 0', color: '#666', fontSize: '14px' }}>
                      {notification.message}
                    </p>
                    <span style={{ fontSize: '12px', color: '#999' }}>
                      {formatTimeAgo(notification.created_at)}
                    </span>
                  </div>
                  {!notification.read && (
                    <div style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: '#2196F3',
                      borderRadius: '50%',
                      marginLeft: '10px',
                      marginTop: '5px'
                    }} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Notifications;