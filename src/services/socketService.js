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

  io.on('connection', (socket) => {
    const { employeeId, name } = socket.user;
    const roomName = `room:telecaller_${employeeId}`;
    socket.join(roomName);

    console.log(`[SocketService] Connected: ${name} (${employeeId}) on socket ${socket.id}, joined ${roomName}`);

    socket.on('disconnect', (reason) => {
      console.log(`[SocketService] Disconnected: ${employeeId} (${reason})`);
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
