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

// Room access levels
const ROOM_ACCESS = {
  free: ['general'],
  pro: ['general', 'forex', 'crypto'],
  premium: ['general', 'forex', 'crypto', 'stocks']
};

// Helper: Get or create user
async function getOrCreateUser(username) {
  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (existingUser) {
      return existingUser;
    }
    
    // Create new user with free tier
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ username, subscription_tier: 'free' }])
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating user:', createError);
      return null;
    }
    
    return newUser;
  } catch (err) {
    console.error('Error in getOrCreateUser:', err);
    return null;
  }
}

// Helper: Check if user has access to room
function hasRoomAccess(tier, room) {
  return ROOM_ACCESS[tier]?.includes(room) || false;
}

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  
  let currentUser = null;
  
  // Register user
  socket.on('register_user', async (username) => {
    currentUser = await getOrCreateUser(username);
    if (currentUser) {
      socket.emit('user_registered', {
        username: currentUser.username,
        tier: currentUser.subscription_tier
      });
      console.log(`User registered: ${username} (${currentUser.subscription_tier})`);
    } else {
      socket.emit('registration_error', 'Failed to register user');
    }
  });
  
  // Join a specific room
  socket.on('join_room', async ({ room, username }) => {
    // Get user data
    const user = await getOrCreateUser(username);
    
    if (!user) {
      socket.emit('room_error', { message: 'User not found' });
      return;
    }
    
    // Check if user has access to this room
    if (!hasRoomAccess(user.subscription_tier, room)) {
      socket.emit('room_locked', { 
        room, 
        requiredTier: room === 'stocks' ? 'premium' : 'pro',
        message: `Upgrade to ${room === 'stocks' ? 'Premium' : 'Pro'} to access ${room} room`
      });
      console.log(`Access denied: ${username} tried to join ${room} with ${user.subscription_tier} tier`);
      return;
    }
    
    // Leave all previous rooms
    const rooms = Array.from(socket.rooms);
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    
    // Join the new room
    socket.join(room);
    console.log(`User ${socket.id} (${username}) joined room: ${room}`);
    
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
      // Verify user has access to the room
      const user = await getOrCreateUser(data.username);
      if (!user || !hasRoomAccess(user.subscription_tier, data.room)) {
        socket.emit('message_error', 'No access to this room');
        return;
      }
      
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
      
      // Broadcast ONLY to users in the same room
      io.to(data.room).emit('new_message', newMessage);
      console.log(`Message saved and broadcast to room ${data.room}:`, newMessage.id);
      
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  // Mock payment - upgrade user
  socket.on('upgrade_subscription', async ({ username, tier }) => {
    try {
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update({ 
          subscription_tier: tier,
          updated_at: new Date().toISOString()
        })
        .eq('username', username)
        .select()
        .single();
      
      if (error) {
        console.error('Error upgrading user:', error);
        socket.emit('upgrade_error', 'Failed to upgrade');
        return;
      }
      
      socket.emit('upgrade_success', {
        username: updatedUser.username,
        tier: updatedUser.subscription_tier
      });
      console.log(`User upgraded: ${username} -> ${tier}`);
      
    } catch (err) {
      console.error('Error in upgrade:', err);
      socket.emit('upgrade_error', 'Failed to upgrade');
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