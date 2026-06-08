const bcrypt = require('bcryptjs');
const hash = '$2a$10$kwTq9fwQEC4Cy1oe20hubuCxQ69kXhYX0qnDFrZuQOHxnVVFUShCS';
console.log('Hash:', hash);
console.log('Match 123456:', bcrypt.compareSync('123456', hash));
const newHash = bcrypt.hashSync('123456', 10);
console.log('New hash:', newHash);
console.log('New verify:', bcrypt.compareSync('123456', newHash));
