import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('https://tan-chat.onrender.com');

function NotificationSettings({ username, onClose }) {
  const [preferences, setPreferences] = useState({
    browser_notifications: true,
    email_notifications: true,
    notify_new_signals: true,
    notify_signal_outcomes: true,
    notify_followed_traders: true,
    notify_mentions: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browserPermission, setBrowserPermission] = useState('default');

  useEffect(() => {
    if (username) {
      loadPreferences();
    }
    if ('Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, [username]);

  useEffect(() => {
    socket.on('preferences_loaded', (data) => {
      setPreferences(data);
      setLoading(false);
    });

    socket.on('preferences_updated', () => {
      setSaving(false);
      alert('✅ Notification preferences saved!');
    });

    socket.on('preferences_error', () => {
      setSaving(false);
      alert('❌ Failed to save preferences');
    });

    return () => {
      socket.off('preferences_loaded');
      socket.off('preferences_updated');
      socket.off('preferences_error');
    };
  }, []);

  const loadPreferences = () => {
    socket.emit('get_preferences', username);
  };

  const handleToggle = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = () => {
    setSaving(true);
    socket.emit('update_preferences', { username, preferences });
  };

  const requestBrowserPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === 'granted') {
        new Notification('Notifications Enabled!', {
          body: 'You will now receive browser notifications',
          icon: '🔔'
        });
      }
    }
  };

  const SettingToggle = ({ label, description, checked, onChange, icon }) => (
    <div style={{
      padding: '20px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      marginBottom: '15px',
      border: '2px solid #f0f0f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
          <span style={{ fontSize: '20px' }}>{icon}</span>
          <strong style={{ fontSize: '16px' }}>{label}</strong>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{description}</p>
      </div>
      <label style={{
        position: 'relative',
        display: 'inline-block',
        width: '60px',
        height: '34px',
        marginLeft: '20px'
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute',
          cursor: 'pointer',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? '#4CAF50' : '#ccc',
          transition: '0.4s',
          borderRadius: '34px'
        }}>
          <span style={{
            position: 'absolute',
            content: '',
            height: '26px',
            width: '26px',
            left: checked ? '30px' : '4px',
            bottom: '4px',
            backgroundColor: 'white',
            transition: '0.4s',
            borderRadius: '50%'
          }} />
        </span>
      </label>
    </div>
  );

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
        backgroundColor: '#f5f5f5',
        borderRadius: '16px',
        padding: '0',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '16px 16px 0 0',
          borderBottom: '2px solid #f0f0f0'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px' }}>⚙️ Notification Settings</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Customize how you receive notifications
          </p>
        </div>

        <div style={{
          overflowY: 'auto',
          flex: 1,
          padding: '20px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              Loading settings...
            </div>
          ) : (
            <>
              {browserPermission !== 'granted' && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#FFF3CD',
                  border: '2px solid #FFC107',
                  borderRadius: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <strong>Browser Notifications Disabled</strong>
                  </div>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px' }}>
                    Enable browser notifications to receive real-time alerts
                  </p>
                  <button
                    onClick={requestBrowserPermission}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#FF9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}
                  >
                    Enable Browser Notifications
                  </button>
                </div>
              )}

              <SettingToggle
                icon="🔔"
                label="Browser Notifications"
                description="Show desktop notifications for new activity"
                checked={preferences.browser_notifications}
                onChange={() => handleToggle('browser_notifications')}
              />

              <SettingToggle
                icon="📧"
                label="Email Notifications"
                description="Receive email alerts for important updates"
                checked={preferences.email_notifications}
                onChange={() => handleToggle('email_notifications')}
              />

              <SettingToggle
                icon="📊"
                label="New Signals"
                description="Get notified when new trading signals are posted"
                checked={preferences.notify_new_signals}
                onChange={() => handleToggle('notify_new_signals')}
              />

              <SettingToggle
                icon="💰"
                label="Signal Outcomes"
                description="Receive updates when signals hit TP or SL"
                checked={preferences.notify_signal_outcomes}
                onChange={() => handleToggle('notify_signal_outcomes')}
              />

              <SettingToggle
                icon="👥"
                label="Followed Traders"
                description="Get notified about activity from traders you follow"
                checked={preferences.notify_followed_traders}
                onChange={() => handleToggle('notify_followed_traders')}
              />

              <SettingToggle
                icon="💬"
                label="Mentions"
                description="Receive alerts when someone mentions you"
                checked={preferences.notify_mentions}
                onChange={() => handleToggle('notify_mentions')}
              />
            </>
          )}
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '0 0 16px 16px',
          borderTop: '2px solid #f0f0f0',
          display: 'flex',
          gap: '10px'
        }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: saving ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px',
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
  );
}

export default NotificationSettings;