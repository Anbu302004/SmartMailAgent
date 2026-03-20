const getHealth = (req, res) => {
  res.status(200).json({ message: 'Server running' });
};

module.exports = { getHealth };
