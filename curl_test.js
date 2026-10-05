const express = require('express');
const app = express();
app.use(express.json());
app.post('/', (req, res) => res.json({ success: true }));
app.use((err, req, res, next) => res.status(400).json({ success: false, message: err.message, data: null }));
app.listen(3001, () => console.log('started'));
