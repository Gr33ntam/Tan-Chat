import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';
import Account from './Account';
import Leaderboard from './Leaderboard';
import Analytics from './Analytics';
import UserProfile from './UserProfile'; // ADD THIS

function App() {
  const [username, setUsername] = useState('');

  const handleLogout = () => {
    setUsername('');
    window.location.href = '/';
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Chat onUsernameSet={setUsername} />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/account" element={<Account username={username} onLogout={handleLogout} />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/profile/:username" element={<UserProfile />} /> {/* ADD THIS */}
      </Routes>
    </Router>
  );
}

export default App;