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

// Track online users per room
const onlineUsers = {
  general: new Set(),
  forex: new Set(),
  crypto: new Set(),
  stocks: new Set()
};

// Track typing users per room
const typingUsers = {
  general: new Set(),
  forex: new Set(),
  crypto: new Set(),
  stocks: new Set()
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

// Helper: Broadcast online users for a room
function broadcastOnlineUsers(room) {
  const users = Array.from(onlineUsers[room]);
  io.to(room).emit('online_users', users);
  console.log(`Broadcasting online users for ${room}:`, users);
}

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  
  let currentUser = null;
  let currentRoom = null;
  
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
    
    // Remove user from previous room
    if (currentRoom) {
      socket.leave(currentRoom);
      onlineUsers[currentRoom].delete(username);
      typingUsers[currentRoom].delete(username);
      broadcastOnlineUsers(currentRoom);
      io.to(currentRoom).emit('user_stop_typing', { username, room: currentRoom });
    }
    
    // Join the new room
    socket.join(room);
    currentRoom = room;
    onlineUsers[room].add(username);
    console.log(`User ${socket.id} (${username}) joined room: ${room}`);
    
    // Broadcast updated online users
    broadcastOnlineUsers(room);
    
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
      
      // Initialize reactions as empty object
      const messageData = {
        ...data,
        reactions: {}
      };
      
      // Save to database
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([messageData])
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
  
  // Edit message
  socket.on('edit_message', async ({ messageId, newText, username }) => {
    try {
      // Verify the message belongs to the user
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (fetchError || !message) {
        socket.emit('edit_error', 'Message not found');
        return;
      }
      
      if (message.username !== username) {
        socket.emit('edit_error', 'You can only edit your own messages');
        return;
      }
      
      // Update the message
      const { data: updatedMessage, error: updateError } = await supabase
        .from('messages')
        .update({ 
          text: newText,
          edited: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating message:', updateError);
        socket.emit('edit_error', 'Failed to update message');
        return;
      }
      
      // Broadcast the updated message to the room
      io.to(message.room).emit('message_updated', updatedMessage);
      console.log(`Message ${messageId} edited by ${username}`);
      
    } catch (err) {
      console.error('Error editing message:', err);
      socket.emit('edit_error', 'Failed to update message');
    }
  });
  
  // Delete message
  socket.on('delete_message', async ({ messageId, username }) => {
    try {
      // Verify the message belongs to the user
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (fetchError || !message) {
        socket.emit('delete_error', 'Message not found');
        return;
      }
      
      if (message.username !== username) {
        socket.emit('delete_error', 'You can only delete your own messages');
        return;
      }
      
      // Delete the message
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);
      
      if (deleteError) {
        console.error('Error deleting message:', deleteError);
        socket.emit('delete_error', 'Failed to delete message');
        return;
      }
      
      // Broadcast the deletion to the room
      io.to(message.room).emit('message_deleted', messageId);
      console.log(`Message ${messageId} deleted by ${username}`);
      
    } catch (err) {
      console.error('Error deleting message:', err);
      socket.emit('delete_error', 'Failed to delete message');
    }
  });
  
  // Add reaction to message
  socket.on('add_reaction', async ({ messageId, username, emoji, room }) => {
    try {
      // Get the message
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (fetchError || !message) {
        console.error('Message not found for reaction');
        return;
      }
      
      // Get current reactions or initialize empty object
      let reactions = message.reactions || {};
      
      // Toggle reaction: add if not present, remove if present
      if (reactions[emoji]) {
        if (reactions[emoji].includes(username)) {
          // Remove user from reaction
          reactions[emoji] = reactions[emoji].filter(u => u !== username);
          // Remove emoji if no users left
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        } else {
          // Add user to reaction
          reactions[emoji].push(username);
        }
      } else {
        // Create new reaction
        reactions[emoji] = [username];
      }
      
      // Update message with new reactions
      const { error: updateError } = await supabase
        .from('messages')
        .update({ reactions })
        .eq('id', messageId);
      
      if (updateError) {
        console.error('Error updating reactions:', updateError);
        return;
      }
      
      // Broadcast the updated reactions to the room
      io.to(room).emit('message_reacted', { messageId, reactions });
      console.log(`Reaction ${emoji} ${reactions[emoji]?.includes(username) ? 'added' : 'removed'} by ${username} on message ${messageId}`);
      
    } catch (err) {
      console.error('Error adding reaction:', err);
    }
  });
  
  // Typing indicator
  socket.on('typing', ({ username, room }) => {
    if (!typingUsers[room]) typingUsers[room] = new Set();
    typingUsers[room].add(username);
    io.to(room).emit('user_typing', { username, room });
  });
  
  socket.on('stop_typing', ({ username, room }) => {
    if (typingUsers[room]) {
      typingUsers[room].delete(username);
      io.to(room).emit('user_stop_typing', { username, room });
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
      
      // Emit to all sockets (for account page updates)
      io.emit('upgrade_success', {
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
    
    // Remove user from online users and typing users
    if (currentUser && currentRoom) {
      onlineUsers[currentRoom].delete(currentUser.username);
      typingUsers[currentRoom].delete(currentUser.username);
      broadcastOnlineUsers(currentRoom);
      io.to(currentRoom).emit('user_stop_typing', { 
        username: currentUser.username, 
        room: currentRoom 
      });
    }
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Connected to Supabase ✓');
  console.log('Enhanced features: Avatars, Reactions, Edit/Delete, Online Status, Typing Indicators');
});