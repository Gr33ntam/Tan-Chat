require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://tan-chat-gamma.vercel.app"
  ],
  credentials: true
}));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://tan-chat-gamma.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  
  // Join a specific room
  socket.on('join_room', async (room) => {
    // Leave all previous rooms
    const rooms = Array.from(socket.rooms);
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    
    // Join the new room
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
    
    // Load messages for this room
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room', room)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error loading messages:', error);
      } else {
        socket.emit('previous_messages', messages);
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  });
  
  // Listen for new messages
  socket.on('send_message', async (data) => {
    try {
      // Save to database (data.room is included from frontend)
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([data])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving message:', error);
        return;
      }
      
      // Broadcast ONLY to users in the same room
      io.to(data.room).emit('new_message', newMessage);
      console.log(`Message saved and broadcast to room ${data.room}:`, newMessage.id);
      
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Connected to Supabase ✓');
});