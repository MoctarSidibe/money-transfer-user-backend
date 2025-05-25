const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const axios = require('axios');
const fs = require('fs');
const path = require('path'); // Add path module for better file path handling
const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

let users = [];
let transactions = [];
let friends = [];
let leaveRequests = [];
const usersFilePath = './users.json';
const transactionsFilePath = './transactions.json';
const friendsFilePath = './friends.json';
const leaveRequestsFilePath = './leave-requests.json';

// Load data from files on startup
const loadData = () => {
  try {
    if (fs.existsSync(usersFilePath)) users = JSON.parse(fs.readFileSync(usersFilePath));
    if (fs.existsSync(transactionsFilePath)) transactions = JSON.parse(fs.readFileSync(transactionsFilePath));
    if (fs.existsSync(friendsFilePath)) friends = JSON.parse(fs.readFileSync(friendsFilePath));
    if (fs.existsSync(leaveRequestsFilePath)) leaveRequests = JSON.parse(fs.readFileSync(leaveRequestsFilePath));
    console.log('Data loaded:', { users: users.length, transactions: transactions.length, friends: friends.length, leaveRequests: leaveRequests.length });
  } catch (error) {
    console.error('Error loading data:', error.message);
    users = [];
    transactions = [];
    friends = [];
    leaveRequests = [];
  }
};

// Save data to files
const saveData = () => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    fs.writeFileSync(transactionsFilePath, JSON.stringify(transactions, null, 2));
    fs.writeFileSync(friendsFilePath, JSON.stringify(friends, null, 2));
    fs.writeFileSync(leaveRequestsFilePath, JSON.stringify(leaveRequests, null, 2));
    console.log('Data saved to files');
  } catch (error) {
    console.error('Error saving data:', error.message);
  }
};

// Load data on startup
loadData();

// Load admins from admin.json
const adminFilePath = path.resolve(__dirname, 'admin.json'); // Use absolute path
console.log('Resolved admin file path:', adminFilePath); // Log the resolved path
let admins = [];
try {
  if (fs.existsSync(adminFilePath)) {
    const adminData = fs.readFileSync(adminFilePath, 'utf8');
    console.log('Raw admin.json content:', adminData); // Log raw file content
    admins = JSON.parse(adminData);
    console.log('Admins loaded successfully:', admins);
  } else {
    console.log('admin.json file does not exist at:', adminFilePath);
  }
} catch (error) {
  console.error('Error loading admins:', error.message);
  admins = [];
}
console.log('Admins loaded:', admins.length);

// Register endpoint
app.post('/register', (req, res) => {
  const { name, surname, email, password, country, userType, businessName, businessDescription, role } = req.body;
  if (!email || !password || !name || (userType === 'business' && !businessName)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (users.some(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = {
    id: users.length ? users[users.length - 1].id + 1 : 1,
    name,
    surname,
    email,
    password: hashedPassword,
    country,
    userType: userType || 'individual',
    businessName: userType === 'business' ? businessName : null,
    businessDescription: userType === 'business' ? businessDescription : null,
    address: '0x' + Math.random().toString(16).slice(2),
    token: 'mock-token-' + Math.random().toString(36).substr(2),
    receiveMethod: null,
    receiveDetails: null,
    sendMethod: null,
    role: role || 'user',
    profilePic: null,
  };
  users.push(user);
  saveData();
  if (userType === 'business') {
    axios.post('http://localhost:5002/register-business', {
      email,
      password: hashedPassword,
      country,
      businessName,
      businessDescription,
    }).catch(err => console.error('Error syncing with business server:', err));
  }
  res.status(201).json(user);
});

// Login endpoint
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Please enter both email and password' });
  const user = users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ ...user, token: user.token });
});

// Admin login endpoint
app.post('/admin-login', (req, res) => {
  const { email, password } = req.body;
  console.log('Admin login attempt:', { email, password });
  console.log('Admins:', admins);
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const emailTrimmed = email.trim().toLowerCase();
  const passwordTrimmed = password.trim();
  const admin = admins.find(a => {
    const emailMatch = a.email.toLowerCase() === emailTrimmed;
    const passwordMatch = a.password === passwordTrimmed;
    console.log('Comparing:', { 
      storedEmail: a.email.toLowerCase(), 
      inputEmail: emailTrimmed, 
      emailMatch, 
      storedPassword: a.password, 
      inputPassword: passwordTrimmed, 
      passwordMatch 
    });
    return emailMatch && passwordMatch;
  });
  if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });
  res.json({ email: admin.email, isAdmin: true });
});

// Leave management endpoints
app.get('/leave-requests', (req, res) => {
  const { token } = req.query;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  res.json(leaveRequests);
});

