// Add this socket handler to server/index.js

// Around line 280 (after get_my_rooms handler, before upgrade_subscription)

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