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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ROOM_ACCESS = {
  free: ['general'],
  pro: ['general', 'forex', 'crypto'],
  premium: ['general', 'forex', 'crypto', 'stocks']
};

async function getOrCreateUser(username) {
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (existingUser) return existingUser;

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username, subscription_tier: 'free' }])
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return null;
    }

    await supabase.from('notification_preferences').insert([{ username }]);
    return newUser;
  } catch (err) {
    console.error('Error in getOrCreateUser:', err);
    return null;
  }
}

function hasRoomAccess(tier, room) {
  return ROOM_ACCESS[tier]?.includes(room) || false;
}

function canCreateOfficialPost(tier) {
  return tier === 'pro' || tier === 'premium';
}

function canCreatePrivateRoom(tier) {
  return tier === 'premium';
}

async function isPrivateRoom(roomId) {
  const { data } = await supabase
    .from('private_rooms')
    .select('id')
    .eq('room_id', roomId)
    .single();
  return !!data;
}

async function hasPrivateRoomAccess(username, roomId) {
  const { data } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('username', username)
    .single();
  return !!data;
}

async function getUserRoleInRoom(username, roomId) {
  const { data } = await supabase
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('username', username)
    .single();
  return data?.role || null;
}

async function createNotification(username, type, title, message, data = {}) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert([{ username, type, title, message, data }]);

    if (error) {
      console.error('Error creating notification:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error in createNotification:', err);
    return false;
  }
}

async function getFollowers(username) {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('follower_username')
      .eq('following_username', username);

    if (error) return [];
    return data.map(f => f.follower_username);
  } catch (err) {
    console.error('Error getting followers:', err);
    return [];
  }
}