app.get('/stats', (req, res) => {
  const { token } = req.query;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  const stats = {
    total: leaveRequests.length,
    approved: leaveRequests.filter(r => r.status === 'approved').length,
    pending: leaveRequests.filter(r => r.status === 'pending').length,
    rejected: leaveRequests.filter(r => r.status === 'rejected').length,
  };
  res.json(stats);
});

app.post('/leave-requests', (req, res) => {
  const { employeeName, startDate, endDate, reason, status = 'pending', token } = req.body;
  if (!employeeName || !startDate || !endDate || !reason || !token) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  const newRequest = {
    id: leaveRequests.length ? leaveRequests[leaveRequests.length - 1].id + 1 : 1,
    employeeName,
    startDate,
    endDate,
    reason,
    status,
    timestamp: new Date().toISOString(),
  };
  leaveRequests.push(newRequest);
  saveData();
  res.status(201).json(newRequest);
});

app.put('/leave-requests/:id', (req, res) => {
  const { id } = req.params;
  const { status, token } = req.body;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const requestIndex = leaveRequests.findIndex(r => r.id === parseInt(id));
  if (requestIndex === -1) return res.status(404).json({ error: 'Leave request not found' });
  leaveRequests[requestIndex].status = status;
  saveData();
  res.json(leaveRequests[requestIndex]);
});

// Existing endpoints
app.get('/search-user', (req, res) => {
  const { q, token } = req.query;
  if (!q || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid query or token' });
  const user = users.find(u => u.email === q || u.name.includes(q) || u.surname.includes(q));
  res.json(user || null);
});

app.post('/transfer', (req, res) => {
  const { amount, recipient, sendMethod, receiveMethod, senderCountry, receiverCountry, recipientName, transferFee, gasFee, senderEmail, token } = req.body;
  if (!amount || !recipient || !senderEmail || !token || !token.startsWith('mock-token-')) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const transaction = {
    localAmount: amount,
    localCurrency: receiverCountry === 'Gabon' ? 'XAF' : 'USD',
    recipient,
    recipientName,
    sendMethod,
    receiveMethod,
    senderCountry,
    receiverCountry,
    timestamp: new Date(),
    transferFee,
    gasFee,
    senderEmail,
  };
  transactions.push(transaction);
  saveData();
  res.json({ transactionId: 'mock-transaction-id-' + Date.now() });
});

app.get('/transactions', (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid email or token' });
  const userTransactions = transactions.filter(tx => tx.senderEmail === email);
  res.json(userTransactions);
});

app.get('/friends', (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid email or token' });
  const userFriends = friends.filter(f => f.userEmail === email);
  res.json(userFriends);
});

app.post('/add-friend', (req, res) => {
  const { userEmail, searchQuery, token } = req.body;
  if (!userEmail || !searchQuery || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  const friend = users.find(u => u.email === searchQuery || u.name.includes(searchQuery) || u.surname.includes(searchQuery));
  if (friend) {
    friends.push({ userEmail, ...friend });
    saveData();
    res.json(friend);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/remove-friend', (req, res) => {
  const { userEmail, friendEmail, token } = req.body;
  if (!userEmail || !friendEmail || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  friends = friends.filter(f => !(f.userEmail === userEmail && f.email === friendEmail));
  saveData();
  res.json({ success: true });
});

app.post('/update-settings', (req, res) => {
  const { email, receiveMethod, receiveDetails, sendMethod, token } = req.body;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex !== -1) {
    users[userIndex] = { ...users[userIndex], receiveMethod, receiveDetails, sendMethod };
    saveData();
    res.json(users[userIndex]);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/update-profile', (req, res) => {
  const { email, name, surname, businessName, businessDescription, profilePic, token } = req.body;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex !== -1) {
    users[userIndex] = {
      ...users[userIndex],
      name,
      surname: users[userIndex].userType === 'individual' ? surname : users[userIndex].surname,
      businessName: users[userIndex].userType === 'business' ? businessName : users[userIndex].businessName,
      businessDescription: users[userIndex].userType === 'business' ? businessDescription : users[userIndex].businessDescription,
      profilePic,
    };
    saveData();
    res.json(users[userIndex]);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.get('/admin/fees', (req, res) => {
  const { token } = req.query;
  if (!token || !admins.some(a => a.token === token)) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ baseFee: 1, percentageFee: 0.005 });
});

app.get('/transaction-status/:id', (req, res) => {
  const { token } = req.query;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ status: 'Completed' });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 413 && 'body' in err) {
    return res.status(413).json({ error: 'Request entity too large. Please upload a smaller file (max 10MB).' });
  }
  next();
});

app.listen(5000, () => console.log('Main server running on port 5000'));