import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';
import Account from './Account';
import Leaderboard from './Leaderboard';

function App() {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  const handleLogout = () => {
    setUsername('');
    localStorage.removeItem('username');
    window.location.href = '/';
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Chat onUsernameSet={setUsername} />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/account" element={<Account username={username} onLogout={handleLogout} />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </Router>
  );
}

export default App;