async function getUserPreferences(username) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
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
    return null;
  }
}

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  let currentUser = null;

  socket.on('register_user', async (username) => {
    currentUser = await getOrCreateUser(username);
    if (currentUser) {
      socket.join(`user:${username}`); // ✅ ADD THIS

      socket.emit('user_registered', {
        username: currentUser.username,
        tier: currentUser.subscription_tier
      });
      console.log(`User registered: ${username} (${currentUser.subscription_tier})`);
    } else {
      socket.emit('registration_error', 'Failed to register user');
    }
  });


  socket.on('join_room', async ({ room, username }) => {
    const user = await getOrCreateUser(username);
    if (!user) {
      socket.emit('room_error', { message: 'User not found' });
      return;
    }

    const isPrivate = await isPrivateRoom(room);
    if (isPrivate) {
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
      if (!hasRoomAccess(user.subscription_tier, room)) {
        socket.emit('room_locked', {
          room,
          requiredTier: room === 'stocks' ? 'premium' : 'pro',
          message: `Upgrade to ${room === 'stocks' ? 'Premium' : 'Pro'} to access ${room} room`
        });
        return;
      }
    }

    const rooms = Array.from(socket.rooms);
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });

    socket.join(room);
    console.log(`User ${socket.id} (${username}) joined room: ${room}`);

    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room', room)
        .order('created_at', { ascending: true });

      if (!error) {
        socket.emit('previous_messages', messages);
        const officialSignalIds = messages
          .filter(m => m.is_official && m.type === 'signal')
          .map(m => m.id);

        if (officialSignalIds.length > 0) {
          const { data: metadata } = await supabase
            .from('official_posts_metadata')
            .select('*')
            .in('message_id', officialSignalIds);
          if (metadata) socket.emit('signal_metadata', { metadata });
        }
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const user = await getOrCreateUser(data.username);
      if (!user) {
        socket.emit('message_error', 'User not found');
        return;
      }

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

      if (data.is_official && !canCreateOfficialPost(user.subscription_tier)) {
        socket.emit('message_error', 'Only Pro and Premium users can create official posts');
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

      if (data.is_official && data.type === 'signal') {
        await supabase
          .from('official_posts_metadata')
          .insert([{
            message_id: newMessage.id,
            author_username: data.username,
            post_type: 'signal',
            outcome: 'pending',
            status: 'active'
          }]);
      }

      io.to(data.room).emit('new_message', newMessage);

      if (data.type === 'signal') {
        const followers = await getFollowers(data.username);
        for (const follower of followers) {
          const prefs = await getUserPreferences(follower);
          if (prefs && prefs.notify_followed_traders && prefs.notify_new_signals) {
            await createNotification(
              follower,
              'signal',
              `New Signal from ${data.username}`,
              `${data.signal.direction} ${data.signal.pair} - Entry: ${data.signal.entry}`,
              { signal_id: newMessage.id, trader: data.username }
            );
            io.to(`user:${follower}`).emit('new_notification', {
              username: follower,
              type: 'outcome',
              title: `Signal Closed: ${outcome.toUpperCase()}`,
              message: `${message.signal.pair} by ${message.username} closed ${outcome}`,
              created_at: new Date().toISOString(),
              read: false
            });


          }
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  socket.on('follow_user', async ({ follower, following }) => {
    try {
      const { error } = await supabase
        .from('user_follows')
        .insert([{ follower_username: follower, following_username: following }]);

      if (error) {
        socket.emit('follow_error', 'Already following');
        return;
      }

      socket.emit('follow_success', { following });
      await createNotification(following, 'follow', 'New Follower', `${follower} started following you!`, { follower });
      io.to(`user:${following}`).emit('new_notification', {
        username: following,
        type: 'follow',
        title: 'New Follower',
        message: `${follower} started following you!`,
        created_at: new Date().toISOString(),
        read: false
      });


    } catch (err) {
      console.error('Error following user:', err);
      socket.emit('follow_error', 'Failed to follow user');
    }
  });

  socket.on('unfollow_user', async ({ follower, following }) => {
    try {
      await supabase
        .from('user_follows')
        .delete()
        .eq('follower_username', follower)
        .eq('following_username', following);
      socket.emit('unfollow_success', { following });
    } catch (err) {
      console.error('Error unfollowing user:', err);
      socket.emit('unfollow_error', 'Failed to unfollow');
    }
  });

  socket.on('get_preferences', async (username) => {
    try {
      const prefs = await getUserPreferences(username);
      socket.emit('preferences_loaded', prefs);
    } catch (err) {
      console.error('Error loading preferences:', err);
    }
  });

  socket.on('update_preferences', async ({ username, preferences }) => {
    try {
      await supabase
        .from('notification_preferences')
        .upsert([{ username, ...preferences, updated_at: new Date().toISOString() }]);
      socket.emit('preferences_updated', preferences);
    } catch (err) {
      console.error('Error updating preferences:', err);
      socket.emit('preferences_error', 'Failed to update');
    }
  });

  socket.on('get_notifications', async (username) => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false })
        .limit(50);
      socket.emit('notifications_loaded', data || []);
    } catch (err) {
      console.error('Error getting notifications:', err);
    }
  });

  socket.on('mark_notification_read', async ({ notificationId }) => {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
    } catch (err) {
      console.error('Error:', err);
    }
  });

  socket.on('mark_all_read', async (username) => {
    try {
      await supabase.from('notifications').update({ read: true }).eq('username', username).eq('read', false);
      socket.emit('all_notifications_read');
    } catch (err) {
      console.error('Error:', err);
    }
  });

  socket.on('get_following', async (username) => {
    try {
      const { data } = await supabase
        .from('user_follows')
        .select('following_username')
        .eq('follower_username', username);
      socket.emit('following_list', { following: data?.map(f => f.following_username) || [] });
    } catch (err) {
      console.error('Error getting following:', err);
    }
  });

  socket.on('create_private_room', async ({ username, roomName, description }) => {
    try {
      const user = await getOrCreateUser(username);
      if (!user || !canCreatePrivateRoom(user.subscription_tier)) {
        socket.emit('room_error', { message: 'Only Premium users can create private rooms' });
        return;
      }

      const roomId = `private_${username}_${Date.now()}`;
      const { data: newRoom } = await supabase
        .from('private_rooms')
        .insert([{ room_id: roomId, name: roomName, description, owner_username: username }])
        .select()
        .single();

      await supabase.from('room_members').insert([{ room_id: roomId, username, role: 'owner' }]);
      socket.emit('room_created', { room: newRoom, message: 'Private room created' });
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('room_error', { message: 'Failed to create room' });
    }
  });

  socket.on('invite_to_room', async ({ roomId, inviterUsername, inviteeUsername }) => {
    try {
      const inviterRole = await getUserRoleInRoom(inviterUsername, roomId);
      if (!inviterRole || (inviterRole !== 'owner' && inviterRole !== 'moderator')) {
        socket.emit('room_error', { message: 'No permission to invite' });
        return;
      }

      const { data: invitation } = await supabase
        .from('room_invitations')
        .insert([{ room_id: roomId, inviter_username: inviterUsername, invitee_username: inviteeUsername, status: 'pending' }])
        .select()
        .single();

      socket.emit('invite_success', { roomId, username: inviteeUsername, message: `Invitation sent to ${inviteeUsername}` });
      io.emit('new_invitation', { inviteeUsername, invitation });
    } catch (err) {
      console.error('Error inviting user:', err);
      socket.emit('room_error', { message: 'Failed to invite' });
    }
  });

  socket.on('get_my_invitations', async ({ username }) => {
    try {
      const { data: invitations } = await supabase
        .from('room_invitations')
        .select('*, private_rooms(room_id, name, description, owner_username)')
        .eq('invitee_username', username)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      socket.emit('my_invitations', { invitations: invitations || [] });
    } catch (err) {
      console.error('Error fetching invitations:', err);
    }
  });

  socket.on('accept_invitation', async ({ invitationId, username }) => {
    try {
      const { data: invitation } = await supabase
        .from('room_invitations')
        .select('*')
        .eq('id', invitationId)
        .eq('invitee_username', username)
        .eq('status', 'pending')
        .single();

      if (!invitation) return;

      await supabase.from('room_members').insert([{ room_id: invitation.room_id, username, role: 'member' }]);
      await supabase.from('room_invitations').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', invitationId);
      socket.emit('invitation_accepted', { roomId: invitation.room_id, message: 'Invitation accepted!' });
      socket.emit('refresh_rooms');
    } catch (err) {
      console.error('Error accepting invitation:', err);
    }
  });

  socket.on('decline_invitation', async ({ invitationId, username }) => {
    try {
      await supabase.from('room_invitations').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', invitationId);
      socket.emit('invitation_declined', { message: 'Invitation declined' });
    } catch (err) {
      console.error('Error declining invitation:', err);
    }
  });

  socket.on('remove_from_room', async ({ roomId, removerUsername, removeUsername }) => {
    try {
      await supabase.from('room_members').delete().eq('room_id', roomId).eq('username', removeUsername);
      socket.emit('remove_success', { roomId, username: removeUsername, message: `${removeUsername} removed` });
    } catch (err) {
      console.error('Error removing user:', err);
    }
  });

  socket.on('get_my_rooms', async ({ username }) => {
    try {
      const { data: rooms } = await supabase
        .from('room_members')
        .select('room_id, role, private_rooms(room_id, name, description, owner_username)')
        .eq('username', username);
      socket.emit('my_rooms', { rooms: rooms || [] });
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  });

  socket.on('get_room_members', async ({ roomId }) => {
    try {
      const { data: members } = await supabase
        .from('room_members')
        .select('username, role, joined_at')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });
      socket.emit('room_members', { members: members || [] });
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  });

  socket.on('delete_room', async ({ roomId, username }) => {
    try {
      const { data: room } = await supabase.from('private_rooms').select('*').eq('room_id', roomId).single();
      if (!room || room.owner_username !== username) return;

      await supabase.from('messages').delete().eq('room', roomId);
      await supabase.from('room_invitations').delete().eq('room_id', roomId);
      await supabase.from('room_members').delete().eq('room_id', roomId);
      await supabase.from('private_rooms').delete().eq('room_id', roomId);
      io.emit('room_deleted', { roomId, roomName: room.name });
    } catch (err) {
      console.error('Error deleting room:', err);
    }
  });

  socket.on('delete_message', async ({ messageId, username, room }) => {
    try {
      const { data: message } = await supabase.from('messages').select('*').eq('id', messageId).eq('username', username).single();
      if (!message) return;

      await supabase.from('messages').delete().eq('id', messageId);
      io.to(room).emit('message_deleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });

  socket.on('update_signal_outcome', async ({ messageId, username, outcome, closePrice, closedBy }) => {
    try {
      const { data: message } = await supabase.from('messages').select('*').eq('id', messageId).single();
      if (!message || message.username !== username) return;

      let pipsGained = 0;
      if (closePrice && message.signal) {
        const entry = parseFloat(message.signal.entry);
        const close = parseFloat(closePrice);
        pipsGained = message.signal.direction === 'BUY' ? close - entry : entry - close;
      }

      await supabase
        .from('official_posts_metadata')
        .update({
          outcome,
          status: outcome === 'pending' ? 'active' : 'closed',
          closed_at: outcome === 'pending' ? null : new Date().toISOString(),
          close_price: closePrice || null,
          pips_gained: pipsGained,
          closed_by: closedBy || null
        })
        .eq('message_id', messageId);

      io.to(message.room).emit('signal_updated', { messageId, outcome, closePrice, pipsGained, closedBy });

      if (outcome !== 'pending') {
        const followers = await getFollowers(message.username);
        for (const follower of followers) {
          const prefs = await getUserPreferences(follower);
          if (prefs && prefs.notify_followed_traders && prefs.notify_signal_outcomes) {
            await createNotification(
              follower,
              'outcome',
              `Signal Closed: ${outcome.toUpperCase()}`,
              `${message.signal.pair} signal by ${message.username} closed ${outcome}`,
              { signal_id: messageId, outcome }
            );
            io.to(`user:${follower}`).emit('new_notification', {
              username: follower,
              type: 'signal',
              title: `New Signal from ${data.username}`,
              message: `${data.signal.direction} ${data.signal.pair}`,
              created_at: new Date().toISOString(),
              read: false
            });

          }
        }
      }
    } catch (err) {
      console.error('Error updating signal:', err);
    }
  });

  socket.on('get_user_stats', async ({ username }) => {
    try {
      const { data: signals } = await supabase
        .from('official_posts_metadata')
        .select('*')
        .eq('author_username', username);

      const totalSignals = signals?.length || 0;
      const wonSignals = signals?.filter(s => s.outcome === 'win').length || 0;
      const lostSignals = signals?.filter(s => s.outcome === 'loss').length || 0;
      const winRate = wonSignals + lostSignals > 0 ? ((wonSignals / (wonSignals + lostSignals)) * 100).toFixed(1) : 0;
      const totalPips = signals?.reduce((sum, s) => sum + (parseFloat(s.pips_gained) || 0), 0) || 0;

      socket.emit('user_stats', {
        stats: { totalSignals, wonSignals, lostSignals, winRate: parseFloat(winRate), totalPips: parseFloat(totalPips.toFixed(2)) }
      });
    } catch (err) {
      console.error('Error getting stats:', err);
    }
  });

  socket.on('get_leaderboard', async () => {
    try {
      const { data: signals } = await supabase.from('official_posts_metadata').select('author_username, outcome, pips_gained');
      const userStats = {};

      signals?.forEach(signal => {
        const author = signal.author_username;
        if (!userStats[author]) {
          userStats[author] = { username: author, totalSignals: 0, wonSignals: 0, lostSignals: 0, totalPips: 0 };
        }
        userStats[author].totalSignals++;
        if (signal.outcome === 'win') userStats[author].wonSignals++;
        if (signal.outcome === 'loss') userStats[author].lostSignals++;
        userStats[author].totalPips += parseFloat(signal.pips_gained) || 0;
      });

      const leaderboard = Object.values(userStats)
        .map(user => ({
          ...user,
          winRate: user.wonSignals + user.lostSignals > 0 ? ((user.wonSignals / (user.wonSignals + user.lostSignals)) * 100).toFixed(1) : 0,
          totalPips: user.totalPips.toFixed(2)
        }))
        .filter(user => user.wonSignals + user.lostSignals >= 3)
        .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))
        .slice(0, 10);

      socket.emit('leaderboard_data', { leaderboard });
    } catch (err) {
      console.error('Error getting leaderboard:', err);
    }
  });

  socket.on('upgrade_subscription', async ({ username, tier }) => {
    try {
      const { data: updatedUser } = await supabase
        .from('users')
        .update({ subscription_tier: tier, updated_at: new Date().toISOString() })
        .eq('username', username)
        .select()
        .single();

      socket.emit('upgrade_success', { username: updatedUser.username, tier: updatedUser.subscription_tier });
      io.emit('upgrade_success', { username: updatedUser.username, tier: updatedUser.subscription_tier });
    } catch (err) {
      console.error('Error upgrading:', err);
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