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
    /^https:\/\/tan-chat.*\.vercel\.app$/,
    "https://tan-chat-gamma.vercel.app"
  ],
  credentials: true
}));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      /^https:\/\/tan-chat.*\.vercel\.app$/,
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

// Helper: Check if user can create official posts (Pro or Premium)
function canCreateOfficialPost(tier) {
  return tier === 'pro' || tier === 'premium';
}

// Helper: Check if user can create private rooms (Premium only)
function canCreatePrivateRoom(tier) {
  return tier === 'premium';
}

// Helper: Check if room is private
async function isPrivateRoom(roomId) {
  const { data } = await supabase
    .from('private_rooms')
    .select('id')
    .eq('room_id', roomId)
    .single();
  return !!data;
}

// Helper: Check if user has access to private room
async function hasPrivateRoomAccess(username, roomId) {
  const { data } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('username', username)
    .single();
  return !!data;
}

// Helper: Get user role in private room
async function getUserRoleInRoom(username, roomId) {
  const { data } = await supabase
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('username', username)
    .single();
  return data?.role || null;
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

    // Check if it's a private room
    const isPrivate = await isPrivateRoom(room);

    if (isPrivate) {
      // Check private room access
      const hasAccess = await hasPrivateRoomAccess(username, room);
      if (!hasAccess) {
        socket.emit('room_locked', {
          room,
          requiredTier: 'premium',
          message: 'You need to be invited to this private room'
        });
        return;
      }
    } else {
      // Check public room access
      if (!hasRoomAccess(user.subscription_tier, room)) {
        socket.emit('room_locked', {
          room,
          requiredTier: room === 'stocks' ? 'premium' : 'pro',
          message: `Upgrade to ${room === 'stocks' ? 'Premium' : 'Pro'} to access ${room} room`
        });
        console.log(`Access denied: ${username} tried to join ${room} with ${user.subscription_tier} tier`);
        return;
      }
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

  // Send message (updated to support official posts)
  socket.on('send_message', async (data) => {
    try {
      // Verify user has access to the room
      const user = await getOrCreateUser(data.username);
      if (!user) {
        socket.emit('message_error', 'User not found');
        return;
      }

      // Check room access
      const isPrivate = await isPrivateRoom(data.room);
      if (isPrivate) {
        const hasAccess = await hasPrivateRoomAccess(data.username, data.room);
        if (!hasAccess) {
          socket.emit('message_error', 'No access to this room');
          return;
        }
      } else {
        if (!hasRoomAccess(user.subscription_tier, data.room)) {
          socket.emit('message_error', 'No access to this room');
          return;
        }
      }

      // Check if trying to create official post
      if (data.is_official && !canCreateOfficialPost(user.subscription_tier)) {
        socket.emit('message_error', 'Only Pro and Premium users can create official posts');
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

      // If it's an official post, create metadata
      if (data.is_official && data.type === 'signal') {
        await supabase
          .from('official_posts_metadata')
          .insert([{
            message_id: newMessage.id,
            author_username: data.username,
            post_type: 'signal',
            status: 'active',
            outcome: 'pending'
          }]);
      }

      // Broadcast ONLY to users in the same room
      io.to(data.room).emit('new_message', newMessage);
      console.log(`Message saved and broadcast to room ${data.room}:`, newMessage.id);

    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Create private room (Premium only)
  socket.on('create_private_room', async ({ username, roomName, description }) => {
    try {
      const user = await getOrCreateUser(username);

      if (!user) {
        socket.emit('room_error', { message: 'User not found' });
        return;
      }

      if (!canCreatePrivateRoom(user.subscription_tier)) {
        socket.emit('room_error', { message: 'Only Premium users can create private rooms' });
        return;
      }

      // Generate unique room ID
      const roomId = `private_${username}_${Date.now()}`;

      // Create room
      const { data: newRoom, error: roomError } = await supabase
        .from('private_rooms')
        .insert([{
          room_id: roomId,
          name: roomName,
          description: description,
          owner_username: username
        }])
        .select()
        .single();

      if (roomError) {
        console.error('Error creating room:', roomError);
        socket.emit('room_error', { message: 'Failed to create room' });
        return;
      }

      // Add owner as member
      await supabase
        .from('room_members')
        .insert([{
          room_id: roomId,
          username: username,
          role: 'owner'
        }]);

      socket.emit('room_created', {
        room: newRoom,
        message: 'Private room created successfully'
      });

      console.log(`Private room created: ${roomId} by ${username}`);

    } catch (err) {
      console.error('Error creating private room:', err);
      socket.emit('room_error', { message: 'Failed to create room' });
    }
  });

  // Invite user to private room
  socket.on('invite_to_room', async ({ roomId, inviterUsername, inviteeUsername }) => {
    try {
      // Check if inviter has permission (owner or moderator)
      const inviterRole = await getUserRoleInRoom(inviterUsername, roomId);

      if (!inviterRole || (inviterRole !== 'owner' && inviterRole !== 'moderator')) {
        socket.emit('room_error', { message: 'You do not have permission to invite users' });
        return;
      }

      // Check if invitee already in room
      const existingMember = await hasPrivateRoomAccess(inviteeUsername, roomId);
      if (existingMember) {
        socket.emit('room_error', { message: 'User is already a member' });
        return;
      }

      // Add member
      await supabase
        .from('room_members')
        .insert([{
          room_id: roomId,
          username: inviteeUsername,
          role: 'member'
        }]);

      socket.emit('invite_success', {
        roomId,
        username: inviteeUsername,
        message: `${inviteeUsername} has been invited to the room`
      });

      console.log(`${inviteeUsername} invited to room ${roomId} by ${inviterUsername}`);

    } catch (err) {
      console.error('Error inviting user:', err);
      socket.emit('room_error', { message: 'Failed to invite user' });
    }
  });

  // Remove user from private room
  socket.on('remove_from_room', async ({ roomId, removerUsername, removeUsername }) => {
    try {
      // Check if remover has permission (owner or moderator)
      const removerRole = await getUserRoleInRoom(removerUsername, roomId);

      if (!removerRole || (removerRole !== 'owner' && removerRole !== 'moderator')) {
        socket.emit('room_error', { message: 'You do not have permission to remove users' });
        return;
      }

      // Cannot remove owner
      const removeRole = await getUserRoleInRoom(removeUsername, roomId);
      if (removeRole === 'owner') {
        socket.emit('room_error', { message: 'Cannot remove room owner' });
        return;
      }

      // Remove member
      await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('username', removeUsername);

      socket.emit('remove_success', {
        roomId,
        username: removeUsername,
        message: `${removeUsername} has been removed from the room`
      });

      console.log(`${removeUsername} removed from room ${roomId} by ${removerUsername}`);

    } catch (err) {
      console.error('Error removing user:', err);
      socket.emit('room_error', { message: 'Failed to remove user' });
    }
  });

  // Get user's private rooms
  socket.on('get_my_rooms', async ({ username }) => {
    try {
      const { data: rooms, error } = await supabase
        .from('room_members')
        .select('room_id, role, private_rooms(room_id, name, description, owner_username)')
        .eq('username', username);

      if (error) {
        console.error('Error fetching rooms:', error);
        socket.emit('rooms_error', { message: 'Failed to fetch rooms' });
        return;
      }

      socket.emit('my_rooms', { rooms });

    } catch (err) {
      console.error('Error fetching rooms:', err);
      socket.emit('rooms_error', { message: 'Failed to fetch rooms' });
    }
  });

  // Delete message
  socket.on('delete_message', async ({ messageId, username, room }) => {
    try {
      // Verify the message belongs to the user
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .eq('username', username)
        .single();

      if (fetchError || !message) {
        socket.emit('room_error', { message: 'Cannot delete this message' });
        return;
      }
      // Delete the message
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (deleteError) {
        console.error('Error deleting message:', deleteError);
        socket.emit('room_error', { message: 'Failed to delete message' });
        return;
      }

      // Broadcast deletion to all users in the room
      io.to(room).emit('message_deleted', { messageId });

      console.log(`Message ${messageId} deleted by ${username}`);

    } catch (err) {
      console.error('Error deleting message:', err);
      socket.emit('room_error', { message: 'Failed to delete message' });
    }
  });

  // Update signal outcome
  socket.on('update_signal_outcome', async ({ messageId, username, outcome, closePrice, closedBy }) => {
    try {
      // Get the message to verify it's the author
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (msgError || !message) {
        socket.emit('signal_error', { message: 'Signal not found' });
        return;
      }

      // Verify user is the author
      if (message.username !== username) {
        socket.emit('signal_error', { message: 'Only the signal author can update outcomes' });
        return;
      }

      // Get the official post metadata
      const { data: metadata, error: metaError } = await supabase
        .from('official_posts_metadata')
        .select('*')
        .eq('message_id', messageId)
        .single();

      if (metaError || !metadata) {
        socket.emit('signal_error', { message: 'Signal metadata not found' });
        return;
      }

      // Calculate pips gained
      let pipsGained = 0;
      if (closePrice && message.signal) {
        const entry = parseFloat(message.signal.entry);
        const close = parseFloat(closePrice);
        const direction = message.signal.direction;

        if (direction === 'BUY') {
          pipsGained = close - entry;
        } else {
          pipsGained = entry - close;
        }
      }

      // Update the metadata
      const { error: updateError } = await supabase
        .from('official_posts_metadata')
        .update({
          outcome: outcome,
          status: outcome === 'pending' ? 'active' : 'closed',
          closed_at: outcome === 'pending' ? null : new Date().toISOString(),
          close_price: closePrice || null,
          pips_gained: pipsGained,
          closed_by: closedBy || null
        })
        .eq('message_id', messageId);

      if (updateError) {
        console.error('Error updating signal:', updateError);
        socket.emit('signal_error', { message: 'Failed to update signal' });
        return;
      }

      // Broadcast the update to all users in the room
      io.to(message.room).emit('signal_updated', {
        messageId,
        outcome,
        closePrice,
        pipsGained,
        closedBy,
        closedAt: outcome === 'pending' ? null : new Date().toISOString()
      });

      socket.emit('signal_update_success', { message: 'Signal updated successfully' });
      console.log(`Signal ${messageId} updated by ${username}: ${outcome}`);

    } catch (err) {
      console.error('Error updating signal outcome:', err);
      socket.emit('signal_error', { message: 'Failed to update signal' });
    }
  });

  // Get user statistics
  socket.on('get_user_stats', async ({ username }) => {
    try {
      // Get all official signals by this user
      const { data: signals, error } = await supabase
        .from('official_posts_metadata')
        .select('*')
        .eq('author_username', username);

      if (error) {
        console.error('Error fetching user stats:', error);
        socket.emit('user_stats', { stats: null });
        return;
      }

      // Calculate statistics
      const totalSignals = signals.length;
      const wonSignals = signals.filter(s => s.outcome === 'won').length;
      const lostSignals = signals.filter(s => s.outcome === 'lost').length;
      const pendingSignals = signals.filter(s => s.outcome === 'pending').length;
      const winRate = totalSignals > 0 ? ((wonSignals / (wonSignals + lostSignals)) * 100).toFixed(1) : 0;

      const totalPips = signals.reduce((sum, s) => sum + (parseFloat(s.pips_gained) || 0), 0);
      const avgPips = totalSignals > 0 ? (totalPips / totalSignals).toFixed(2) : 0;

      const stats = {
        totalSignals,
        wonSignals,
        lostSignals,
        pendingSignals,
        winRate: parseFloat(winRate),
        totalPips: parseFloat(totalPips.toFixed(2)),
        avgPips: parseFloat(avgPips)
      };

      socket.emit('user_stats', { stats });

    } catch (err) {
      console.error('Error getting user stats:', err);
      socket.emit('user_stats', { stats: null });
    }
  });

  // Get leaderboard
  socket.on('get_leaderboard', async () => {
    try {
      // Get all official signals grouped by author
      const { data: signals, error } = await supabase
        .from('official_posts_metadata')
        .select('author_username, outcome, pips_gained');

      if (error) {
        console.error('Error fetching leaderboard:', error);
        socket.emit('leaderboard_data', { leaderboard: [] });
        return;
      }

      // Group by author and calculate stats
      const userStats = {};

      signals.forEach(signal => {
        const author = signal.author_username;
        if (!userStats[author]) {
          userStats[author] = {
            username: author,
            totalSignals: 0,
            wonSignals: 0,
            lostSignals: 0,
            totalPips: 0
          };
        }

        userStats[author].totalSignals++;
        if (signal.outcome === 'won') userStats[author].wonSignals++;
        if (signal.outcome === 'lost') userStats[author].lostSignals++;
        userStats[author].totalPips += parseFloat(signal.pips_gained) || 0;
      });

      // Calculate win rates and create leaderboard array
      const leaderboard = Object.values(userStats)
        .map(user => ({
          ...user,
          winRate: user.wonSignals + user.lostSignals > 0
            ? ((user.wonSignals / (user.wonSignals + user.lostSignals)) * 100).toFixed(1)
            : 0,
          totalPips: user.totalPips.toFixed(2)
        }))
        .filter(user => user.wonSignals + user.lostSignals >= 3) // Minimum 3 closed signals
        .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))
        .slice(0, 10); // Top 10

      socket.emit('leaderboard_data', { leaderboard });

    } catch (err) {
      console.error('Error getting leaderboard:', err);
      socket.emit('leaderboard_data', { leaderboard: [] });
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

      // Broadcast to all clients (for admin dashboard)
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
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Connected to Supabase ✓');
});