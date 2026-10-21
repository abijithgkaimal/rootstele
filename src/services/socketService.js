const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io = null;

/**
 * Initialize Socket.IO with HTTP Server and configure JWT auth middleware.
 * @param {import('http').Server} server
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Handshake authentication middleware
  io.use((socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!authHeader) {
        return next(new Error('Authentication token required'));
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const decoded = jwt.verify(token, env.jwtSecret);
      const rawEmpId = decoded.employeeId || decoded.userId;
      const employeeId = rawEmpId ? String(rawEmpId).replace(/\s+/g, '').toUpperCase() : '';

      if (!employeeId) {
        return next(new Error('Invalid token payload: missing employee ID'));
      }

      socket.user = {
        employeeId,
        name: decoded.name || employeeId,
        role: decoded.role || 'Telecaller',
      };

      next();
    } catch (err) {
      console.warn('[SocketService] Authentication failed:', err.message);
      next(new Error('Unauthorized socket connection'));
    }
  });

  const disconnectTimers = new Map();

  io.on('connection', async (socket) => {
    const { employeeId, name } = socket.user;
    const roomName = `room:telecaller_${employeeId}`;
    socket.join(roomName);

    // Cancel any pending disconnect timer for this employee if they reconnected/refreshed
    if (disconnectTimers.has(employeeId)) {
      clearTimeout(disconnectTimers.get(employeeId));
      disconnectTimers.delete(employeeId);
    }

    // Ensure user is marked online in database
    try {
      const User = require('../models/User');
      await User.findOneAndUpdate(
        { employeeId: { $regex: new RegExp(`^${employeeId}$`, 'i') } },
        { $set: { isOnline: true } }
      );
    } catch (e) {
      console.warn(`[SocketService] Failed to set isOnline for ${employeeId}:`, e.message);
    }

    console.log(`[SocketService] Connected: ${name} (${employeeId}) on socket ${socket.id}, joined ${roomName}`);

    socket.on('disconnect', (reason) => {
      console.log(`[SocketService] Disconnected: ${employeeId} (${reason})`);

      // Check if this employee has any other active sockets (e.g. other tabs)
      const activeSockets = io.sockets.adapter.rooms.get(roomName);
      if (!activeSockets || activeSockets.size === 0) {
        // Set a 2-minute grace period before marking offline (allows tab reload, transient drops)
        const timer = setTimeout(async () => {
          disconnectTimers.delete(employeeId);
          // Check again in case they reconnected right at the timer boundary
          const currentRoom = io.sockets.adapter.rooms.get(roomName);
          if (!currentRoom || currentRoom.size === 0) {
            try {
              const User = require('../models/User');
              await User.findOneAndUpdate(
                { employeeId: { $regex: new RegExp(`^${employeeId}$`, 'i') } },
                { $set: { isOnline: false, lastLogoutAt: new Date() } }
              );
              console.log(`[SocketService] 🔌 Marked telecaller ${employeeId} offline (all sockets disconnected for 2m)`);
            } catch (err) {
              console.warn(`[SocketService] Failed to set isOnline false for ${employeeId}:`, err.message);
            }
          }
        }, 120000); // 2 minutes grace period

        disconnectTimers.set(employeeId, timer);
      }
    });
  });

  return io;
};

/**
 * Get active Socket.IO server instance.
 */
const getIO = () => {
  return io;
};

/**
 * Emit an event to a specific telecaller's private room.
 * @param {string} employeeId - Telecaller's employeeId
 * @param {string} event - Event name
 * @param {object} data - Payload
 */
const emitToTelecaller = (employeeId, event, data) => {
  if (!io || !employeeId) return false;
  const normalized = String(employeeId).replace(/\s+/g, '').toUpperCase();
  const roomName = `room:telecaller_${normalized}`;
  io.to(roomName).emit(event, data);
  return true;
};

/**
 * Emit an event to all connected sockets.
 * @param {string} event - Event name
 * @param {object} data - Payload
 */
const emitToAllTelecallers = (event, data) => {
  if (!io) return false;
  io.emit(event, data);
  return true;
};

module.exports = {
  initSocket,
  getIO,
  emitToTelecaller,
  emitToAllTelecallers,
};
