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
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (existingUser) {
      return existingUser;
    }
    
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

// Helper: Create notification
async function createNotification(username, type, title, message) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        username,
        type,
        title,
        message,
        read: false
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      return null;
    }

    // Emit real-time notification to user
    io.emit('new_notification', {
      username,
      ...data
    });

    return data;
  } catch (err) {
    console.error('Error in createNotification:', err);
    return null;
  }
}

// Helper: Get user's notification preferences
async function getUserPreferences(username) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      // Return default preferences
      return {
        browser_notifications: true,
        email_notifications: true,
        notify_new_signals: true,
        notify_signal_outcomes: true,
        notify_followed_traders: true,
        notify_mentions: true
      };
    }

    return data;
  } catch (err) {
    console.error('Error getting preferences:', err);
    return {
      browser_notifications: true,
      email_notifications: true,
      notify_new_signals: true,
      notify_signal_outcomes: true,
      notify_followed_traders: true,
      notify_mentions: true
    };
  }
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
    const user = await getOrCreateUser(username);
    
    if (!user) {
      socket.emit('room_error', { message: 'User not found' });
      return;
    }
    
    // Check if it's a private room
    const { data: privateRoom } = await supabase
      .from('private_rooms')
      .select('*')
      .eq('room_id', room)
      .single();

    if (privateRoom) {
      // Check if user is a member
      const { data: membership } = await supabase
        .from('private_room_members')
        .select('*')
        .eq('room_id', room)
        .eq('username', username)
        .single();

      if (!membership) {
        socket.emit('room_locked', {
          room,
          requiredTier: 'premium',
          message: 'You need to be invited to this private room'
        });
        return;
      }
    } else {
      // Check access for public rooms
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

        // Load signal metadata for official signals
        const officialSignals = messages.filter(m => m.is_official && m.type === 'signal');
        if (officialSignals.length > 0) {
          const messageIds = officialSignals.map(m => m.id);
          const { data: metadata } = await supabase
            .from('official_posts_metadata')
            .select('*')
            .in('message_id', messageIds);

          socket.emit('signal_metadata', { metadata: metadata || [] });
        }
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  });
  
  // Send message
  socket.on('send_message', async (data) => {
    try {
      const user = await getOrCreateUser(data.username);
      if (!user || !hasRoomAccess(user.subscription_tier, data.room)) {
        socket.emit('message_error', 'No access to this room');
        return;
      }
      
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([data])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving message:', error);
        return;
      }
      
      io.to(data.room).emit('new_message', newMessage);
      console.log(`Message saved and broadcast to room ${data.room}:`, newMessage.id);

      // Create notifications for followers if it's a signal
      if (data.type === 'signal') {
        const { data: followers } = await supabase
          .from('follows')
          .select('follower')
          .eq('following', data.username);

        if (followers && followers.length > 0) {
          for (const follower of followers) {
            const prefs = await getUserPreferences(follower.follower);
            if (prefs.notify_followed_traders && prefs.notify_new_signals) {
              await createNotification(
                follower.follower,
                'signal',
                `New Signal from ${data.username}`,
                `${data.signal.direction} ${data.signal.pair} - Entry: ${data.signal.entry}`
              );
            }
          }
        }
      }
      
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Delete message
  socket.on('delete_message', async ({ messageId, username, room }) => {
    try {
      const { data: message } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (!message || message.username !== username) {
        socket.emit('message_error', 'Cannot delete this message');
        return;
      }

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Error deleting message:', error);
        return;
      }

      io.to(room).emit('message_deleted', { messageId });
      console.log(`Message ${messageId} deleted`);
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });

  // Update signal outcome
  socket.on('update_signal_outcome', async ({ messageId, username, outcome, closePrice, closedBy }) => {
    try {
      const { data: message } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (!message || message.username !== username || !message.is_official) {
        socket.emit('signal_error', { message: 'Cannot update this signal' });
        return;
      }

      const pipsGained = calculatePips(message.signal.direction, message.signal.entry, closePrice);

      const { data: metadata, error } = await supabase
        .from('official_posts_metadata')
        .upsert({
          message_id: messageId,
          outcome,
          close_price: closePrice,
          pips_gained: pipsGained,
          closed_by: closedBy,
          closed_at: new Date().toISOString()
        }, { onConflict: 'message_id' })
        .select()
        .single();

      if (error) {
        console.error('Error updating signal outcome:', error);
        socket.emit('signal_error', { message: 'Failed to update signal' });
        return;
      }

      io.emit('signal_updated', {
        messageId,
        outcome,
        closePrice,
        pipsGained,
        closedBy,
        closedAt: metadata.closed_at
      });

      socket.emit('signal_update_success', { message: 'Signal updated successfully' });

      // Notify followers
      const { data: followers } = await supabase
        .from('follows')
        .select('follower')
        .eq('following', username);

      if (followers && followers.length > 0) {
        const outcomeText = outcome === 'win' ? '✅ Won' : '❌ Lost';
        for (const follower of followers) {
          const prefs = await getUserPreferences(follower.follower);
          if (prefs.notify_followed_traders && prefs.notify_signal_outcomes) {
            await createNotification(
              follower.follower,
              'outcome',
              `Signal Update: ${username}`,
              `${message.signal.pair} signal ${outcomeText} - ${pipsGained > 0 ? '+' : ''}${pipsGained.toFixed(1)} pips`
            );
          }
        }
      }

    } catch (err) {
      console.error('Error updating signal outcome:', err);
      socket.emit('signal_error', { message: 'Failed to update signal' });
    }
  });
  
  // Upgrade subscription
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

  // Create private room
  socket.on('create_private_room', async ({ username, roomName, description }) => {
    try {
      const user = await getOrCreateUser(username);
      if (user.subscription_tier !== 'premium') {
        socket.emit('room_error', { message: 'Premium subscription required' });
        return;
      }

      const { data: room, error } = await supabase
        .from('private_rooms')
        .insert([{
          name: roomName,
          description,
          owner_username: username
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating private room:', error);
        socket.emit('room_error', { message: 'Failed to create room' });
        return;
      }

      await supabase
        .from('private_room_members')
        .insert([{
          room_id: room.room_id,
          username,
          role: 'owner'
        }]);

      socket.emit('room_created', { room });
      io.emit('refresh_rooms');
      console.log(`Private room created: ${roomName} by ${username}`);

    } catch (err) {
      console.error('Error creating private room:', err);
      socket.emit('room_error', { message: 'Failed to create room' });
    }
  });

  // Get user's private rooms
  socket.on('get_my_rooms', async ({ username }) => {
    try {
      const { data: memberships } = await supabase
        .from('private_room_members')
        .select('*, private_rooms(*)')
        .eq('username', username);

      socket.emit('my_rooms', { rooms: memberships || [] });
    } catch (err) {
      console.error('Error getting rooms:', err);
    }
  });

  // Get room members
  socket.on('get_room_members', async ({ roomId }) => {
    try {
      const { data: members } = await supabase
        .from('private_room_members')
        .select('*')
        .eq('room_id', roomId);

      socket.emit('room_members', { members: members || [] });
    } catch (err) {
      console.error('Error getting room members:', err);
    }
  });

  // Invite user to room
  socket.on('invite_to_room', async ({ roomId, inviterUsername, inviteeUsername }) => {
    try {
      const { data: existing } = await supabase
        .from('private_room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('username', inviteeUsername)
        .single();

      if (existing) {
        socket.emit('invite_success', { message: 'User is already a member' });
        return;
      }

      const { data: invitation, error } = await supabase
        .from('room_invitations')
        .insert([{
          room_id: roomId,
          inviter_username: inviterUsername,
          invitee_username: inviteeUsername
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating invitation:', error);
        socket.emit('room_error', { message: 'Failed to send invitation' });
        return;
      }

      socket.emit('invite_success', { message: `Invitation sent to ${inviteeUsername}` });
      io.emit('new_invitation', { inviteeUsername });

      // Create notification
      const { data: room } = await supabase
        .from('private_rooms')
        .select('name')
        .eq('room_id', roomId)
        .single();

      await createNotification(
        inviteeUsername,
        'room_invite',
        'Room Invitation',
        `${inviterUsername} invited you to join "${room?.name || 'Private Room'}"`
      );

    } catch (err) {
      console.error('Error inviting user:', err);
    }
  });

  // Remove user from room
  socket.on('remove_from_room', async ({ roomId, removerUsername, removeUsername }) => {
    try {
      const { error } = await supabase
        .from('private_room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('username', removeUsername);

      if (error) {
        console.error('Error removing user:', error);
        return;
      }

      socket.emit('remove_success', { message: `${removeUsername} removed from room` });
      io.emit('refresh_rooms');
    } catch (err) {
      console.error('Error removing user:', err);
    }
  });

  // Get pending invitations
  socket.on('get_my_invitations', async ({ username }) => {
    try {
      const { data: invitations } = await supabase
        .from('room_invitations')
        .select('*, private_rooms(*)')
        .eq('invitee_username', username)
        .eq('status', 'pending');

      socket.emit('my_invitations', { invitations: invitations || [] });
    } catch (err) {
      console.error('Error getting invitations:', err);
    }
  });

  // Accept invitation
  socket.on('accept_invitation', async ({ invitationId, username }) => {
    try {
      const { data: invitation } = await supabase
        .from('room_invitations')
        .select('*')
        .eq('id', invitationId)
        .single();

      if (!invitation) {
        socket.emit('room_error', { message: 'Invitation not found' });
        return;
      }

      await supabase
        .from('private_room_members')
        .insert([{
          room_id: invitation.room_id,
          username,
          role: 'member'
        }]);

      await supabase
        .from('room_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitationId);

      socket.emit('invitation_accepted', { message: 'Invitation accepted!' });
      io.emit('refresh_rooms');

    } catch (err) {
      console.error('Error accepting invitation:', err);
    }
  });

  // Decline invitation
  socket.on('decline_invitation', async ({ invitationId, username }) => {
    try {
      await supabase
        .from('room_invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId);

      socket.emit('invitation_declined', { message: 'Invitation declined' });
    } catch (err) {
      console.error('Error declining invitation:', err);
    }
  });

  // Delete room
  socket.on('delete_room', async ({ roomId, username }) => {
    try {
      const { data: room } = await supabase
        .from('private_rooms')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (!room || room.owner_username !== username) {
        socket.emit('delete_room_error', 'You do not have permission to delete this room');
        return;
      }

      await supabase.from('private_room_members').delete().eq('room_id', roomId);
      await supabase.from('room_invitations').delete().eq('room_id', roomId);
      await supabase.from('messages').delete().eq('room', roomId);
      await supabase.from('private_rooms').delete().eq('room_id', roomId);

      io.emit('room_deleted', { roomId, roomName: room.name });

    } catch (err) {
      console.error('Error deleting room:', err);
      socket.emit('delete_room_error', 'Failed to delete room');
    }
  });

  // Follow user
  socket.on('follow_user', async ({ follower, following }) => {
    try {
      if (follower === following) {
        socket.emit('follow_error', 'You cannot follow yourself');
        return;
      }

      const { data: existing } = await supabase
        .from('follows')
        .select('*')
        .eq('follower', follower)
        .eq('following', following)
        .single();

      if (existing) {
        socket.emit('follow_error', 'Already following this user');
        return;
      }

      const { error } = await supabase
        .from('follows')
        .insert([{ follower, following }]);

      if (error) {
        console.error('Error following user:', error);
        socket.emit('follow_error', 'Failed to follow user');
        return;
      }

      socket.emit('follow_success', { following });
      
      // Notify the followed user
      await createNotification(
        following,
        'follow',
        'New Follower',
        `${follower} started following you`
      );

    } catch (err) {
      console.error('Error following user:', err);
      socket.emit('follow_error', 'Failed to follow user');
    }
  });

  // Unfollow user
  socket.on('unfollow_user', async ({ follower, following }) => {
    try {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower', follower)
        .eq('following', following);

      if (error) {
        console.error('Error unfollowing user:', error);
        socket.emit('unfollow_error', 'Failed to unfollow user');
        return;
      }

      socket.emit('unfollow_success', { following });

    } catch (err) {
      console.error('Error unfollowing user:', err);
      socket.emit('unfollow_error', 'Failed to unfollow user');
    }
  });

  // Get following list
  socket.on('get_following', async (username) => {
    try {
      const { data: follows } = await supabase
        .from('follows')
        .select('following')
        .eq('follower', username);

      const following = follows ? follows.map(f => f.following) : [];
      socket.emit('following_list', { following });

    } catch (err) {
      console.error('Error getting following list:', err);
    }
  });

  // Get notifications
  socket.on('get_notifications', async (username) => {
    try {
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false })
        .limit(50);

      socket.emit('notifications_loaded', notifications || []);
    } catch (err) {
      console.error('Error getting notifications:', err);
    }
  });

  // Mark notification as read
  socket.on('mark_notification_read', async ({ notificationId }) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      socket.emit('notification_marked_read', { notificationId });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  });

  // Mark all notifications as read
  socket.on('mark_all_read', async (username) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('username', username);

      socket.emit('all_notifications_read');
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  });

  // Get notification preferences
  socket.on('get_preferences', async (username) => {
    try {
      const prefs = await getUserPreferences(username);
      socket.emit('preferences_loaded', prefs);
    } catch (err) {
      console.error('Error getting preferences:', err);
    }
  });

  // Update notification preferences
  socket.on('update_preferences', async ({ username, preferences }) => {
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          username,
          ...preferences,
          updated_at: new Date().toISOString()
        }, { onConflict: 'username' });

      if (error) {
        console.error('Error updating preferences:', error);
        socket.emit('preferences_error');
        return;
      }

      socket.emit('preferences_updated');
    } catch (err) {
      console.error('Error updating preferences:', err);
      socket.emit('preferences_error');
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Helper function to calculate pips
function calculatePips(direction, entry, closePrice) {
  if (!entry || !closePrice) return 0;
  const pips = direction === 'BUY'
    ? (closePrice - entry)
    : (entry - closePrice);
  return pips * 10000;
}

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Connected to Supabase ✓');
});