const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'allan',
  password: '',
  database: 'waterquality'
});
module.exports = connection;
