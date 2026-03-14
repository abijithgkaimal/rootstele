const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Telecaller Backend API',
      version: '1.0.0',
      description: 'API documentation for Telecaller CRM system',
    },
    servers: [
      { url: 'http://localhost:3000/api', description: 'Local' },
      { url: '/api', description: 'Relative (Render)' },
    ],
  },

  apis: [path.join(__dirname, './*.yaml')],
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

module.exports = {
  swaggerSpec,
  setupSwagger,
};