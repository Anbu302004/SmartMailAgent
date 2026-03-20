const AuthService = require('../services/auth.service');

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await AuthService.register({ name, email, password });
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const data = await AuthService.login({ email, password });
    res.status(200).json({ message: 'Login successful', ...data });
  } catch (err) {
    next(err);
  }
};

const profile = async (req, res, next) => {
  try {
    const user = await AuthService.getProfile(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, profile };
