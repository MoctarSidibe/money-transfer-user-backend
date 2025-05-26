const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();

// Configure CORS to allow requests from Netlify frontend
app.use(cors({
  origin: ['https://charming-phoenix-cb0bda.netlify.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
const uri = process.env.MONGODB_URI || 'mongodb+srv://Moctar:<Karamoco>@cluster0.sacmkzq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({
  id: Number,
  name: String,
  surname: String,
  email: { type: String, unique: true },
  password: String,
  country: String,
  userType: { type: String, default: 'individual' },
  businessName: String,
  businessDescription: String,
  address: String,
  token: String,
  receiveMethod: String,
  receiveDetails: String,
  sendMethod: String,
  role: { type: String, default: 'user' },
  profilePic: String,
});

const TransactionSchema = new mongoose.Schema({
  localAmount: Number,
  localCurrency: String,
  recipient: String,
  recipientName: String,
  sendMethod: String,
  receiveMethod: String,
  senderCountry: String,
  receiverCountry: String,
  timestamp: Date,
  transferFee: Number,
  gasFee: Number,
  senderEmail: String,
});

const FriendSchema = new mongoose.Schema({
  userEmail: String,
  email: String,
  name: String,
  surname: String,
});

const LeaveRequestSchema = new mongoose.Schema({
  id: Number,
  employeeName: String,
  startDate: String,
  endDate: String,
  reason: String,
  status: { type: String, default: 'pending' },
  timestamp: String,
});

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  token: String,
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Friend = mongoose.model('Friend', FriendSchema);
const LeaveRequest = mongoose.model('LeaveRequest', LeaveRequestSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// Load admins from environment variable (for now)
const loadAdmins = () => {
  const adminData = process.env.ADMIN_DATA || '[]';
  Admin.insertMany(JSON.parse(adminData))
    .then(() => console.log('Admins loaded from env'))
    .catch(err => console.error('Error loading admins:', err));
};
loadAdmins();

// Register endpoint
app.post('/register', async (req, res) => {
  const { name, surname, email, password, country, userType, businessName, businessDescription, role } = req.body;
  if (!email || !password || !name || (userType === 'business' && !businessName)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = new User({
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
    });
    await user.save();
    if (userType === 'business') {
      axios.post('https://money-transfer-business-backend.onrender.com/register-business', {
        email,
        password: hashedPassword,
        country,
        businessName,
        businessDescription,
      }).catch(err => console.error('Error syncing with business server:', err));
    }
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Please enter both email and password' });
  try {
    const user = await User.findOne({ email });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ ...user.toObject(), token: user.token });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Admin login endpoint
app.post('/admin-login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Admin login attempt:', { email, password });
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const emailTrimmed = email.trim().toLowerCase();
    const passwordTrimmed = password.trim();
    const admin = await Admin.findOne({ email: emailTrimmed });
    if (!admin || admin.password !== passwordTrimmed) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    res.json({ email: admin.email, isAdmin: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error during admin login' });
  }
});

// Leave management endpoints
app.get('/leave-requests', async (req, res) => {
  const { token } = req.query;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const requests = await LeaveRequest.find();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching leave requests' });
  }
});

app.get('/stats', async (req, res) => {
  const { token } = req.query;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const requests = await LeaveRequest.find();
    const stats = {
      total: requests.length,
      approved: requests.filter(r => r.status === 'approved').length,
      pending: requests.filter(r => r.status === 'pending').length,
      rejected: requests.filter(r => r.status === 'rejected').length,
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching stats' });
  }
});

app.post('/leave-requests', async (req, res) => {
  const { employeeName, startDate, endDate, reason, status = 'pending', token } = req.body;
  if (!employeeName || !startDate || !endDate || !reason || !token) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const newRequest = new LeaveRequest({
      employeeName,
      startDate,
      endDate,
      reason,
      status,
      timestamp: new Date().toISOString(),
    });
    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating leave request' });
  }
});

app.put('/leave-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { status, token } = req.body;
  if (!token || !token.startsWith('mock-token-')) return res.status(401).json({ error: 'Unauthorized' });
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const request = await LeaveRequest.findOneAndUpdate(
      { id: parseInt(id) },
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating leave request' });
  }
});

// Existing endpoints (update similarly)
app.get('/search-user', async (req, res) => {
  const { q, token } = req.query;
  if (!q || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid query or token' });
  try {
    const user = await User.findOne({ $or: [{ email: q }, { name: { $regex: q, $options: 'i' } }, { surname: { $regex: q, $options: 'i' } }] });
    res.json(user || null);
  } catch (error) {
    res.status(500).json({ error: 'Server error searching user' });
  }
});

app.post('/transfer', async (req, res) => {
  const { amount, recipient, sendMethod, receiveMethod, senderCountry, receiverCountry, recipientName, transferFee, gasFee, senderEmail, token } = req.body;
  if (!amount || !recipient || !senderEmail || !token || !token.startsWith('mock-token-')) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const transaction = new Transaction({
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
    });
    await transaction.save();
    res.json({ transactionId: 'mock-transaction-id-' + Date.now() });
  } catch (error) {
    res.status(500).json({ error: 'Server error processing transfer' });
  }
});

app.get('/transactions', async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid email or token' });
  try {
    const userTransactions = await Transaction.find({ senderEmail: email });
    res.json(userTransactions);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching transactions' });
  }
});

app.get('/friends', async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid email or token' });
  try {
    const userFriends = await Friend.find({ userEmail: email });
    res.json(userFriends);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching friends' });
  }
});

app.post('/add-friend', async (req, res) => {
  const { userEmail, searchQuery, token } = req.body;
  if (!userEmail || !searchQuery || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  try {
    const friend = await User.findOne({ $or: [{ email: searchQuery }, { name: { $regex: searchQuery, $options: 'i' } }, { surname: { $regex: searchQuery, $options: 'i' } }] });
    if (friend) {
      const newFriend = new Friend({ userEmail, ...friend.toObject() });
      await newFriend.save();
      res.json(friend);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error adding friend' });
  }
});

app.post('/remove-friend', async (req, res) => {
  const { userEmail, friendEmail, token } = req.body;
  if (!userEmail || !friendEmail || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  try {
    await Friend.deleteOne({ userEmail, email: friendEmail });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error removing friend' });
  }
});

app.post('/update-settings', async (req, res) => {
  const { email, receiveMethod, receiveDetails, sendMethod, token } = req.body;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  try {
    const user = await User.findOneAndUpdate(
      { email },
      { receiveMethod, receiveDetails, sendMethod },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating settings' });
  }
});

app.post('/update-profile', async (req, res) => {
  const { email, name, surname, businessName, businessDescription, profilePic, token } = req.body;
  if (!email || !token || !token.startsWith('mock-token-')) return res.status(400).json({ error: 'Invalid input' });
  try {
    const user = await User.findOneAndUpdate(
      { email },
      {
        name,
        surname: user.userType === 'individual' ? surname : user.surname,
        businessName: user.userType === 'business' ? businessName : user.businessName,
        businessDescription: user.userType === 'business' ? businessDescription : user.businessDescription,
        profilePic,
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

app.get('/admin/fees', async (req, res) => {
  const { token } = req.query;
  if (!token || !await Admin.findOne({ token })) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ baseFee: 1, percentageFee: 0.005 });
});

app.get('/transaction-status/:id', async (req, res) => {
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Main server running on port ${PORT}`));