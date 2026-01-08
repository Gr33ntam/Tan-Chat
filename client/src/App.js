import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';
import Account from './Account';

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
      </Routes>
    </Router>
  );
}

export default App;