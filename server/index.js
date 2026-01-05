require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "http://localhost:3000" }
});

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  
  // Load existing messages from database
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading messages:', error);
    } else {
      socket.emit('previous_messages', messages);
    }
  } catch (err) {
    console.error('Database error:', err);
  }
  
  // Listen for new messages
  socket.on('send_message', async (data) => {
    try {
      // Save to database
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([data])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving message:', error);
        return;
      }
      
      // Broadcast to all connected clients
      io.emit('new_message', newMessage);
      console.log('Message saved and broadcast:', newMessage.id);
      
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Connected to Supabase ✓');
});
